import { NextRequest, NextResponse } from "next/server";
import { nextPendingStatus, verifyOutreachWebhook } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type SentMessage = {
  campaign_id: string;
  lead_id: string;
  user_id: string;
  sent_at: string | null;
  outreach_leads?: { status?: string } | null;
};

function thresholdDate(body: Record<string, unknown>) {
  const afterMinutes = Number(body.after_minutes || 0);
  if (afterMinutes > 0) {
    return new Date(Date.now() - afterMinutes * 60 * 1000);
  }
  const afterDays = Number(body.after_days || 3);
  return new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
}

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const step = String(body.step || "followup_1");
  const previousStep = step === "followup_2" ? "followup_1" : "initial";
  const fromStatus = String(body.from_status || (step === "followup_2" ? "followup_1_sent" : "initial_sent"));
  const toStatus = String(body.to_status || nextPendingStatus(step));
  const dueBefore = thresholdDate(body);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("outreach_messages")
    .select("campaign_id,lead_id,user_id,sent_at,outreach_leads(status)")
    .eq("step", previousStep)
    .in("status", ["sent", "test_sent"])
    .lte("sent_at", dueBefore.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = ((data || []) as SentMessage[]).filter((item) => item.outreach_leads?.status === fromStatus);
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, queued: 0 });
  }

  const rows = candidates.map((item) => ({
    campaign_id: item.campaign_id,
    lead_id: item.lead_id,
    user_id: item.user_id,
    step,
    status: "queued",
    scheduled_for: new Date().toISOString()
  }));

  const { error: insertError } = await supabase.from("outreach_messages").upsert(rows, {
    onConflict: "campaign_id,lead_id,step",
    ignoreDuplicates: true
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase.from("outreach_leads").update({ status: toStatus }).in("id", candidates.map((item) => item.lead_id));

  return NextResponse.json({ ok: true, queued: rows.length });
}
