import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { verifyOutreachWebhook, outreachDeliveryConfig } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type ReplyCandidate = {
  id: string;
  campaign_id: string;
  lead_id: string;
  sent_at: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  outreach_leads?: {
    id?: string;
    email?: string | null;
    status?: string | null;
  } | null;
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

  if (!delivery.imap.host || !delivery.imap.port || !delivery.imap.user || !delivery.imap.pass) {
    return NextResponse.json({ ok: true, checked: 0, replied: 0, warning: "IMAP credentials are not configured for reply checks." });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("outreach_messages")
    .select("id,campaign_id,lead_id,sent_at,gmail_message_id,gmail_thread_id,outreach_leads(id,email,status)")
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
  const candidatesByReference = new Map<string, ReplyCandidate>();
  for (const row of candidates) {
    if (!latestByLead.has(row.lead_id)) {
      latestByLead.set(row.lead_id, row);
      candidatesByReference.set(normalizeMessageId(row.gmail_message_id || row.gmail_thread_id), row);
    }
    if (latestByLead.size >= limit) break;
  }

  if (latestByLead.size === 0) {
    return NextResponse.json({ ok: true, checked: 0, replied: 0 });
  }

  const client = new ImapFlow({
    host: delivery.imap.host,
    port: delivery.imap.port,
    secure: delivery.imap.secure,
    auth: {
      user: delivery.imap.user,
      pass: delivery.imap.pass
    }
  });

  let checked = 0;
  let replied = 0;
  const repliedLeadIds: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(delivery.imap.mailbox);

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
  } catch (imapError) {
    return NextResponse.json({
      ok: true,
      checked: latestByLead.size,
      replied: 0,
      warning: imapError instanceof Error ? imapError.message : "IMAP reply check failed."
    });
  }

  checked = latestByLead.size;
  replied = repliedLeadIds.length;

  if (repliedLeadIds.length > 0) {
    await supabase.from("outreach_leads").update({ status: "replied" }).in("id", repliedLeadIds);
    await supabase
      .from("outreach_messages")
      .update({ status: "skipped", error_message: "Stopped because a reply was detected through IMAP." })
      .in("lead_id", repliedLeadIds)
      .in("status", ["queued", "sending"]);
  }

  return NextResponse.json({
    ok: true,
    checked,
    replied,
    replied_lead_ids: repliedLeadIds
  });
}
