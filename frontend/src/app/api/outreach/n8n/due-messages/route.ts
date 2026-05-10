import { NextRequest, NextResponse } from "next/server";
import { verifyOutreachWebhook, getPublicAppUrl, outreachDeliveryConfig } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type DueMessageRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  user_id: string;
  step: string;
  status: string;
  outreach_campaigns: any;
  outreach_leads: any;
};

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(25, Number(body.batch_limit || 5)));
    const delivery = outreachDeliveryConfig();
    const supabase = createAdminSupabase();

    const { data, error } = await supabase
      .from("outreach_messages")
      .select("*, outreach_campaigns(*), outreach_leads(*)")
      .eq("status", "queued")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ messages: [], warning: error.message });
    }

    const rows = (data || []) as DueMessageRow[];
    if (rows.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const ids = rows.map((row) => row.id);
    await supabase.from("outreach_messages").update({ status: "sending" }).in("id", ids);

    const messages = rows.map((row) => {
      const campaign = row.outreach_campaigns || {};
      const lead = row.outreach_leads || {};
      return {
        id: row.id,
        message_id: row.id,
        campaign_id: row.campaign_id,
        lead_id: row.lead_id,
        user_id: row.user_id,
        email_connection_id: campaign.email_connection_id || null,
        step: row.step,
        approved_templates: campaign.approved_templates || campaign.generated_templates || null,
        sender: {
          name: delivery.senderName || campaign.sender_name || "ExportFlow",
          email: delivery.smtp.fromEmail || campaign.sender_email || ""
        },
        campaign: {
          id: campaign.id,
          tone: campaign.tone,
          cta: campaign.cta,
          offer: campaign.offer,
          signature: campaign.signature,
          target_buyer: campaign.target_buyer,
          sender_name: campaign.sender_name
        },
        lead: {
          id: lead.id,
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          email: lead.email,
          original_email: lead.email,
          website: lead.website,
          notes: lead.notes,
          evidence: lead.evidence || {}
        }
      };
    });

    return NextResponse.json({ messages, appUrl: getPublicAppUrl(), test_mode: delivery.testMode, test_recipient: delivery.testRecipient });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch due outreach messages.";
    return NextResponse.json({ messages: [], warning: message });
  }
}
