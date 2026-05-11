import { NextRequest, NextResponse } from "next/server";
import { outreachDeliveryConfig, verifyOutreachWebhook } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";
import {
  buildOutboundMessageId,
  findConnectionForMessage,
  sendWithGoogleConnection,
  sendWithSmtpConnection
} from "../../../../../lib/email-connections";

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
  if (typeof value === "string") return { body_text: value };

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
  if (step === "followup_1") return asStep(sequence?.followup_1 || templates.followup_1_template);
  if (step === "followup_2") return asStep(sequence?.followup_2 || templates.followup_2_template);
  return asStep(sequence?.initial || templates.initial_template);
}

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "Invalid webhook secret." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const delivery = outreachDeliveryConfig();
  const supabase = createAdminSupabase();
  const messageId = clean(body.message_id || body.id);
  const step = clean(body.step || "initial");
  const lead = body.lead && typeof body.lead === "object" ? (body.lead as Record<string, unknown>) : {};
  const campaign = body.campaign && typeof body.campaign === "object" ? (body.campaign as Record<string, unknown>) : {};
  const templates = body.approved_templates && typeof body.approved_templates === "object" ? (body.approved_templates as Record<string, unknown>) : {};
  const connection = await findConnectionForMessage(supabase, {
    messageId,
    campaignId: clean(body.campaign_id || campaign.id),
    userId: clean(body.user_id || campaign.user_id),
    emailConnectionId: clean(body.email_connection_id || campaign.email_connection_id) || null
  });

  if (!messageId) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "message_id is required." });
  }

  const sequence = findLeadSequence(templates, lead);
  const stepContent = pickStep(sequence, templates, step);
  const subject = cleanHeader(stepContent.subject || `Quick question for ${clean(lead.company_name) || "your team"}`);
  const bodyText = clean(stepContent.body_text);
  let bodyHtml = clean(stepContent.body_html) || htmlFromText(bodyText);
  const originalToEmail = clean(lead.original_email || lead.email || body.original_to_email || body.to_email);
  const toEmail = delivery.testMode ? clean(delivery.testRecipient) : originalToEmail;
  const fromEmail = cleanHeader(connection?.email || delivery.smtp.fromEmail || body.sender?.email || campaign.sender_email);
  const senderName = cleanHeader(connection?.from_name || connection?.display_name || delivery.senderName || body.sender?.name || campaign.sender_name || "ExportFlow");
  const replyTo = clean(connection?.reply_to || delivery.replyTo || fromEmail);

  if (!subject || (!bodyText && !bodyHtml)) {
    return NextResponse.json({
      ok: false,
      success: false,
      status: "failed",
      error: `No approved ${step} template was available for this lead.`
    });
  }

  if (delivery.testMode) {
    const banner = `<p><strong>TEST MODE - not sent to lead.</strong></p><p>Original lead recipient: ${escapeHtml(originalToEmail || "(missing)")}</p><hr>`;
    bodyHtml = `${banner}${bodyHtml || htmlFromText(bodyText)}`;
  }

  if (!toEmail) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "No recipient email available." });
  }

  if (!fromEmail) {
    return NextResponse.json({ ok: false, success: false, status: "failed", error: "No SMTP sender email is configured." });
  }

  try {
    let sendResult: { outboundMessageId: string; providerMessageId: string; threadId: string; response: string };
    const mailPayload = {
      messageId,
      campaignId: clean(body.campaign_id || campaign.id),
      leadId: clean(body.lead_id || lead.id),
      step,
      fromEmail,
      senderName,
      toEmail,
      replyTo,
      subject,
      bodyText,
      bodyHtml,
      originalToEmail
    };

    if (connection?.provider === "google") {
      sendResult = await sendWithGoogleConnection(supabase, connection, mailPayload);
    } else if (connection?.provider === "smtp") {
      sendResult = await sendWithSmtpConnection(connection, mailPayload);
    } else {
      if (!delivery.smtp.host || !delivery.smtp.port) {
        return NextResponse.json({ ok: false, success: false, status: "failed", error: "No connected sender was found and SMTP host/port is not configured." });
      }

      sendResult = await sendWithSmtpConnection(
        {
          id: "env",
          user_id: clean(body.user_id || campaign.user_id),
          provider: "smtp",
          email: fromEmail,
          display_name: senderName,
          from_name: senderName,
          reply_to: replyTo,
          status: "active",
          scopes: [],
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expires_at: null,
          smtp_host: delivery.smtp.host,
          smtp_port: delivery.smtp.port,
          smtp_secure: delivery.smtp.secure,
          smtp_username: delivery.smtp.user,
          smtp_password_encrypted: null,
          imap_host: delivery.imap.host,
          imap_port: delivery.imap.port,
          imap_secure: delivery.imap.secure,
          imap_username: delivery.imap.user,
          imap_password_encrypted: null,
          imap_mailbox: delivery.imap.mailbox,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        mailPayload
      ).catch(async () => {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: delivery.smtp.host,
          port: delivery.smtp.port,
          secure: delivery.smtp.secure,
          auth: delivery.smtp.user ? { user: delivery.smtp.user, pass: delivery.smtp.pass } : undefined
        });
        const outboundMessageId = buildOutboundMessageId(messageId, fromEmail);
        const info = await transporter.sendMail({
          from: { name: senderName, address: fromEmail },
          to: toEmail,
          replyTo: replyTo || undefined,
          subject,
          text: bodyText || undefined,
          html: bodyHtml || undefined,
          messageId: outboundMessageId,
          headers: {
            "X-ExportFlow-Campaign-Id": clean(body.campaign_id || campaign.id),
            "X-ExportFlow-Lead-Id": clean(body.lead_id || lead.id),
            "X-ExportFlow-Step": step
          }
        });
        return {
          outboundMessageId,
          providerMessageId: clean(info.messageId || outboundMessageId),
          threadId: clean(info.messageId || outboundMessageId),
          response: clean(info.response)
        };
      });
    }

    return NextResponse.json({
      ok: true,
      success: true,
      status: delivery.testMode ? "test_sent" : "sent",
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      generated: {
        step,
        sequence,
        provider: connection?.provider || "smtp_env",
        provider_response: sendResult.response
      },
      gmail_message_id: clean(sendResult.outboundMessageId || sendResult.providerMessageId),
      gmail_thread_id: clean(sendResult.threadId || sendResult.providerMessageId),
      to_email: toEmail,
      original_to_email: originalToEmail
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      success: false,
      status: "failed",
      error: error instanceof Error ? error.message : "SMTP send failed.",
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      generated: {
        step,
        sequence
      },
      to_email: toEmail,
      original_to_email: originalToEmail
    });
  }
}
