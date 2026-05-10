import { NextRequest, NextResponse } from "next/server";
import { verifyOutreachWebhook } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const campaignId = String(body.campaign_id || body.campaignId || "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }

  const generated = body.generated && typeof body.generated === "object" ? body.generated : { raw_text: String(body.generated || "") };
  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("outreach_campaigns")
    .update({
      generated_templates: generated,
      approved_templates: generated,
      last_n8n_payload: body,
      status: "template_ready",
      error_message: null
    })
    .eq("id", campaignId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
