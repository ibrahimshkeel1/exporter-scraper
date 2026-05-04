import { NextRequest, NextResponse } from "next/server";
import { verifyOutreachWebhook } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json();
  const campaignId = String(body.campaign_id || body.campaignId || "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: campaign, error: campaignError } = await supabase
    .from("outreach_campaigns")
    .select("*, outreach_leads(*)")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message || "Campaign not found." }, { status: 404 });
  }

  const leads = campaign.outreach_leads || [];
  const messageRows = leads.map((lead: { id: string; user_id: string }) => ({
    campaign_id: campaign.id,
    lead_id: lead.id,
    user_id: lead.user_id,
    step: "initial",
    status: "queued",
    scheduled_for: new Date().toISOString()
  }));

  if (messageRows.length > 0) {
    const { error: messageError } = await supabase.from("outreach_messages").upsert(messageRows, {
      onConflict: "campaign_id,lead_id,step",
      ignoreDuplicates: true
    });
    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }
  }

  await supabase.from("outreach_leads").update({ status: "queued" }).eq("campaign_id", campaignId).eq("status", "draft");
  await supabase.from("outreach_campaigns").update({ status: "active", error_message: null }).eq("id", campaignId);

  return NextResponse.json({ ok: true, queued: messageRows.length });
}
