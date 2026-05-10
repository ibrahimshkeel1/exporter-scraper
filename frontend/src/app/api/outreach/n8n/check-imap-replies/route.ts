import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { verifyOutreachWebhook, outreachDeliveryConfig } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";
import {
  decryptSecret,
  EmailConnectionRow,
  findUserEmailConnection,
  refreshGoogleAccessToken
} from "../../../../../lib/email-connections";

type ReplyCandidate = {
  id: string;
  campaign_id: string;
  lead_id: string;
  sent_at: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  user_id: string;
  outreach_leads?: {
    id?: string;
    email?: string | null;
    status?: string | null;
  } | null;
  outreach_campaigns?: {
    id?: string;
    email_connection_id?: string | null;
  } | null;
};

type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function normalizeMessageId(value: unknown) {
  return clean(value).replace(/[<>]/g, "").toLowerCase();
}

function parseHeaders(source: Buffer | string | undefined) {
  const text = Buffer.isBuffer(source) ? source.toString("utf8") : String(source || "");
  const headerBlock = text.split(/\r?\n\r?\n/, 1)[0] || "";
  const lines = headerBlock.split(/\r?\n/);
  const headers = new Map<string, string>();
  let current = "";

  for (const line of lines) {
    if (!line) continue;

    if (/^\s/.test(line) && current) {
      headers.set(current, `${headers.get(current) || ""} ${line.trim()}`.trim());
      continue;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    current = line.slice(0, separator).trim().toLowerCase();
    headers.set(current, line.slice(separator + 1).trim());
  }

  return headers;
}

function referencesFromHeaders(headers: Map<string, string>) {
  const values = [headers.get("in-reply-to") || "", headers.get("references") || ""].join(" ");
  return values
    .split(/\s+/)
    .map(normalizeMessageId)
    .filter(Boolean);
}

function referencesFromText(value: string) {
  return value
    .split(/\s+/)
    .map(normalizeMessageId)
    .filter(Boolean);
}

function gmailHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const match = (headers || []).find((item) => clean(item.name).toLowerCase() === name.toLowerCase());
  return clean(match?.value);
}

function gmailAfterDate(value: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

async function resolveConnection(
  supabase: ReturnType<typeof createAdminSupabase>,
  cache: Map<string, EmailConnectionRow | null>,
  candidate: ReplyCandidate
) {
  const connectionId = clean(candidate.outreach_campaigns?.email_connection_id);
  const cacheKey = connectionId || `user:${candidate.user_id}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) || null;

  const connection = await findUserEmailConnection(supabase, candidate.user_id, connectionId || null);
  cache.set(cacheKey, connection);
  return connection;
}

async function findGoogleReplies(
  supabase: ReturnType<typeof createAdminSupabase>,
  connection: EmailConnectionRow,
  candidates: ReplyCandidate[]
) {
  const token = await refreshGoogleAccessToken(supabase, connection);
  const repliedLeadIds: string[] = [];

  for (const candidate of candidates) {
    const leadEmail = clean(candidate.outreach_leads?.email).toLowerCase();
    const reference = normalizeMessageId(candidate.gmail_message_id || candidate.gmail_thread_id);
    if (!leadEmail || !reference) continue;

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", "10");
    listUrl.searchParams.set("q", `from:${leadEmail} after:${gmailAfterDate(candidate.sent_at)}`);

    const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listPayload = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok) throw new Error(listPayload.error?.message || "Gmail reply check failed.");

    const messages = Array.isArray(listPayload.messages) ? (listPayload.messages as Array<{ id?: string }>) : [];
    for (const message of messages) {
      if (!message.id) continue;

      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`);
      detailUrl.searchParams.set("format", "metadata");
      ["From", "In-Reply-To", "References", "Date"].forEach((header) => detailUrl.searchParams.append("metadataHeaders", header));

      const detailResponse = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
      const detailPayload = await detailResponse.json().catch(() => ({}));
      if (!detailResponse.ok) throw new Error(detailPayload.error?.message || "Gmail message metadata check failed.");

      const headers = detailPayload.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      const fromEmail = extractEmail(gmailHeader(headers, "From"));
      const refs = referencesFromText(`${gmailHeader(headers, "In-Reply-To")} ${gmailHeader(headers, "References")}`);
      const internalDate = Number(detailPayload.internalDate || 0);
      const sentAt = candidate.sent_at ? Date.parse(candidate.sent_at) : 0;

      if (fromEmail !== leadEmail) continue;
      if (sentAt && internalDate && internalDate <= sentAt) continue;
      if (refs.includes(reference) && !repliedLeadIds.includes(candidate.lead_id)) {
        repliedLeadIds.push(candidate.lead_id);
      }
    }
  }

  return repliedLeadIds;
}

async function findImapReplies(config: ImapConfig, candidates: ReplyCandidate[], limit: number) {
  const candidatesByReference = new Map<string, ReplyCandidate>();
  for (const candidate of candidates) {
    const referenceId = normalizeMessageId(candidate.gmail_message_id || candidate.gmail_thread_id);
    if (referenceId) candidatesByReference.set(referenceId, candidate);
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  const repliedLeadIds: string[] = [];

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);

  try {
    const exists = client.mailbox ? client.mailbox.exists : 0;
    const fetchCount = Math.max(limit * 25, 100);
    const start = Math.max(1, exists - fetchCount + 1);

    for await (const message of client.fetch(`${start}:*`, { envelope: true, source: true })) {
      const item = message as {
        source?: Buffer | string;
        envelope?: {
          date?: Date;
        };
      };
      const headers = parseHeaders(item.source);
      const fromEmail = extractEmail(headers.get("from") || "");
      const refs = referencesFromHeaders(headers);
      if (!fromEmail || refs.length === 0) continue;

      const replyDateValue = item.envelope?.date || new Date(headers.get("date") || "");
      const replyDate = replyDateValue instanceof Date && !Number.isNaN(replyDateValue.getTime()) ? replyDateValue.getTime() : 0;

      for (const ref of refs) {
        const candidate = candidatesByReference.get(ref);
        if (!candidate) continue;
        const leadEmail = clean(candidate.outreach_leads?.email).toLowerCase();
        const sentAt = candidate.sent_at ? Date.parse(candidate.sent_at) : 0;
        if (!leadEmail || fromEmail !== leadEmail) continue;
        if (replyDate && sentAt && replyDate <= sentAt) continue;
        if (repliedLeadIds.includes(candidate.lead_id)) continue;

        repliedLeadIds.push(candidate.lead_id);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return repliedLeadIds;
}

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(50, Number(body.limit || 10)));
  const delivery = outreachDeliveryConfig();

  if (delivery.testMode) {
    return NextResponse.json({ ok: true, checked: 0, replied: 0, warning: "Reply checks are skipped while outreach test mode is enabled." });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("outreach_messages")
    .select("id,campaign_id,lead_id,user_id,sent_at,gmail_message_id,gmail_thread_id,outreach_leads(id,email,status),outreach_campaigns(id,email_connection_id)")
    .in("status", ["sent", "test_sent"])
    .order("sent_at", { ascending: false })
    .limit(limit * 5);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const candidates = ((data || []) as ReplyCandidate[]).filter((row) => {
    const leadStatus = clean(row.outreach_leads?.status);
    const referenceId = normalizeMessageId(row.gmail_message_id || row.gmail_thread_id);
    return Boolean(referenceId && row.outreach_leads?.email) && !["replied", "failed", "unsubscribed"].includes(leadStatus);
  });

  const latestByLead = new Map<string, ReplyCandidate>();
  for (const row of candidates) {
    if (!latestByLead.has(row.lead_id)) {
      latestByLead.set(row.lead_id, row);
    }
    if (latestByLead.size >= limit) break;
  }

  if (latestByLead.size === 0) {
    return NextResponse.json({ ok: true, checked: 0, replied: 0 });
  }

  const connectionCache = new Map<string, EmailConnectionRow | null>();
  const googleGroups = new Map<string, { connection: EmailConnectionRow; candidates: ReplyCandidate[] }>();
  const smtpGroups = new Map<string, { config: ImapConfig; candidates: ReplyCandidate[] }>();
  const envCandidates: ReplyCandidate[] = [];

  for (const candidate of latestByLead.values()) {
    const connection = await resolveConnection(supabase, connectionCache, candidate);

    if (connection?.provider === "google") {
      const group = googleGroups.get(connection.id) || { connection, candidates: [] };
      group.candidates.push(candidate);
      googleGroups.set(connection.id, group);
      continue;
    }

    if (connection?.provider === "smtp") {
      const host = clean(connection.imap_host);
      const user = clean(connection.imap_username);
      const pass = decryptSecret(connection.imap_password_encrypted);
      if (host && user && pass) {
        const group = smtpGroups.get(connection.id) || {
          config: {
            host,
            port: Number(connection.imap_port || 993),
            secure: connection.imap_secure ?? true,
            user,
            pass,
            mailbox: clean(connection.imap_mailbox) || "INBOX"
          },
          candidates: []
        };
        group.candidates.push(candidate);
        smtpGroups.set(connection.id, group);
        continue;
      }
    }

    envCandidates.push(candidate);
  }

  const warnings: string[] = [];
  const repliedLeadIds: string[] = [];

  for (const group of googleGroups.values()) {
    try {
      const found = await findGoogleReplies(supabase, group.connection, group.candidates);
      found.forEach((leadId) => {
        if (!repliedLeadIds.includes(leadId)) repliedLeadIds.push(leadId);
      });
    } catch (googleError) {
      warnings.push(googleError instanceof Error ? googleError.message : "Gmail reply check failed.");
    }
  }

  for (const group of smtpGroups.values()) {
    try {
      const found = await findImapReplies(group.config, group.candidates, limit);
      found.forEach((leadId) => {
        if (!repliedLeadIds.includes(leadId)) repliedLeadIds.push(leadId);
      });
    } catch (imapError) {
      warnings.push(imapError instanceof Error ? imapError.message : "IMAP reply check failed.");
    }
  }

  if (envCandidates.length > 0) {
    if (delivery.imap.host && delivery.imap.port && delivery.imap.user && delivery.imap.pass) {
      try {
        const found = await findImapReplies(
          {
            host: delivery.imap.host,
            port: delivery.imap.port,
            secure: delivery.imap.secure,
            user: delivery.imap.user,
            pass: delivery.imap.pass,
            mailbox: delivery.imap.mailbox
          },
          envCandidates,
          limit
        );
        found.forEach((leadId) => {
          if (!repliedLeadIds.includes(leadId)) repliedLeadIds.push(leadId);
        });
      } catch (imapError) {
        warnings.push(imapError instanceof Error ? imapError.message : "IMAP reply check failed.");
      }
    } else {
      warnings.push("Some campaigns have no connected sender and no IMAP fallback is configured.");
    }
  }

  if (repliedLeadIds.length > 0) {
    await supabase.from("outreach_leads").update({ status: "replied" }).in("id", repliedLeadIds);
    await supabase
      .from("outreach_messages")
      .update({ status: "skipped", error_message: "Stopped because a reply was detected." })
      .in("lead_id", repliedLeadIds)
      .in("status", ["queued", "sending"]);
  }

  return NextResponse.json({
    ok: true,
    checked: latestByLead.size,
    replied: repliedLeadIds.length,
    replied_lead_ids: repliedLeadIds,
    warning: warnings.length ? warnings.join(" | ") : undefined
  });
}
