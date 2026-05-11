"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  MailCheck,
  Plug,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { WorkspaceContext } from "../../components/workspace-types";
import { mergeWorkspaceContexts, useLeadSessionWorkspace } from "../../components/lead-session-workspace";
import { createBrowserSupabase, isSupabaseConfigured } from "../../lib/supabase-client";
import { OutreachCampaign, OutreachLead, OutreachLeadInput, parsePastedLeads } from "../../lib/outreach";

type DeliveredJob = {
  id: string;
  created_at: string;
  target_region: string;
  refined_industry: string;
  original_industry: string;
  lead_exports?: Array<{ format: string; storage_path: string | null }>;
};

type FormState = {
  business_plan: string;
  offer: string;
  target_buyer: string;
  tone: string;
  cta: string;
  signature: string;
  sender_name: string;
  sender_email: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type LeadUploadFormat = "csv" | "pdf";

type LeadUploadPayload = {
  name: string;
  format: LeadUploadFormat;
  mime_type: string;
  data?: string;
  text_content?: string;
};

type EmailConnection = {
  id: string;
  provider: "google" | "smtp";
  email: string;
  display_name: string | null;
  from_name: string | null;
  reply_to: string | null;
  status: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  imap_username: string | null;
  imap_mailbox: string | null;
  last_error: string | null;
};

type SmtpFormState = {
  email: string;
  display_name: string;
  from_name: string;
  reply_to: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
  imap_host: string;
  imap_port: string;
  imap_secure: boolean;
  imap_username: string;
  imap_password: string;
  imap_mailbox: string;
};

type SequenceStep = {
  subject?: string;
  body_text?: string;
  body_html?: string;
};

type LeadSequence = {
  lead_id?: string;
  email?: string;
  company_name?: string;
  contact_name?: string;
  website?: string;
  approval_summary?: string;
  personalization_evidence?: string[];
  safety_notes?: string[];
  initial?: SequenceStep | string;
  followup_1?: SequenceStep | string;
  followup_2?: SequenceStep | string;
  raw?: unknown;
};

const initialForm: FormState = {
  business_plan: "",
  offer: "",
  target_buyer: "",
  tone: "professional",
  cta: "",
  signature: "",
  sender_name: "",
  sender_email: ""
};

const initialChat: ChatMessage[] = [
  {
    id: "assistant-start",
    role: "assistant",
    content:
      "Tell me what you sell, who you want to reach, your offer, CTA, sender details, and add leads by chat, CSV, or PDF. I will fill the outreach draft from the chat."
  }
];

const initialSmtpForm: SmtpFormState = {
  email: "",
  display_name: "",
  from_name: "",
  reply_to: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_secure: false,
  smtp_username: "",
  smtp_password: "",
  imap_host: "",
  imap_port: "993",
  imap_secure: true,
  imap_username: "",
  imap_password: "",
  imap_mailbox: "INBOX"
};

const draftFields: Array<{ key: keyof FormState; label: string }> = [
  { key: "business_plan", label: "Business plan" },
  { key: "offer", label: "Offer" },
  { key: "target_buyer", label: "Target buyer" },
  { key: "tone", label: "Tone" },
  { key: "cta", label: "CTA" },
  { key: "signature", label: "Signature" },
  { key: "sender_name", label: "Sender" },
  { key: "sender_email", label: "Sender email" }
];

function generatedText(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function base64FromDataUrl(value: string) {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

function formatFromFile(file: File, selected: LeadUploadFormat): LeadUploadFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type === "text/plain") return "csv";
  return selected;
}

function statusClass(status: string) {
  if (["template_ready", "test_sent", "sent", "active", "replied"].includes(status)) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (["failed", "unsubscribed"].includes(status)) return "border-red-400/30 bg-red-400/10 text-red-200";
  if (["generating", "launching", "sending", "queued", "followup_1_pending", "followup_2_pending"].includes(status)) return "border-[#569cd6]/40 bg-[#1f3a4f] text-[#d4d4d4]";
  return "border-[#3c3c3c] bg-[#252526] text-vercel-muted";
}

function formatStepName(step: string) {
  if (step === "followup_1") return "Follow-up 1";
  if (step === "followup_2") return "Follow-up 2";
  return "Initial";
}

function asStep(value: unknown): SequenceStep {
  if (!value) return {};
  if (typeof value === "string") return { body_text: value };
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    return {
      subject: clean(item.subject),
      body_text: clean(item.body_text || item.body || item.text),
      body_html: clean(item.body_html || item.html)
    };
  }
  return { body_text: String(value) };
}

function findLeadSequence(generated: Record<string, unknown> | null | undefined, lead: OutreachLead): LeadSequence | null {
  if (!generated) return null;
  const sequences = Array.isArray(generated.sequences) ? (generated.sequences as LeadSequence[]) : [];
  const matched = sequences.find((sequence) => {
    const sequenceEmail = clean(sequence.email).toLowerCase();
    const leadEmail = clean(lead.email).toLowerCase();
    return (
      clean(sequence.lead_id) === lead.id ||
      (sequenceEmail && leadEmail && sequenceEmail === leadEmail) ||
      (clean(sequence.company_name).toLowerCase() && clean(sequence.company_name).toLowerCase() === clean(lead.company_name).toLowerCase())
    );
  });
  if (matched) return matched;

  if (generated.initial_template || generated.followup_1_template || generated.followup_2_template) {
    return {
      lead_id: lead.id,
      company_name: lead.company_name || "",
      contact_name: lead.contact_name || "",
      email: lead.email || "",
      website: lead.website || "",
      approval_summary: generatedText(generated.strategy || generated.safety_notes),
      initial: asStep(generated.initial_template),
      followup_1: asStep(generated.followup_1_template),
      followup_2: asStep(generated.followup_2_template)
    };
  }

  return null;
}

function buildOutreachExplorerContext(campaign: OutreachCampaign | null): WorkspaceContext | null {
  if (!campaign) return null;
  const leads = campaign.outreach_leads || [];
  const messages = campaign.outreach_messages || [];

  return {
    id: campaign.id,
    label: `Campaign ${campaign.id.slice(0, 8)}`,
    description: `${campaign.status} | ${leads.length} leads`,
    artifacts: [
      {
        id: `outreach-${campaign.id}-leads`,
        name: "leads_found.csv",
        folder: "Results",
        kind: "csv",
        content: leads.map((lead) => `${lead.company_name || "Unknown"},${lead.contact_name || ""},${lead.email || ""},${lead.status}`).join("\n")
      },
      {
        id: `outreach-${campaign.id}-templates`,
        name: "templates.json",
        folder: "Insights",
        kind: "json",
        content: JSON.stringify(campaign.generated_templates || {}, null, 2)
      },
      {
        id: `outreach-${campaign.id}-queue`,
        name: "message_queue.log",
        folder: "Logs",
        kind: "log",
        content: messages.map((msg) => `[${new Date(msg.created_at).toLocaleString()}] ${msg.step} -> ${msg.status} :: ${msg.subject || "(no subject)"}`).join("\n")
      }
    ]
  };
}

function CollapsibleBox({
  title,
  eyebrow,
  icon,
  children,
  defaultOpen = true,
  className = ""
}: {
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`ide-panel flex min-h-[120px] resize-y flex-col overflow-hidden ${open ? "max-h-[760px]" : "max-h-[44px]"} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown size={15} className="text-[#569cd6]" /> : <ChevronRight size={15} className="text-[#858585]" />}
          {icon}
          <span className="min-w-0">
            {eyebrow && <span className="block text-[9px] uppercase tracking-[0.16em] text-[#858585]">{eyebrow}</span>}
            <span className="block truncate text-sm font-semibold text-vercel-text">{title}</span>
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#858585]">{open ? "collapse" : "open"}</span>
      </button>
      {open && <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>}
    </section>
  );
}

function TemplateModal({ lead, sequence, onClose }: { lead: OutreachLead; sequence: LeadSequence; onClose: () => void }) {
  const steps: Array<{ key: "initial" | "followup_1" | "followup_2"; label: string }> = [
    { key: "initial", label: "Initial outreach" },
    { key: "followup_1", label: "Follow-up 1" },
    { key: "followup_2", label: "Follow-up 2" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="ide-panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-[#3c3c3c] bg-[#252526] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#858585]">Lead template</p>
            <h2 className="mt-1 text-base font-semibold text-vercel-text">{lead.company_name || lead.email || "Lead"}</h2>
            <p className="mt-1 text-xs text-[#858585]">{lead.contact_name || "No contact name"} | {lead.email || "No email"}</p>
          </div>
          <button type="button" onClick={onClose} className="ide-btn inline-flex h-9 w-9 items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {sequence.approval_summary && (
            <div className="mb-4 border border-[#3c3c3c] bg-[#252526] p-3 text-sm leading-6 text-vercel-text">
              {sequence.approval_summary}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {steps.map((step) => {
              const content = asStep(sequence[step.key]);
              return (
                <div key={step.key} className="border border-[#3c3c3c] bg-[#252526] p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#569cd6]">{step.label}</p>
                  <p className="mb-3 text-sm font-semibold text-vercel-text">{content.subject || "No subject returned"}</p>
                  <pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#d4d4d4]">
                    {content.body_text || content.body_html || "No body returned."}
                  </pre>
                </div>
              );
            })}
          </div>
          {Array.isArray(sequence.personalization_evidence) && sequence.personalization_evidence.length > 0 && (
            <div className="mt-4 border border-[#3c3c3c] bg-[#252526] p-3">
              <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#858585]">Personalization evidence</p>
              <ul className="space-y-1 text-xs text-vercel-muted">
                {sequence.personalization_evidence.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OutreachPage() {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const leadWorkspace = useLeadSessionWorkspace();
  const [form, setForm] = useState<FormState>(initialForm);
  const [pastedLeads, setPastedLeads] = useState("");
  const [importedLeads, setImportedLeads] = useState<OutreachLeadInput[]>([]);
  const [jobs, setJobs] = useState<DeliveredJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChat);
  const [chatDraft, setChatDraft] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [readyFromAssistant, setReadyFromAssistant] = useState(false);
  const [selectedTemplateLead, setSelectedTemplateLead] = useState<OutreachLead | null>(null);
  const [leadUploadFormat, setLeadUploadFormat] = useState<LeadUploadFormat>("csv");
  const [uploadedLeadFile, setUploadedLeadFile] = useState("");
  const [emailConnections, setEmailConnections] = useState<EmailConnection[]>([]);
  const [selectedEmailConnectionId, setSelectedEmailConnectionId] = useState("");
  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpForm, setSmtpForm] = useState<SmtpFormState>(initialSmtpForm);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function token() {
    if (!supabase) return null;
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function api(path: string, options: RequestInit = {}) {
    const accessToken = await token();
    if (!accessToken) throw new Error("Sign in first.");
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function refreshCampaign(id = campaign?.id) {
    if (!id) return;
    try {
      const payload = await api(`/api/outreach/campaigns/${encodeURIComponent(id)}`);
      setCampaign(payload.campaign);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh campaign.");
    }
  }

  async function loadDeliveredJobs() {
    if (!supabase) return;
    try {
      const payload = await api("/api/outreach/imports/jobs");
      setJobs(payload.jobs || []);
    } catch {
      setJobs([]);
    }
  }

  async function loadEmailConnections() {
    if (!supabase) return;
    try {
      const payload = await api("/api/email/connections");
      const connections = (payload.connections || []) as EmailConnection[];
      setEmailConnections(connections);
      setSelectedEmailConnectionId((current) => current || connections[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load email connections.");
    }
  }

  async function connectGoogleEmail() {
    setLoading("connect-google");
    setMessage("");
    try {
      const payload = await api("/api/email/google/start", {
        method: "POST",
        body: JSON.stringify({ return_to: "/outreach" })
      });
      if (!payload.url) throw new Error("Google did not return a connection URL.");
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Google connection.");
      setLoading("");
    }
  }

  async function saveSmtpEmail() {
    setLoading("save-smtp");
    setMessage("");
    try {
      const payload = await api("/api/email/connections/smtp", {
        method: "POST",
        body: JSON.stringify({
          ...smtpForm,
          smtp_port: Number(smtpForm.smtp_port || 587),
          imap_port: Number(smtpForm.imap_port || 993)
        })
      });
      const connection = payload.connection as EmailConnection;
      setEmailConnections((current) => [connection, ...current.filter((item) => item.id !== connection.id)]);
      setSelectedEmailConnectionId(connection.id);
      setShowSmtpForm(false);
      setSmtpForm(initialSmtpForm);
      setMessage(`Connected ${connection.email} for outreach sending.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save SMTP connection.");
    } finally {
      setLoading("");
    }
  }

  async function deleteEmailConnection(id: string) {
    setLoading(`delete-${id}`);
    setMessage("");
    try {
      await api(`/api/email/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
      setEmailConnections((current) => current.filter((item) => item.id !== id));
      setSelectedEmailConnectionId((current) => (current === id ? "" : current));
      setMessage("Email connection removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove email connection.");
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    void loadDeliveredJobs();
    void loadEmailConnections();
  }, [supabase]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("email_connection");
    const detail = url.searchParams.get("email_message");
    if (!status) return;

    setMessage(detail || (status === "connected" ? "Email account connected." : "Email connection failed."));
    url.searchParams.delete("email_connection");
    url.searchParams.delete("email_message");
    window.history.replaceState({}, "", url.toString());
    if (status === "connected") void loadEmailConnections();
  }, []);

  useEffect(() => {
    const connection = emailConnections.find((item) => item.id === selectedEmailConnectionId);
    if (!connection) return;
    setForm((current) => ({
      ...current,
      sender_email: current.sender_email || connection.email,
      sender_name: current.sender_name || connection.from_name || connection.display_name || "ExportFlow"
    }));
  }, [emailConnections, selectedEmailConnectionId]);

  useEffect(() => {
    if (!campaign?.id) return;
    const interval = setInterval(() => void refreshCampaign(campaign.id), 3500);
    return () => clearInterval(interval);
  }, [campaign?.id]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, loading]);

  function applyAssistantPayload(payload: Record<string, unknown>) {
    if (payload.draft) setForm((current) => ({ ...current, ...(payload.draft as Partial<FormState>) }));
    if (typeof payload.pasted_leads === "string") setPastedLeads(payload.pasted_leads);
    setMissingFields(Array.isArray(payload.missing_fields) ? payload.missing_fields.map(String) : []);
    setReadyFromAssistant(Boolean(payload.ready_to_create));
    setChatMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: typeof payload.assistant_message === "string" ? payload.assistant_message : "I updated the outreach draft."
      }
    ]);
  }

  async function askAssistant(nextMessages: ChatMessage[], leadFile?: LeadUploadPayload) {
    const payload = await api("/api/outreach/assistant", {
      method: "POST",
      body: JSON.stringify({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        draft: form,
        pasted_leads: pastedLeads,
        lead_file: leadFile
      })
    });
    applyAssistantPayload(payload);
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatDraft.trim();
    if (!content || loading === "chat") return;

    const nextMessages: ChatMessage[] = [...chatMessages, { id: crypto.randomUUID(), role: "user", content }];
    setChatMessages(nextMessages);
    setChatDraft("");
    setLoading("chat");
    setMessage("");

    try {
      await askAssistant(nextMessages);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "I could not update the outreach draft."
        }
      ]);
    } finally {
      setLoading("");
    }
  }

  async function handleLeadFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || loading === "chat") return;

    const format = formatFromFile(file, leadUploadFormat);
    setLeadUploadFormat(format);

    if (format === "csv" && !(file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv") || file.type === "text/plain")) {
      setMessage("Choose a CSV file or switch the upload format to PDF.");
      return;
    }

    if (format === "pdf" && !(file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf")) {
      setMessage("Choose a PDF file or switch the upload format to CSV.");
      return;
    }

    const maxBytes = format === "pdf" ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMessage(`${format.toUpperCase()} upload is too large. Keep it under ${format === "pdf" ? "4MB" : "2MB"}.`);
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: `Uploaded ${format.toUpperCase()} lead file: ${file.name}`
    };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setUploadedLeadFile(file.name);
    setLoading("chat");
    setMessage("");

    try {
      const textContent = format === "csv" ? await readFileAsText(file) : "";
      const data = format === "pdf" ? base64FromDataUrl(await readFileAsDataUrl(file)) : undefined;
      await askAssistant(nextMessages, {
        name: file.name,
        format,
        mime_type: file.type || (format === "pdf" ? "application/pdf" : "text/csv"),
        data,
        text_content: textContent
      });
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "I could not analyze that lead file."
        }
      ]);
    } finally {
      setLoading("");
    }
  }

  async function importJobLeads() {
    if (!selectedJobId) return;
    setLoading("import");
    setMessage("");
    try {
      const payload = await api(`/api/outreach/imports/jobs/${encodeURIComponent(selectedJobId)}/leads`);
      setImportedLeads((current) => [...current, ...(payload.leads || [])]);
      setMessage(`Imported ${(payload.leads || []).length} leads from scraper exports.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import leads.");
    } finally {
      setLoading("");
    }
  }

  async function createCampaign() {
    setLoading("create");
    setMessage("");
    try {
      const leads = [...parsePastedLeads(pastedLeads), ...importedLeads].slice(0, 50);
      const payload = await api("/api/outreach/campaigns", {
        method: "POST",
        body: JSON.stringify({ ...form, email_connection_id: selectedEmailConnectionId || null, leads })
      });
      setCampaign(payload.campaign);
      setMessage("Campaign created. Generate per-lead templates next.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setLoading("");
    }
  }

  async function generateTemplate() {
    if (!campaign) return;
    setLoading("generate");
    setMessage("");
    try {
      await api(`/api/outreach/campaigns/${encodeURIComponent(campaign.id)}/generate`, { method: "POST" });
      setMessage("Template generation sent to n8n. Waiting for callback...");
      await refreshCampaign(campaign.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not trigger n8n.");
    } finally {
      setLoading("");
    }
  }

  async function launchCampaign() {
    if (!campaign) return;
    setLoading("send");
    setMessage("");
    try {
      const payload = await api(`/api/outreach/campaigns/${encodeURIComponent(campaign.id)}/launch`, { method: "POST" });
      setMessage(payload.warning || "Launch request sent to n8n. Statuses will update below.");
      await refreshCampaign(campaign.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not launch campaign.");
    } finally {
      setLoading("");
    }
  }

  const parsedLeadCount = parsePastedLeads(pastedLeads).length;
  const leadsReady = parsedLeadCount + importedLeads.length;
  const generated = campaign?.generated_templates || null;
  const leads = campaign?.outreach_leads || [];
  const messages = campaign?.outreach_messages || [];
  const selectedSequence = selectedTemplateLead ? findLeadSequence(generated, selectedTemplateLead) : null;
  const campaignExplorerContext = useMemo(() => buildOutreachExplorerContext(campaign), [campaign]);
  const explorerContext = useMemo(
    () => mergeWorkspaceContexts(leadWorkspace.explorerContext, campaignExplorerContext, "Outreach"),
    [campaignExplorerContext, leadWorkspace.explorerContext]
  );

  const stats = {
    leads: leads.length,
    queued: messages.filter((item) => item.status === "queued" || item.status === "sending").length,
    sent: messages.filter((item) => item.status === "sent" || item.status === "test_sent").length,
    initial: messages.filter((item) => item.step === "initial" && (item.status === "sent" || item.status === "test_sent")).length,
    followups: messages.filter((item) => item.step !== "initial" && (item.status === "sent" || item.status === "test_sent")).length,
    replies: leads.filter((lead) => lead.status === "replied").length,
    failed: messages.filter((item) => item.status === "failed").length
  };
  const selectedEmailConnection = emailConnections.find((item) => item.id === selectedEmailConnectionId) || null;

  const mainEditor = (
    <div className="relative grid h-full min-h-0 grid-cols-1 gap-3 p-3 xl:grid-cols-[minmax(360px,430px)_minmax(0,1fr)]">
      {selectedTemplateLead && selectedSequence && (
        <TemplateModal lead={selectedTemplateLead} sequence={selectedSequence} onClose={() => setSelectedTemplateLead(null)} />
      )}

      <CollapsibleBox title="Outreach Chat" eyebrow="Gemini setup" icon={<Bot size={16} className="text-[#569cd6]" />} className="min-h-[520px]">
        <div className="flex h-full min-h-[460px] flex-col">
          <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
            {chatMessages.map((item) => (
              <div key={item.id} className={`border px-3 py-2 text-sm leading-6 ${item.role === "user" ? "ml-8 border-[#3c3c3c] bg-[#252526] text-[#569cd6]" : "mr-8 border-[#007acc] bg-[#1f3a4f] text-vercel-text"}`}>
                <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-[#858585]">{item.role === "user" ? "you" : "ai"}</span>
                <span className="whitespace-pre-wrap">{item.content}</span>
              </div>
            ))}
            {loading === "chat" && (
              <div className="inline-flex items-center gap-2 border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-sm text-[#569cd6]">
                <Loader2 size={14} className="animate-spin" />
                updating draft...
              </div>
            )}
          </div>

          <div className="mt-3 border-t border-[#3c3c3c] pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={leadUploadFormat === "pdf" ? "application/pdf,.pdf" : ".csv,text/csv,text/plain"}
              className="hidden"
              onChange={(event) => void handleLeadFileUpload(event)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.16em] text-[#858585]">Lead file</span>
              <div className="grid h-9 grid-cols-2 overflow-hidden border border-[#3c3c3c]">
                {(["csv", "pdf"] as LeadUploadFormat[]).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setLeadUploadFormat(format)}
                    className={`px-3 text-xs font-semibold uppercase ${leadUploadFormat === format ? "bg-[#569cd6] text-white" : "bg-[#252526] text-vercel-muted hover:text-vercel-text"}`}
                  >
                    {format}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading === "chat"}
                className="ide-btn inline-flex h-9 items-center gap-2 px-3 text-xs disabled:opacity-50"
              >
                <FileText size={14} />
                Upload {leadUploadFormat.toUpperCase()}
              </button>
              {uploadedLeadFile && <span className="max-w-full truncate text-xs text-vercel-muted">{uploadedLeadFile}</span>}
            </div>
          </div>

          <form className="mt-3 flex gap-2 border-t border-[#3c3c3c] pt-3" onSubmit={sendChat}>
            <textarea
              className="ide-input h-16 flex-1 resize-none px-3 py-2 text-sm"
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="Describe the campaign, paste leads, or correct any draft detail..."
              disabled={loading === "chat"}
            />
            <button type="submit" disabled={!chatDraft.trim() || loading === "chat"} className="ide-btn ide-btn-primary inline-flex h-16 w-14 items-center justify-center disabled:opacity-50">
              {loading === "chat" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      </CollapsibleBox>

      <div className="grid min-h-0 grid-cols-1 gap-3 overflow-auto xl:grid-cols-2">
        <CollapsibleBox title="AI-Filled Campaign Draft" eyebrow={readyFromAssistant ? "ready" : "needs details"} icon={<ClipboardList size={16} className="text-[#569cd6]" />}>
          <div className="space-y-2">
            {draftFields.map((field) => (
              <div key={field.key} className="border border-[#3c3c3c] bg-[#252526] p-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#858585]">{field.label}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-vercel-text">{form[field.key] || "Not set yet"}</p>
              </div>
            ))}
            {missingFields.length > 0 && (
              <div className="flex gap-2 border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">
                <AlertTriangle size={15} />
                Missing: {missingFields.join(", ")}
              </div>
            )}
          </div>
        </CollapsibleBox>

        <CollapsibleBox title="Email Sender" eyebrow={selectedEmailConnection ? selectedEmailConnection.provider : "connect"} icon={<KeyRound size={16} className="text-[#569cd6]" />}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void connectGoogleEmail()}
                disabled={Boolean(loading)}
                className="ide-btn ide-btn-primary inline-flex h-10 items-center gap-2 px-3 text-xs disabled:opacity-50"
              >
                {loading === "connect-google" ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                Connect Gmail / Workspace
              </button>
              <button
                type="button"
                onClick={() => setShowSmtpForm((current) => !current)}
                className="ide-btn inline-flex h-10 items-center gap-2 px-3 text-xs"
              >
                <MailCheck size={14} />
                SMTP fallback
              </button>
              <button type="button" onClick={() => void loadEmailConnections()} className="ide-btn inline-flex h-10 items-center gap-2 px-3 text-xs">
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            {emailConnections.length > 0 ? (
              <div className="space-y-2">
                <select
                  className="ide-input h-10 w-full px-3 text-xs"
                  value={selectedEmailConnectionId}
                  onChange={(event) => setSelectedEmailConnectionId(event.target.value)}
                >
                  {emailConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.email} - {connection.provider}
                    </option>
                  ))}
                </select>
                <div className="max-h-44 space-y-2 overflow-auto">
                  {emailConnections.map((connection) => (
                    <div key={connection.id} className={`grid grid-cols-[1fr_auto] gap-2 border p-2 ${connection.id === selectedEmailConnectionId ? "border-[#569cd6] bg-[#1f3a4f]" : "border-[#3c3c3c] bg-[#252526]"}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedEmailConnectionId(connection.id)}
                        className="min-w-0 text-left"
                      >
                        <p className="truncate text-sm text-vercel-text">{connection.email}</p>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#858585]">
                          {connection.provider} | {connection.status}
                          {connection.last_error ? ` | ${connection.last_error}` : ""}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteEmailConnection(connection.id)}
                        disabled={loading === `delete-${connection.id}`}
                        className="ide-btn flex h-8 w-8 items-center justify-center disabled:opacity-50"
                        title="Remove connection"
                      >
                        {loading === `delete-${connection.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-amber-300/30 bg-amber-300/10 p-2 text-xs leading-5 text-amber-100">
                Connect at least one sender before launching real outreach. Test mode can still use the shared SMTP environment if it is configured.
              </div>
            )}

            {showSmtpForm && (
              <div className="grid grid-cols-1 gap-2 border border-[#3c3c3c] bg-[#252526] p-3 md:grid-cols-2">
                {[
                  ["email", "Sender email"],
                  ["display_name", "Display name"],
                  ["from_name", "From name"],
                  ["reply_to", "Reply-to"],
                  ["smtp_host", "SMTP host"],
                  ["smtp_port", "SMTP port"],
                  ["smtp_username", "SMTP username"],
                  ["smtp_password", "SMTP/app password"],
                  ["imap_host", "IMAP host"],
                  ["imap_port", "IMAP port"],
                  ["imap_username", "IMAP username"],
                  ["imap_password", "IMAP password"],
                  ["imap_mailbox", "Mailbox"]
                ].map(([key, label]) => (
                  <label key={key} className={key === "imap_mailbox" ? "md:col-span-2" : ""}>
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[#858585]">{label}</span>
                    <input
                      className="ide-input h-9 w-full px-2 text-xs"
                      type={key.includes("password") ? "password" : "text"}
                      value={String(smtpForm[key as keyof SmtpFormState])}
                      onChange={(event) => setSmtpForm((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </label>
                ))}
                <label className="flex items-center gap-2 text-xs text-vercel-muted">
                  <input
                    type="checkbox"
                    checked={smtpForm.smtp_secure}
                    onChange={(event) => setSmtpForm((current) => ({ ...current, smtp_secure: event.target.checked }))}
                  />
                  SMTP SSL/TLS
                </label>
                <label className="flex items-center gap-2 text-xs text-vercel-muted">
                  <input
                    type="checkbox"
                    checked={smtpForm.imap_secure}
                    onChange={(event) => setSmtpForm((current) => ({ ...current, imap_secure: event.target.checked }))}
                  />
                  IMAP SSL/TLS
                </label>
                <button
                  type="button"
                  onClick={() => void saveSmtpEmail()}
                  disabled={loading === "save-smtp"}
                  className="ide-btn ide-btn-primary inline-flex h-10 items-center justify-center gap-2 px-3 text-xs disabled:opacity-50 md:col-span-2"
                >
                  {loading === "save-smtp" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Save SMTP sender
                </button>
              </div>
            )}
          </div>
        </CollapsibleBox>

        <CollapsibleBox title="Lead Intake" eyebrow={`${leadsReady} ready`} icon={<MailCheck size={16} className="text-[#569cd6]" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                className="ide-input h-10 px-3 text-xs"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
              >
                <option value="">Import delivered scraper job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {new Date(job.created_at).toLocaleDateString()} - {job.target_region} - {job.refined_industry || job.original_industry}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void importJobLeads()} disabled={!selectedJobId || loading === "import"} className="ide-btn inline-flex h-10 items-center gap-2 px-3 text-xs disabled:opacity-50">
                {loading === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Import
              </button>
            </div>
            <div className="border border-[#3c3c3c] bg-[#252526] p-2">
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[#858585]">Lead rows from chat or file</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-vercel-muted">
                {pastedLeads || "No leads extracted yet."}
              </pre>
            </div>
            <button type="button" onClick={() => void loadDeliveredJobs()} className="ide-btn inline-flex h-9 items-center gap-2 px-3 text-xs">
              <RefreshCw size={14} />
              Refresh jobs
            </button>
          </div>
        </CollapsibleBox>

        <CollapsibleBox title="Launch Control" eyebrow={campaign?.status || "draft"} icon={<Sparkles size={16} className="text-[#569cd6]" />}>
          {message && <div className="mb-3 border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{message}</div>}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <button type="button" onClick={() => void createCampaign()} disabled={Boolean(loading) || leadsReady === 0} className="ide-btn ide-btn-primary inline-flex h-11 items-center justify-center gap-2 px-3 text-sm disabled:opacity-50">
              {loading === "create" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Create
            </button>
            <button type="button" onClick={() => void generateTemplate()} disabled={Boolean(loading) || !campaign} className="ide-btn inline-flex h-11 items-center justify-center gap-2 px-3 text-sm disabled:opacity-50">
              {loading === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Generate
            </button>
            <button type="button" onClick={() => void launchCampaign()} disabled={Boolean(loading) || !generated} className="ide-btn inline-flex h-11 items-center justify-center gap-2 px-3 text-sm disabled:opacity-50">
              {loading === "send" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Launch
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {[
              ["Leads ready", leadsReady],
              ["Campaign leads", stats.leads],
              ["Sent", stats.sent],
              ["Replies", stats.replies]
            ].map(([label, value]) => (
              <div key={String(label)} className="border border-[#3c3c3c] bg-[#252526] p-2">
                <p className="text-[#858585]">{label}</p>
                <p className="mt-1 text-lg font-semibold text-vercel-text">{value}</p>
              </div>
            ))}
          </div>
        </CollapsibleBox>

        <CollapsibleBox title="Stats" eyebrow="live campaign" icon={<BarChart3 size={16} className="text-[#569cd6]" />}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Initial sent", stats.initial],
              ["Follow-ups", stats.followups],
              ["Queued", stats.queued],
              ["Failed", stats.failed]
            ].map(([label, value]) => (
              <div key={String(label)} className="border border-[#3c3c3c] bg-[#252526] p-2">
                <p className="text-[#858585]">{label}</p>
                <p className="mt-1 text-xl font-semibold text-vercel-text">{value}</p>
              </div>
            ))}
          </div>
        </CollapsibleBox>

        <CollapsibleBox title="Lead Status And Templates" eyebrow={`${leads.length} campaign leads`} icon={<Eye size={16} className="text-[#569cd6]" />} className="xl:col-span-2 min-h-[340px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
              <thead className="text-[#858585]">
                <tr>
                  <th className="px-2 py-2">Lead</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Latest step</th>
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2">Template</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-vercel-muted">Create a campaign to see lead status here.</td>
                  </tr>
                )}
                {leads.map((lead) => {
                  const leadMessages = messages.filter((item) => item.lead_id === lead.id);
                  const latest = leadMessages.at(-1);
                  const sequence = findLeadSequence(generated, lead);
                  return (
                    <tr key={lead.id}>
                      <td className="px-2 py-2 text-vercel-text">{lead.company_name || lead.contact_name || "Lead"}</td>
                      <td className="px-2 py-2 text-vercel-muted">{lead.email || "-"}</td>
                      <td className="px-2 py-2"><span className={`border px-2 py-0.5 ${statusClass(lead.status)}`}>{lead.status}</span></td>
                      <td className="px-2 py-2 text-vercel-muted">{latest ? formatStepName(latest.step) : "-"}</td>
                      <td className="px-2 py-2 text-vercel-muted">{latest?.subject || asStep(sequence?.initial).subject || "-"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTemplateLead(lead)}
                          disabled={!sequence}
                          className="ide-btn inline-flex h-8 items-center gap-2 px-2 disabled:opacity-40"
                        >
                          <Eye size={13} />
                          View Template
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleBox>
      </div>
    </div>
  );

  return (
    <VSCodeLayout
      mode="outreach"
      title="Email Outreach"
      subtitle="Chat-led setup | per-lead templates | n8n automation"
      activeTerminalJobId={leadWorkspace.terminalJobId}
      explorerContext={explorerContext}
      activeSessionOpenToken={leadWorkspace.sessionOpenToken}
      onSelectSession={(jobId) => leadWorkspace.selectJob(jobId, true)}
      terminalSummary={leadWorkspace.terminalSummary}
      mainEditor={mainEditor}
      jobsPanel={<JobTable refreshSignal={0} compact showFilesPane={false} {...leadWorkspace.jobTableProps} />}
      terminalContent={
        leadWorkspace.terminalJobId ? (
          <DualLiveTerminal jobId={leadWorkspace.terminalJobId} initialEvents={leadWorkspace.terminalEvents} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#858585]">
            Select a recent lead session to inspect logs.
          </div>
        )
      }
    />
  );
}
