"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MailCheck, Play, RefreshCw, Sparkles, Upload } from "lucide-react";
import { WorkspaceShell } from "../../components/WorkspaceShell";
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
  signature: "Best,\nExportFlow",
  sender_name: "ExportFlow",
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
  if (["template_ready", "test_sent", "sent", "active"].includes(status)) return "text-[#00ff00]";
  if (["failed"].includes(status)) return "text-red-400";
  if (["generating", "launching", "sending", "queued"].includes(status)) return "text-[#00ffff]";
  return "text-[#8b949e]";
}

export default function OutreachPage() {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
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

  return (
    <WorkspaceShell mode="outreach" title="Outreach Funnel" subtitle="Email campaign builder + n8n automation">
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
        <section className="ide-panel min-h-0 overflow-y-auto p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#00ffff]">Test campaign</p>
              <h1 className="text-lg font-semibold text-vercel-text">Create outreach run</h1>
            </div>
            <button
              type="button"
              onClick={() => void loadDeliveredJobs()}
              className="ide-btn inline-flex h-9 items-center gap-2 px-3 text-xs"
            >
              <RefreshCw size={14} />
              Jobs
            </button>
          </div>

          <div className="space-y-3">
            {(["business_plan", "offer", "target_buyer", "cta", "sender_name", "sender_email"] as Array<keyof FormState>).map((key) => (
              <label key={key} className="block space-y-1 text-xs text-[#8b949e]">
                <span>{fieldLabels[key].label}</span>
                <input
                  className="ide-input h-10 w-full px-3 text-sm"
                  value={form[key as keyof FormState]}
                  placeholder={fieldLabels[key].placeholder}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}

            <label className="block space-y-1 text-xs text-[#8b949e]">
              <span>Tone</span>
              <select
                className="ide-input h-10 w-full px-3 text-sm"
                value={form.tone}
                onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))}
              >
                {["professional", "direct", "warm", "premium", "bold", "convincing"].map((tone) => (
                  <option key={tone} value={tone}>{tone}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-xs text-[#8b949e]">
              <span>Signature</span>
              <textarea
                className="ide-input h-20 w-full resize-none px-3 py-2 text-sm"
                value={form.signature}
                placeholder={fieldLabels.signature.placeholder}
                onChange={(event) => setForm((current) => ({ ...current, signature: event.target.value }))}
              />
            </label>

            <label className="block space-y-1 text-xs text-[#8b949e]">
              <span>Pasted test leads</span>
              <textarea
                className="ide-input h-28 w-full resize-none px-3 py-2 font-mono text-xs"
                value={pastedLeads}
                placeholder={"Example:\nAcme Textiles, Sarah Khan, sarah@example.com, https://example.com, USA apparel buyer\nNorth Star Apparel, Mike Jones, mike@example.com, https://northstar.example, private-label hoodie buyer"}
                onChange={(event) => setPastedLeads(event.target.value)}
              />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                className="ide-input h-10 px-3 text-xs"
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
                className="ide-btn inline-flex h-10 items-center gap-2 px-3 text-xs disabled:opacity-50"
              >
                {loading === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Import
              </button>
            </div>

            <p className="text-xs text-[#8b949e]">
              Leads ready: {parsePastedLeads(pastedLeads).length + importedLeads.length}
            </p>

            <button
              type="button"
              onClick={() => void createCampaign()}
              disabled={Boolean(loading)}
              className="ide-btn ide-btn-primary inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-60"
            >
              {loading === "create" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Create test campaign
            </button>
          </div>
        </section>

        <section className="ide-panel min-h-0 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#00ffff]">n8n automation</p>
              <h2 className="text-lg font-semibold text-vercel-text">Template and send control</h2>
            </div>
            {campaign && <span className={`font-mono text-xs ${statusClass(campaign.status)}`}>{campaign.status.toUpperCase()}</span>}
          </div>

          {message && <div className="mb-4 border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{message}</div>}

          {!campaign ? (
            <div className="ide-panel border-dashed p-6 text-sm text-[#8b949e]">
              Create a campaign first. This page connects to the scraper via job imports and sends emails through n8n.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void generateTemplate()}
                  disabled={Boolean(loading)}
                  className="ide-btn inline-flex h-11 items-center justify-center gap-2 border-[#00ffff]/30 px-4 text-sm font-semibold text-[#00ffff] hover:bg-[#00ffff]/10 disabled:opacity-60"
                >
                  {loading === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Generate Template
                </button>
                <button
                  type="button"
                  onClick={() => void sendTestEmails()}
                  disabled={Boolean(loading) || !generated}
                  className="ide-btn ide-btn-primary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-60"
                >
                  {loading === "send" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Send test emails
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                <div className="ide-panel p-3">
                  <p className="text-xs text-[#8b949e]">Leads</p>
                  <p className="mt-1 text-2xl font-semibold text-vercel-text">{leads.length}</p>
                </div>
                <div className="ide-panel p-3">
                  <p className="text-xs text-[#8b949e]">Messages</p>
                  <p className="mt-1 text-2xl font-semibold text-vercel-text">{messages.length}</p>
                </div>
                <div className="ide-panel p-3">
                  <p className="text-xs text-[#8b949e]">Test mode</p>
                  <p className="mt-1 break-all text-sm font-medium text-vercel-text">{process.env.NEXT_PUBLIC_OUTREACH_TEST_RECIPIENT || "n8n configured"}</p>
                </div>
              </div>

              <div className="ide-panel p-4">
                <div className="mb-3 flex items-center gap-2 text-vercel-text">
                  <MailCheck size={16} />
                  <h3 className="text-sm font-semibold">Generated templates</h3>
                </div>
                {generated ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {["strategy", "initial_template", "followup_1_template", "followup_2_template", "sample_personalized_emails", "safety_notes"].map((key) => (
                      <div key={key} className="ide-panel bg-black/40 p-3">
                        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#00ffff]">{key.replace(/_/g, " ")}</p>
                        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#8b949e]">
                          {generatedText((generated as Record<string, unknown>)[key]) || "Not returned yet."}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#8b949e]">No template yet.</p>
                )}
              </div>

              <div className="ide-panel p-4">
                <h3 className="mb-3 text-sm font-semibold text-vercel-text">Message queue</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[#8b949e]">
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
                          <td colSpan={4} className="px-2 py-5 text-center text-[#8b949e]">No messages queued yet.</td>
                        </tr>
                      )}
                      {messages.map((item) => {
                        const lead = leads.find((entry) => entry.id === item.lead_id);
                        return (
                          <tr key={item.id}>
                            <td className="px-2 py-2 text-vercel-text">{item.step}</td>
                            <td className="px-2 py-2"><span className={`font-mono ${statusClass(item.status)}`}>{item.status}</span></td>
                            <td className="px-2 py-2 text-[#8b949e]">{lead?.company_name || lead?.email || item.original_to_email || "Lead"}</td>
                            <td className="px-2 py-2 text-[#8b949e]">{item.subject || "-"}</td>
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
    </WorkspaceShell>
  );
}
