import { NextRequest, NextResponse } from "next/server";
import { testSender, verifyOutreachWebhook } from "../../../../../lib/outreach-server";

type SequenceStep = {
  subject?: string;
  body_text?: string;
  body_html?: string;
};

type LeadSequence = {
  lead_id?: string;
  email?: string;
  company_name?: string;
  initial?: SequenceStep | string;
  followup_1?: SequenceStep | string;
  followup_2?: SequenceStep | string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanHeader(value: unknown) {
  return clean(value).replace(/[\r\n]+/g, " ");
}

function asStep(value: unknown): SequenceStep {
  if (!value) return {};
  if (typeof value === "string") {
    return { body_text: value };
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return {
      subject: clean(source.subject),
      body_text: clean(source.body_text || source.body || source.text),
      body_html: clean(source.body_html || source.html)
    };
  }

  return { body_text: clean(value) };
}

function htmlFromText(value: string) {
  const text = clean(value);
  if (!text) return "";

  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function findLeadSequence(generated: Record<string, unknown> | null | undefined, lead: Record<string, unknown>) {
  if (!generated) return null;

  const sequences = Array.isArray(generated.sequences) ? (generated.sequences as LeadSequence[]) : [];
  const leadId = clean(lead.id);
  const leadEmail = clean(lead.original_email || lead.email).toLowerCase();
  const companyName = clean(lead.company_name).toLowerCase();

  const matched = sequences.find((sequence) => {
    const sequenceEmail = clean(sequence.email).toLowerCase();
    const sequenceCompany = clean(sequence.company_name).toLowerCase();
    return (
      clean(sequence.lead_id) === leadId ||
      (leadEmail && sequenceEmail && leadEmail === sequenceEmail) ||
      (companyName && sequenceCompany && companyName === sequenceCompany)
    );
  });

  if (matched) return matched;

  if (generated.initial_template || generated.followup_1_template || generated.followup_2_template) {
    return {
      lead_id: leadId,
      email: leadEmail,
      company_name: companyName,
      initial: asStep(generated.initial_template),
      followup_1: asStep(generated.followup_1_template),
      followup_2: asStep(generated.followup_2_template)
    };
  }

  return null;
}

function pickStep(sequence: LeadSequence | null, templates: Record<string, unknown>, step: string) {
  if (step === "followup_1") {
    return asStep(sequence?.followup_1 || templates.followup_1_template);
  }
  if (step === "followup_2") {
    return asStep(sequence?.followup_2 || templates.followup_2_template);
  }
  return asStep(sequence?.initial || templates.initial_template);
}

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sender = testSender();
  const messageId = clean(body.message_id || body.id);
  const step = clean(body.step || "initial");
  const lead = body.lead && typeof body.lead === "object" ? (body.lead as Record<string, unknown>) : {};
  const campaign = body.campaign && typeof body.campaign === "object" ? (body.campaign as Record<string, unknown>) : {};
  const templates = body.approved_templates && typeof body.approved_templates === "object" ? (body.approved_templates as Record<string, unknown>) : {};

  if (!messageId) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "message_id is required." });
  }

  const sequence = findLeadSequence(templates, lead);
  const stepContent = pickStep(sequence, templates, step);
  const subject = cleanHeader(stepContent.subject || `Quick question for ${clean(lead.company_name) || "your team"}`);
  const bodyText = clean(stepContent.body_text);
  let bodyHtml = clean(stepContent.body_html) || htmlFromText(bodyText);
  const originalToEmail = clean(lead.original_email || lead.email || body.original_to_email || body.to_email);
  const toEmail = sender.testMode ? clean(sender.testRecipient) : originalToEmail;
  const fromEmail = cleanHeader(sender.email || body.gmail_from_email || body.sender?.email || campaign.sender_email);
  const senderName = cleanHeader(sender.name || body.sender?.name || campaign.sender_name || "ExportFlow");
  const accessToken = clean(body.gmail_access_token || sender.accessToken);

  if (!subject || (!bodyText && !bodyHtml)) {
    return NextResponse.json({
      ok: false,
      success: false,
      status: "failed",
      error: `No approved ${step} template was available for this lead.`
    });
  }

  if (sender.testMode) {
    const banner = `<p><strong>TEST MODE - not sent to lead.</strong></p><p>Original lead recipient: ${escapeHtml(originalToEmail || "(missing)")}</p><hr>`;
    bodyHtml = `${banner}${bodyHtml || htmlFromText(bodyText)}`;
  }

  if (!toEmail) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "No recipient email available." });
  }

  if (!fromEmail) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "No Gmail sender email is configured." });
  }

  if (!accessToken) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "No Gmail access token is configured." });
  }

  const mime = [
    `From: ${senderName} <${fromEmail}>`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    bodyHtml
  ].join("\r\n");

  const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: base64Url(mime) })
  });

  const gmailPayload = await gmailResponse.json().catch(() => ({}));
  if (!gmailResponse.ok) {
    return NextResponse.json({
      ok: false,
      success: false,
      status: "failed",
      error: clean(gmailPayload.error?.message || gmailPayload.error || `Gmail send failed with HTTP ${gmailResponse.status}`),
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      generated: {
        step,
        sequence,
        gmail_error: gmailPayload
      },
      to_email: toEmail,
      original_to_email: originalToEmail
    });
  }

  return NextResponse.json({
    ok: true,
    success: true,
    status: sender.testMode ? "test_sent" : "sent",
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    generated: {
      step,
      sequence
    },
    gmail_message_id: clean(gmailPayload.id),
    gmail_thread_id: clean(gmailPayload.threadId),
    to_email: toEmail,
    original_to_email: originalToEmail
  });
}
