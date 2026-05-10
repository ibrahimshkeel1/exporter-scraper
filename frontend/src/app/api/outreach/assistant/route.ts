import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/api-auth";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

type OutreachDraft = {
  business_plan: string;
  offer: string;
  target_buyer: string;
  tone: string;
  cta: string;
  signature: string;
  sender_name: string;
  sender_email: string;
};

type LeadUploadFile = {
  name: string;
  format: "csv" | "pdf";
  mime_type: string;
  data?: string;
  text_content?: string;
};

const draftKeys: Array<keyof OutreachDraft> = [
  "business_plan",
  "offer",
  "target_buyer",
  "tone",
  "cta",
  "signature",
  "sender_name",
  "sender_email"
];

function text(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeLeadFile(value: unknown): LeadUploadFile | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const format = text(source.format).toLowerCase();
  if (format !== "csv" && format !== "pdf") return null;

  const name = text(source.name) || `lead-upload.${format}`;
  const mimeType = text(source.mime_type) || (format === "pdf" ? "application/pdf" : "text/csv");
  const data = text(source.data);
  const textContent = text(source.text_content).slice(0, 120000);

  if (format === "pdf" && !data) return null;
  if (format === "csv" && !textContent && !data) return null;

  return {
    name,
    format,
    mime_type: mimeType,
    data: data || undefined,
    text_content: textContent || undefined
  };
}

function normalizeDraft(value: unknown, current: OutreachDraft): OutreachDraft {
  const source = value && typeof value === "object" ? (value as Partial<Record<keyof OutreachDraft, unknown>>) : {};
  return draftKeys.reduce((draft, key) => {
    const next = text(source[key]);
    return {
      ...draft,
      [key]: next || current[key] || ""
    };
  }, { ...current });
}

function missingFields(draft: OutreachDraft, pastedLeads: string) {
  const missing: string[] = [];
  if (!draft.business_plan) missing.push("business plan");
  if (!draft.offer) missing.push("offer");
  if (!draft.target_buyer) missing.push("target buyer");
  if (!draft.cta) missing.push("CTA");
  if (!draft.signature) missing.push("signature");
  if (!draft.sender_name) missing.push("sender name");
  if (!draft.sender_email) missing.push("sender email");
  if (!pastedLeads.trim()) missing.push("lead list");
  return missing;
}

function fallbackReply(messages: ChatMessage[], draft: OutreachDraft, pastedLeads: string) {
  const missing = missingFields(draft, pastedLeads);
  const last = messages.filter((message) => message.role === "user").at(-1)?.content || "";
  const nextQuestion =
    missing.length > 0
      ? `I filled what I could from that. I still need ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " and a few more details" : ""}.`
      : "The outreach draft has enough information to create the campaign. Review the panels, then create the campaign.";

  return {
    assistant_message: last ? nextQuestion : "Tell me what you sell, who you want to reach, your offer, your CTA, sender details, and paste the leads when ready.",
    draft,
    pasted_leads: pastedLeads,
    ready_to_create: missing.length === 0,
    missing_fields: missing
  };
}

function parseGeminiJson(raw: string) {
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  const currentDraft = normalizeDraft(body.draft, {
    business_plan: "",
    offer: "",
    target_buyer: "",
    tone: "professional",
    cta: "",
    signature: "",
    sender_name: "",
    sender_email: ""
  });
  const currentLeads = text(body.pasted_leads);
  const leadFile = normalizeLeadFile(body.lead_file);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  if (!apiKey) {
    const fallbackLeads = currentLeads || (leadFile?.format === "csv" ? text(leadFile.text_content) : "");
    return NextResponse.json(fallbackReply(messages, currentDraft, fallbackLeads));
  }

  const transcript = messages
    .slice(-20)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")
    .slice(-12000);

  const prompt = [
    "You are the setup assistant for ExportFlow email outreach.",
    "The user wants a chat-first UI, but you must maintain a structured campaign draft behind the chat.",
    "Return JSON only. Do not use markdown.",
    "Schema: {\"assistant_message\": string, \"draft\": {\"business_plan\": string, \"offer\": string, \"target_buyer\": string, \"tone\": string, \"cta\": string, \"signature\": string, \"sender_name\": string, \"sender_email\": string}, \"pasted_leads\": string, \"ready_to_create\": boolean, \"missing_fields\": string[]}.",
    "Extract lead rows from the chat if the user pasted them. Keep one lead per line as: company, contact, email, website, notes.",
    "If an uploaded lead file is provided, analyze every visible column, table row, note, and context block in it.",
    "For CSV files, use the headers to identify company, contact, email, website, country, category, MOQ, buyer type, and notes. For PDF files, read the attached PDF and extract the same fields from tables or prose.",
    "Preserve useful per-lead context in the notes field so later template generation can personalize emails from the file details.",
    "Do not invent sender email, offer details, or leads. Preserve existing draft values unless the user clearly updates them.",
    "Ask one concise next question when information is missing. If ready, tell the user to review the panels and create the campaign.",
    "",
    "Current draft:",
    JSON.stringify(currentDraft, null, 2),
    "",
    "Current pasted leads:",
    currentLeads || "none",
    "",
    "Uploaded lead file:",
    leadFile ? JSON.stringify({ name: leadFile.name, format: leadFile.format, mime_type: leadFile.mime_type }, null, 2) : "none",
    "",
    "Uploaded CSV/text content:",
    leadFile?.text_content || "none",
    "",
    "Conversation:",
    transcript || "No conversation yet."
  ].join("\n");

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (leadFile?.format === "pdf" && leadFile.data) {
    parts.push({
      inline_data: {
        mime_type: leadFile.mime_type || "application/pdf",
        data: leadFile.data
      }
    });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const fallbackLeads = currentLeads || (leadFile?.format === "csv" ? text(leadFile.text_content) : "");
    return NextResponse.json({
      ...fallbackReply(messages, currentDraft, fallbackLeads),
      warning: `Gemini failed with HTTP ${response.status}; local fallback used.`
    });
  }

  const payload = await response.json();
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = typeof rawText === "string" ? parseGeminiJson(rawText) : null;
  if (!parsed) {
    const fallbackLeads = currentLeads || (leadFile?.format === "csv" ? text(leadFile.text_content) : "");
    return NextResponse.json({
      ...fallbackReply(messages, currentDraft, fallbackLeads),
      warning: "Gemini returned invalid JSON; local fallback used."
    });
  }

  const draft = normalizeDraft(parsed.draft, currentDraft);
  const pastedLeads = text(parsed.pasted_leads, currentLeads) || currentLeads;
  const missing = Array.isArray(parsed.missing_fields) ? parsed.missing_fields.map(String).slice(0, 8) : missingFields(draft, pastedLeads);

  return NextResponse.json({
    assistant_message: text(parsed.assistant_message) || fallbackReply(messages, draft, pastedLeads).assistant_message,
    draft,
    pasted_leads: pastedLeads,
    ready_to_create: Boolean(parsed.ready_to_create) && missing.length === 0,
    missing_fields: missing
  });
}
