import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../../../lib/supabase-admin";
import { getCampaignForUser, outreachDeliveryConfig, postN8nWebhook } from "../../../../../../lib/outreach-server";
import { findUserEmailConnection } from "../../../../../../lib/email-connections";

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
  const delivery = outreachDeliveryConfig();
  const connection = await findUserEmailConnection(supabase, user.id, campaign.email_connection_id || null);
  if (!connection && !delivery.smtp.host) {
    return NextResponse.json({ error: "Connect an email account before launching this campaign." }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: "launching", error_message: null };
  if (connection?.id || "email_connection_id" in campaign) {
    update.email_connection_id = connection?.id || campaign.email_connection_id || null;
  }

  await supabase
    .from("outreach_campaigns")
    .update(update)
    .eq("id", id);

  const launch = await postN8nWebhook(process.env.N8N_OUTREACH_LAUNCH_WEBHOOK_URL, { campaign_id: id });
  if (!launch.ok) {
    await supabase.from("outreach_campaigns").update({ status: "failed", error_message: launch.error }).eq("id", id);
    return NextResponse.json({ error: launch.error }, { status: 500 });
  }

  const send = await postN8nWebhook(process.env.N8N_OUTREACH_SEND_WEBHOOK_URL, { reason: "manual_test_send", campaign_id: id });
  const warning = send.ok ? null : send.error || "Send webhook is not configured; wait for the n8n schedule or trigger Send Due Emails manually.";

  return NextResponse.json({
    ok: true,
    warning,
    message: warning ? "Campaign launched; send-now webhook was not triggered." : "Campaign launched and send-now webhook triggered."
  });
}
