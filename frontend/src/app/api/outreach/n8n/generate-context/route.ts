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
  const { data: campaign, error } = await supabase
    .from("outreach_campaigns")
    .select("*, outreach_leads(*)")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: error?.message || "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({
    campaign_id: campaign.id,
    business_plan: campaign.business_plan,
    offer: campaign.offer,
    target_buyer: campaign.target_buyer,
    tone: campaign.tone,
    cta: campaign.cta,
    signature: campaign.signature,
    sender: {
      name: campaign.sender_name,
      email: campaign.sender_email
    },
    leads: campaign.outreach_leads || []
  });
}
