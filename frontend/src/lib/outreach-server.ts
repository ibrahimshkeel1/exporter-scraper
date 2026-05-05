import { NextRequest } from "next/server";
import { createAdminSupabase } from "./supabase-admin";
import { OutreachLeadInput, normalizeOutreachLead } from "./outreach";

export function verifyOutreachWebhook(request: NextRequest) {
  const expected = outreachWebhookSecret();
  if (!expected) return true;
  return request.headers.get("x-exportflow-secret") === expected;
}

function outreachWebhookSecret() {
  return process.env.N8N_OUTREACH_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET || "";
}

export function getPublicAppUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}

export async function postN8nWebhook(url: string | undefined, payload: Record<string, unknown>) {
  if (!url) {
    return { ok: false, error: "n8n outreach webhook URL is not configured." };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(outreachWebhookSecret() ? { "x-exportflow-secret": outreachWebhookSecret() } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, error: `n8n webhook failed with HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}` };
  }

  return { ok: true };
}

export async function getCampaignForUser(campaignId: string, userId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("outreach_campaigns")
    .select("*, outreach_leads(*), outreach_messages(*)")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return { campaign: null, error: error?.message || "Campaign not found." };
  }

  return { campaign: data, error: null };
}

export function toLeadRows(campaignId: string, userId: string, leads: OutreachLeadInput[]) {
  return leads
    .map(normalizeOutreachLead)
    .filter((lead): lead is OutreachLeadInput => Boolean(lead))
    .map((lead) => ({
      campaign_id: campaignId,
      user_id: userId,
      source: lead.source || "pasted",
      contact_name: lead.contact_name || null,
      company_name: lead.company_name || null,
      email: lead.email || null,
      website: lead.website || null,
      notes: lead.notes || null,
      evidence: lead.evidence || {}
    }));
}

export function testSender() {
  return {
    email: process.env.OUTREACH_TEST_GMAIL_FROM_EMAIL || "",
    name: process.env.OUTREACH_TEST_SENDER_NAME || "ExportFlow",
    accessToken: process.env.OUTREACH_TEST_GMAIL_ACCESS_TOKEN || "",
    testMode: String(process.env.OUTREACH_TEST_MODE || "true").toLowerCase() !== "false",
    testRecipient: process.env.OUTREACH_TEST_RECIPIENT || ""
  };
}

export function stepSentLeadStatus(step: string) {
  if (step === "followup_1") return "followup_1_sent";
  if (step === "followup_2") return "followup_2_sent";
  return "initial_sent";
}

export function nextPendingStatus(step: string) {
  if (step === "followup_1") return "followup_1_pending";
  if (step === "followup_2") return "followup_2_pending";
  return "queued";
}
