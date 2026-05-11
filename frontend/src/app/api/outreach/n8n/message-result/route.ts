import { NextRequest, NextResponse } from "next/server";
import { stepSentLeadStatus, verifyOutreachWebhook } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json();
  const messageId = String(body.message_id || body.id || "").trim();
  if (!messageId) {
    return NextResponse.json({ error: "message_id is required." }, { status: 400 });
  }

  const status = String(body.status || "test_sent");
  const supabase = createAdminSupabase();
  const { data: message, error: messageError } = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("id", messageId)
    .single();

  if (messageError || !message) {
    return NextResponse.json({ error: messageError?.message || "Message not found." }, { status: 404 });
  }

  const success = status === "sent" || status === "test_sent";
  const update = {
    status: success ? status : "failed",
    subject: body.subject || null,
    body_html: body.body_html || null,
    body_text: body.body_text || null,
    generated: body.generated || {},
    gmail_message_id: body.gmail_message_id || null,
    gmail_thread_id: body.gmail_thread_id || null,
    to_email: body.to_email || null,
    original_to_email: body.original_to_email || null,
    sent_at: success ? body.sent_at || new Date().toISOString() : null,
    error_message: success ? null : String(body.error || body.message || "n8n send failed.")
  };

  const { error: updateError } = await supabase.from("outreach_messages").update(update).eq("id", messageId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (success) {
    await supabase
      .from("outreach_leads")
      .update({ status: stepSentLeadStatus(message.step) })
      .eq("id", message.lead_id);
  } else {
    await supabase.from("outreach_leads").update({ status: "failed" }).eq("id", message.lead_id);
  }

  return NextResponse.json({ ok: true });
}
