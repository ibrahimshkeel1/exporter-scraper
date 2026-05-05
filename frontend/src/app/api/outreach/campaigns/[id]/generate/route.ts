import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../../../lib/supabase-admin";
import { getCampaignForUser, postN8nWebhook } from "../../../../../../lib/outreach-server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await context.params;
  const { campaign, error: campaignError } = await getCampaignForUser(id, user.id);
  if (!campaign) {
    return NextResponse.json({ error: campaignError }, { status: 404 });
  }

  const supabase = createAdminSupabase();
  await supabase.from("outreach_campaigns").update({ status: "generating", error_message: null }).eq("id", id);

  const trigger = await postN8nWebhook(process.env.N8N_OUTREACH_GENERATE_WEBHOOK_URL, { campaign_id: id });
  if (!trigger.ok) {
    await supabase.from("outreach_campaigns").update({ status: "failed", error_message: trigger.error }).eq("id", id);
    return NextResponse.json({ error: trigger.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Template generation sent to n8n." });
}
