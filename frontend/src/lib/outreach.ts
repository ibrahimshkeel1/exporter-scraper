export type OutreachCampaignStatus =
  | "draft"
  | "generating"
  | "template_ready"
  | "launching"
  | "active"
  | "completed"
  | "failed";

export type OutreachLeadStatus =
  | "draft"
  | "queued"
  | "initial_sent"
  | "followup_1_pending"
  | "followup_1_sent"
  | "followup_2_pending"
  | "followup_2_sent"
  | "failed"
  | "replied"
  | "unsubscribed";

export type OutreachMessageStatus = "draft" | "queued" | "sending" | "sent" | "test_sent" | "failed" | "skipped";
export type OutreachStep = "initial" | "followup_1" | "followup_2";

export type OutreachLeadInput = {
  contact_name?: string;
  company_name?: string;
  email?: string;
  website?: string;
  notes?: string;
  source?: "pasted" | "scraper";
  evidence?: Record<string, unknown>;
};

export type OutreachCampaign = {
  id: string;
  user_id: string;
  email_connection_id: string | null;
  status: OutreachCampaignStatus;
  business_plan: string;
  offer: string;
  target_buyer: string;
  tone: string;
  cta: string;
  signature: string;
  sender_name: string;
  sender_email: string | null;
  generated_templates: Record<string, unknown> | null;
  approved_templates: Record<string, unknown> | null;
  last_n8n_payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  outreach_leads?: OutreachLead[];
  outreach_messages?: OutreachMessage[];
};

export type OutreachLead = {
  id: string;
  campaign_id: string;
  user_id: string;
  source: "pasted" | "scraper";
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  evidence: Record<string, unknown>;
  status: OutreachLeadStatus;
  created_at: string;
  updated_at: string;
};

export type OutreachMessage = {
  id: string;
  campaign_id: string;
  lead_id: string;
  user_id: string;
  step: OutreachStep;
  status: OutreachMessageStatus;
  scheduled_for: string;
  sent_at: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  generated: Record<string, unknown>;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  to_email: string | null;
  original_to_email: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeOutreachLead(input: OutreachLeadInput): OutreachLeadInput | null {
  const email = String(input.email || "").trim();
  const companyName = String(input.company_name || "").trim();
  const contactName = String(input.contact_name || "").trim();
  const website = String(input.website || "").trim();
  const notes = String(input.notes || "").trim();

  if (!email && !companyName && !website) {
    return null;
  }

  return {
    contact_name: contactName || null || undefined,
    company_name: companyName || null || undefined,
    email: email || null || undefined,
    website: website || null || undefined,
    notes: notes || null || undefined,
    source: input.source || "pasted",
    evidence: input.evidence || {}
  };
}

export function parsePastedLeads(value: string): OutreachLeadInput[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split(/,|\t/).map((item) => item.trim());
      const emailIndex = columns.findIndex((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
      const email = emailIndex >= 0 ? columns[emailIndex] : "";
      const remaining = columns.filter((_item, index) => index !== emailIndex);
      return normalizeOutreachLead({
        company_name: remaining[0] || "",
        contact_name: remaining[1] || "",
        email,
        website: remaining.find((item) => /^https?:\/\//i.test(item) || /\.[a-z]{2,}$/i.test(item)) || "",
        notes: line,
        source: "pasted"
      });
    })
    .filter((lead): lead is OutreachLeadInput => Boolean(lead))
    .slice(0, 50);
}
