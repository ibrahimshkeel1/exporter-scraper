import { NextRequest, NextResponse } from "next/server";
import { verifyOutreachWebhook, testSender } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type ReplyCandidate = {
  id: string;
  campaign_id: string;
  lead_id: string;
  sent_at: string | null;
  gmail_thread_id: string | null;
  outreach_leads?: {
    id?: string;
    email?: string | null;
    status?: string | null;
  } | null;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessage = {
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
  };
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function readHeader(message: GmailMessage, name: string) {
  const headers = Array.isArray(message.payload?.headers) ? message.payload?.headers : [];
  const matched = headers.find((header) => clean(header.name).toLowerCase() === name.toLowerCase());
  return clean(matched?.value);
}

async function fetchThread(accessToken: string, threadId: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(clean(payload.error?.message || payload.error || `Gmail thread lookup failed with HTTP ${response.status}`));
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(50, Number(body.limit || 10)));
  const sender = testSender();

  if (sender.testMode) {
    return NextResponse.json({ ok: true, checked: 0, replied: 0, warning: "Reply checks are skipped while outreach test mode is enabled." });
  }

  if (!sender.accessToken || !sender.email) {
    return NextResponse.json({ ok: true, checked: 0, replied: 0, warning: "Gmail sender credentials are not configured for reply checks." });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("outreach_messages")
    .select("id,campaign_id,lead_id,sent_at,gmail_thread_id,outreach_leads(id,email,status)")
    .in("status", ["sent", "test_sent"])
    .not("gmail_thread_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limit * 3);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = ((data || []) as ReplyCandidate[]).filter((row) => {
    const leadStatus = clean(row.outreach_leads?.status);
    return Boolean(row.gmail_thread_id && row.outreach_leads?.email) && !["replied", "failed", "unsubscribed"].includes(leadStatus);
  });

  const latestByLead = new Map<string, ReplyCandidate>();
  for (const row of rows) {
    if (!latestByLead.has(row.lead_id)) {
      latestByLead.set(row.lead_id, row);
    }
    if (latestByLead.size >= limit) break;
  }

  let checked = 0;
  let replied = 0;
  const repliedLeadIds: string[] = [];
  const senderEmail = sender.email.toLowerCase();

  for (const row of latestByLead.values()) {
    checked += 1;

    try {
      const thread = await fetchThread(sender.accessToken, clean(row.gmail_thread_id));
      const messages = Array.isArray(thread.messages) ? (thread.messages as GmailMessage[]) : [];
      const leadEmail = clean(row.outreach_leads?.email).toLowerCase();
      const sentAt = row.sent_at ? Date.parse(row.sent_at) : 0;

      const hasReply = messages.some((message) => {
        const fromEmail = extractEmail(readHeader(message, "From"));
        const internalDate = Number(message.internalDate || 0);
        const headerDate = Date.parse(readHeader(message, "Date"));
        const messageTime = Number.isFinite(internalDate) && internalDate > 0 ? internalDate : headerDate;

        return Boolean(fromEmail) && fromEmail === leadEmail && fromEmail !== senderEmail && Number.isFinite(messageTime) && messageTime > sentAt;
      });

      if (!hasReply) continue;

      replied += 1;
      repliedLeadIds.push(row.lead_id);

      await supabase.from("outreach_leads").update({ status: "replied" }).eq("id", row.lead_id);
      await supabase
        .from("outreach_messages")
        .update({ status: "skipped", error_message: "Stopped because a reply was detected in the Gmail thread." })
        .eq("lead_id", row.lead_id)
        .in("status", ["queued", "sending"]);
    } catch {
      continue;
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    replied,
    replied_lead_ids: repliedLeadIds
  });
}
