"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MailCheck, Play, RefreshCw, Sparkles, Upload } from "lucide-react";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { WorkspaceContext } from "../../components/workspace-types";
import { mergeWorkspaceContexts, useLeadSessionWorkspace } from "../../components/lead-session-workspace";
import { createBrowserSupabase, isSupabaseConfigured } from "../../lib/supabase-client";
import { OutreachCampaign, OutreachLeadInput, parsePastedLeads } from "../../lib/outreach";

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

const initialForm: FormState = {
  business_plan: "",
  offer: "",
  target_buyer: "",
  tone: "professional",
  cta: "Reply if this is relevant and I can send details.",
  signature: "Best,\nIbrahim",
  sender_name: "Ibrahim",
  sender_email: ""
};

const fieldLabels: Record<keyof FormState, { label: string; placeholder: string }> = {
  business_plan: {
    label: "Business plan",
    placeholder: "Example: We help USA apparel importers source private-label hoodies from Pakistan with low MOQs."
  },
  offer: {
    label: "Offer",
    placeholder: "Example: 7-day sample development, custom fabric, export documentation, and FOB pricing."
  },
  target_buyer: {
    label: "Target buyer",
    placeholder: "Example: Boutique clothing brands, apparel wholesalers, and private-label buyers in USA."
  },
  tone: {
    label: "Tone",
    placeholder: "professional"
  },
  cta: {
    label: "CTA",
    placeholder: "Example: Reply with your current sourcing requirement and I will send samples/pricing."
  },
  signature: {
    label: "Signature",
    placeholder: "Example:\nBest,\nIbrahim\nExportFlow"
  },
  sender_name: {
    label: "Sender name",
    placeholder: "Example: Ibrahim Shkeel"
  },
  sender_email: {
    label: "Sender Gmail",
    placeholder: "Example: your-test-gmail@gmail.com"
  }
};

function generatedText(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function statusClass(status: string) {
  if (["template_ready", "test_sent", "sent", "active"].includes(status)) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (["failed"].includes(status)) return "border-red-400/30 bg-red-400/10 text-red-200";
  if (["generating", "launching", "sending", "queued"].includes(status)) return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/5 text-vercel-muted";
}

function buildOutreachExplorerContext(campaign: OutreachCampaign | null): WorkspaceContext | null {
  if (!campaign) return null;
  const leads = campaign.outreach_leads || [];
  const queuedMessages = campaign.outreach_messages || [];

  const leadRows =
    leads.length > 0
      ? leads
          .map((lead) => `${lead.company_name || "Unknown"}, ${lead.contact_name || "-"}, ${lead.email || "-"}, ${lead.status}`)
          .join("\n")
      : "No leads attached yet.";
  const queueLog =
    queuedMessages.length > 0
      ? queuedMessages
          .map((msg) => `[${new Date(msg.created_at).toLocaleString()}] ${msg.step} -> ${msg.status} :: ${msg.subject || "(no subject)"}`)
          .join("\n")
      : "No outreach messages queued yet.";

  return {
    id: campaign.id,
    label: `Campaign ${campaign.id.slice(0, 8)}`,
    description: `${campaign.status} • ${campaign.outreach_leads?.length || 0} leads`,
    artifacts: [
      {
        id: `outreach-${campaign.id}-leads`,
        name: "leads_found.csv",
        folder: "Results",
        kind: "csv",
        content: leadRows,
      },
      {
        id: `outreach-${campaign.id}-analysis`,
        name: "ai_analysis.md",
        folder: "Insights",
        kind: "markdown",
        content: [
          "# Outreach Analysis",
          `- Campaign: ${campaign.id}`,
          `- Status: ${campaign.status}`,
          `- Target buyer: ${campaign.target_buyer}`,
          `- Tone: ${campaign.tone}`,
          "",
          "## Business Plan",
          campaign.business_plan || "N/A",
          "",
          "## Offer",
          campaign.offer || "N/A",
        ].join("\n"),
      },
      {
        id: `outreach-${campaign.id}-log`,
        name: "audit_trail.log",
        folder: "Logs",
        kind: "log",
        content: queueLog,
      },
      {
        id: `outreach-${campaign.id}-templates`,
        name: "templates.json",
        folder: "Insights",
        kind: "json",
        content: JSON.stringify(campaign.generated_templates || {}, null, 2),
      },
    ],
  };
}

export default function OutreachPage() {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const leadWorkspace = useLeadSessionWorkspace();
  const [form, setForm] = useState<FormState>(initialForm);
  const [pastedLeads, setPastedLeads] = useState("Acme Textiles, Sarah Khan, sarah@example.com, https://example.com, USA apparel buyer");
  const [importedLeads, setImportedLeads] = useState<OutreachLeadInput[]>([]);
  const [jobs, setJobs] = useState<DeliveredJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

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
    const payload = await response.json();
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

  useEffect(() => {
    void loadDeliveredJobs();
  }, [supabase]);

  useEffect(() => {
    if (!campaign?.id) return;
    const interval = setInterval(() => void refreshCampaign(campaign.id), 3500);
    return () => clearInterval(interval);
  }, [campaign?.id]);

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
        body: JSON.stringify({ ...form, leads })
      });
      setCampaign(payload.campaign);
      setMessage("Campaign created. Generate the template next.");
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

  async function sendTestEmails() {
    if (!campaign) return;
    setLoading("send");
    setMessage("");
    try {
      const payload = await api(`/api/outreach/campaigns/${encodeURIComponent(campaign.id)}/launch`, { method: "POST" });
      setMessage(payload.warning || "Send request sent to n8n. Statuses will update below.");
      await refreshCampaign(campaign.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not launch campaign.");
    } finally {
      setLoading("");
    }
  }

  const generated = campaign?.generated_templates || null;
  const leads = campaign?.outreach_leads || [];
  const messages = campaign?.outreach_messages || [];
  const campaignExplorerContext = useMemo(() => buildOutreachExplorerContext(campaign), [campaign]);
  const explorerContext = useMemo(
    () => mergeWorkspaceContexts(leadWorkspace.explorerContext, campaignExplorerContext, "Outreach"),
    [campaignExplorerContext, leadWorkspace.explorerContext]
  );

  const mainEditor = (
    <div className="grid h-full min-h-0 w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
      <section className="min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-[#090d12] p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">Test campaign</p>
            <h1 className="text-lg font-semibold text-vercel-text">Create outreach run</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadDeliveredJobs()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-vercel-text hover:bg-white/10"
          >
            <RefreshCw size={14} />
            Jobs
          </button>
        </div>

        <div className="space-y-3">
          {(["business_plan", "offer", "target_buyer", "cta", "sender_name", "sender_email"] as Array<keyof FormState>).map((key) => (
            <label key={key} className="block space-y-1 text-xs text-vercel-muted">
              <span>{fieldLabels[key].label}</span>
              <input
                className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-vercel-text outline-none placeholder:text-vercel-muted/50 focus:border-cyan-300/40"
                value={form[key as keyof FormState]}
                placeholder={fieldLabels[key].placeholder}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}

          <label className="block space-y-1 text-xs text-vercel-muted">
            <span>Tone</span>
            <select
              className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-vercel-text outline-none focus:border-cyan-300/40"
              value={form.tone}
              onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))}
            >
              {["professional", "direct", "warm", "premium", "bold", "convincing"].map((tone) => (
                <option key={tone} value={tone}>{tone}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-xs text-vercel-muted">
            <span>Signature</span>
            <textarea
              className="h-20 w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-vercel-text outline-none placeholder:text-vercel-muted/50 focus:border-cyan-300/40"
              value={form.signature}
              placeholder={fieldLabels.signature.placeholder}
              onChange={(event) => setForm((current) => ({ ...current, signature: event.target.value }))}
            />
          </label>

          <label className="block space-y-1 text-xs text-vercel-muted">
            <span>Pasted test leads</span>
            <textarea
              className="h-28 w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-vercel-text outline-none placeholder:text-vercel-muted/50 focus:border-cyan-300/40"
              value={pastedLeads}
              placeholder={"Example:\nAcme Textiles, Sarah Khan, sarah@example.com, https://example.com, USA apparel buyer\nNorth Star Apparel, Mike Jones, mike@example.com, https://northstar.example, private-label hoodie buyer"}
              onChange={(event) => setPastedLeads(event.target.value)}
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              className="h-10 rounded-md border border-white/10 bg-black/40 px-3 text-xs text-vercel-text outline-none focus:border-cyan-300/40"
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
            >
              <option value="">Optional delivered scraper job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {new Date(job.created_at).toLocaleDateString()} - {job.target_region} - {job.refined_industry || job.original_industry}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void importJobLeads()}
              disabled={!selectedJobId || loading === "import"}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-vercel-text hover:bg-white/10 disabled:opacity-50"
            >
              {loading === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Import
            </button>
          </div>

          <p className="text-xs text-vercel-muted">
            Leads ready: {parsePastedLeads(pastedLeads).length + importedLeads.length}
          </p>

          <button
            type="button"
            onClick={() => void createCampaign()}
            disabled={Boolean(loading)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black hover:bg-cyan-100 disabled:opacity-60"
          >
            {loading === "create" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Create test campaign
          </button>
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-[#090d12] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">n8n automation</p>
            <h2 className="text-lg font-semibold text-vercel-text">Template and send control</h2>
          </div>
          {campaign && <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(campaign.status)}`}>{campaign.status}</span>}
        </div>

        {message && <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{message}</div>}

        {!campaign ? (
          <div className="rounded-xl border border-white/10 bg-black/30 p-6 text-sm text-vercel-muted">
            Create a campaign first. This page is isolated from the scraper worker and existing lead finder.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void generateTemplate()}
                disabled={Boolean(loading)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-60"
              >
                {loading === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Generate Template
              </button>
              <button
                type="button"
                onClick={() => void sendTestEmails()}
                disabled={Boolean(loading) || !generated}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-black hover:bg-emerald-200 disabled:opacity-60"
              >
                {loading === "send" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Send test emails
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-vercel-muted">Leads</p>
                <p className="mt-1 text-2xl font-semibold text-vercel-text">{leads.length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-vercel-muted">Messages</p>
                <p className="mt-1 text-2xl font-semibold text-vercel-text">{messages.length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-vercel-muted">Test recipient</p>
                <p className="mt-1 break-all text-sm font-medium text-vercel-text">ibrahimshkeel1@gmail.com</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-vercel-text">
                <MailCheck size={16} />
                <h3 className="text-sm font-semibold">Generated templates</h3>
              </div>
              {generated ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {["strategy", "initial_template", "followup_1_template", "followup_2_template", "sample_personalized_emails", "safety_notes"].map((key) => (
                    <div key={key} className="rounded-lg border border-white/10 bg-black/35 p-3">
                      <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-cyan-200">{key.replace(/_/g, " ")}</p>
                      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-vercel-muted">
                        {generatedText((generated as Record<string, unknown>)[key]) || "Not returned yet."}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-vercel-muted">No template yet.</p>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <h3 className="mb-3 text-sm font-semibold text-vercel-text">Message queue</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-vercel-muted">
                    <tr>
                      <th className="px-2 py-2">Step</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Lead</th>
                      <th className="px-2 py-2">Subject</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {messages.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-5 text-center text-vercel-muted">No messages queued yet.</td>
                      </tr>
                    )}
                    {messages.map((item) => {
                      const lead = leads.find((entry) => entry.id === item.lead_id);
                      return (
                        <tr key={item.id}>
                          <td className="px-2 py-2 text-vercel-text">{item.step}</td>
                          <td className="px-2 py-2"><span className={`rounded-full border px-2 py-0.5 ${statusClass(item.status)}`}>{item.status}</span></td>
                          <td className="px-2 py-2 text-vercel-muted">{lead?.company_name || lead?.email || item.original_to_email || "Lead"}</td>
                          <td className="px-2 py-2 text-vercel-muted">{item.subject || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <VSCodeLayout
      mode="outreach"
      title="Auto Email Automation"
      subtitle="Local n8n test flow, test-recipient safe"
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
          <div className="flex h-full w-full items-center justify-center text-xs text-[#8b949e]">
            Select a recent lead session to inspect logs.
          </div>
        )
      }
    />
  );
}
