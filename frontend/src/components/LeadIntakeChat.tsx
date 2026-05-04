"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, Sparkles, UserRound } from "lucide-react";
import { exportFormats, getLeadPack, leadPacks, regions } from "../lib/pricing";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { TargetingPreflight } from "../lib/types";

type IntakeMessage = {
  role: "assistant" | "user";
  content: string;
};

type LeadIntakeChatProps = {
  onJobCreated?: () => void;
};

const initialMessages: IntakeMessage[] = [
  {
    role: "assistant",
    content:
      "Tell me about your business, website, offer, current sales plan, and the kind of customers you want. After you send context, click Build AI brief and I’ll turn it into a lead-search plan before we run the scraper."
  }
];

function briefValue(value: unknown, fallback = "Not specified") {
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "string") return value.trim() || fallback;
  return fallback;
}

export function LeadIntakeChat({ onJobCreated }: LeadIntakeChatProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [messages, setMessages] = useState<IntakeMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [brief, setBrief] = useState<TargetingPreflight | null>(null);
  const [packId, setPackId] = useState("starter");
  const [market, setMarket] = useState("International");
  const [exportFormat, setExportFormat] = useState("all");
  const [adminBypassCode, setAdminBypassCode] = useState("");
  const [minScore, setMinScore] = useState(55);
  const [allowNoEmail, setAllowNoEmail] = useState(true);
  const [allowWeakBuyerEvidence, setAllowWeakBuyerEvidence] = useState(true);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const pack = getLeadPack(packId);
  const userMessages = messages.filter((item) => item.role === "user");
  const canAnalyze = userMessages.length > 0 && !loadingBrief;

  function appendUserMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      { role: "user", content },
      {
        role: "assistant",
        content:
          "Context captured. Add more details if you want, or click Build AI brief to confirm the audience, markets, search terms, and lead-quality rules."
      }
    ]);
    setDraft("");
    setBrief(null);
    setMessage("");
  }

  async function analyzeBrief() {
    setLoadingBrief(true);
    setMessage("");

    const response = await fetch("/api/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: market,
        productCategory: brief?.refinedIndustry || "",
        buyerType: "",
        notes: "",
        conversation: messages
      })
    });

    const payload = await response.json();
    setLoadingBrief(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not build the AI lead brief.");
      return;
    }

    const nextBrief = payload.preflight as TargetingPreflight;
    setBrief(nextBrief);

    if (nextBrief.targetMarkets?.[0]) {
      const inferredMarket = nextBrief.targetMarkets[0];
      const knownRegion = [...regions, "International"].find((region) =>
        inferredMarket.toLowerCase().includes(region.toLowerCase())
      );
      setMarket(knownRegion || inferredMarket);
    }

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: nextBrief.needsMoreInfo && nextBrief.followUpQuestions?.length
          ? `I can draft a search, but I need more precision: ${nextBrief.followUpQuestions.join(" ")}`
          : `I built a lead-search brief for ${nextBrief.idealCustomerProfile || nextBrief.refinedIndustry}. Review it below, adjust quality settings if needed, then create the job.`
      }
    ]);
  }

  async function createJob() {
    if (!brief) return;

    setSubmitting(true);
    setMessage("");

    if (!supabase) {
      setSubmitting(false);
      setMessage("Supabase public env vars are not configured.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setSubmitting(false);
      setMessage("Sign in before creating a lead job.");
      return;
    }

    const productCategory = brief.offerSummary || brief.refinedIndustry || userMessages.at(-1)?.content || "AI lead search";
    const buyerType = brief.buyerTypes?.[0] || brief.idealCustomerProfile || "Ideal customers";
    const region = market || brief.targetMarkets?.[0] || "International";

    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        packId,
        region,
        productCategory,
        buyerType,
        notes: messages.map((item) => `${item.role}: ${item.content}`).join("\n"),
        exportFormat,
        adminBypassCode: adminBypassCode || undefined,
        preflight: brief,
        conversation: messages,
        advanced: {
          allowNoEmail,
          allowWeakBuyerEvidence,
          minScore
        }
      })
    });

    const payload = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not create job.");
      return;
    }

    setMessage(payload.job?.status === "queued" ? "AI lead job queued. Watch live logs for progress." : "Lead job created. Upload payment proof from the job table to start admin review.");
    onJobCreated?.();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_34%),linear-gradient(180deg,#171717,#070707)] shadow-2xl">
      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="flex min-h-[620px] flex-col border-b border-white/10 xl:border-b-0 xl:border-r">
          <div className="border-b border-white/10 px-6 py-5">
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300/80">AI lead strategist</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-vercel-text">Build a lead search by chatting, not filling forms.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vercel-muted">Gemini analyzes your business context, confirms the audience, and creates the scraper brief used for discovery and scoring.</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                {item.role === "assistant" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                    <Bot size={16} />
                  </div>
                )}
                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-lg ${item.role === "user" ? "bg-white text-black" : "border border-white/10 bg-black/40 text-vercel-text"}`}>
                  {item.content}
                </div>
                {item.role === "user" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white">
                    <UserRound size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 bg-black/30 p-4">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={appendUserMessage}>
              <textarea
                className="min-h-[92px] flex-1 resize-none rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm leading-6 text-vercel-text outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Example: We run a web design agency for dental clinics. Website: example.com. We want clinics in UK and UAE with weak websites and visible contact emails."
              />
              <div className="flex min-w-[190px] flex-col gap-3">
                <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-100" type="submit">
                  <Send size={16} />
                  Send
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={analyzeBrief} disabled={!canAnalyze}>
                  {loadingBrief ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Build AI brief
                </button>
              </div>
            </form>
          </div>
        </section>

        <aside className="space-y-5 p-5">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-vercel-muted">Run settings</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/40 p-1.5">
                {leadPacks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPackId(item.id)}
                    className={`rounded-lg px-2 py-2 text-xs font-medium transition ${item.id === packId ? "bg-white text-black" : "text-vercel-muted hover:bg-white/10 hover:text-white"}`}
                  >
                    {item.leads} leads
                  </button>
                ))}
              </div>
              <select className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-vercel-text" value={market} onChange={(event) => setMarket(event.target.value)}>
                {[...regions, "International"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-vercel-text" value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                {exportFormats.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <input className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-vercel-text placeholder:text-gray-600" value={adminBypassCode} onChange={(event) => setAdminBypassCode(event.target.value)} placeholder="Admin bypass code for demos" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-vercel-muted">Quality</h3>
            <label className="mt-4 flex flex-col gap-2 text-sm text-vercel-text">
              Minimum score: {minScore}
              <input type="range" min="35" max="85" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} />
            </label>
            <label className="mt-4 flex items-center gap-3 text-sm text-vercel-text">
              <input type="checkbox" checked={allowWeakBuyerEvidence} onChange={(event) => setAllowWeakBuyerEvidence(event.target.checked)} />
              Allow exploratory/weak-fit evidence
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm text-vercel-text">
              <input type="checkbox" checked={allowNoEmail} onChange={(event) => setAllowNoEmail(event.target.checked)} />
              Allow contact forms or LinkedIn when email is missing
            </label>
          </div>

          {brief && (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 size={17} />
                <h3 className="font-semibold">AI lead brief</h3>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-vercel-muted">Business</dt>
                  <dd className="text-vercel-text">{briefValue(brief.businessSummary || brief.offerSummary)}</dd>
                </div>
                <div>
                  <dt className="text-vercel-muted">Ideal clients</dt>
                  <dd className="text-vercel-text">{briefValue(brief.buyerTypes)}</dd>
                </div>
                <div>
                  <dt className="text-vercel-muted">Markets</dt>
                  <dd className="text-vercel-text">{briefValue(brief.targetMarkets || [market])}</dd>
                </div>
                <div>
                  <dt className="text-vercel-muted">Search strategy</dt>
                  <dd className="text-vercel-text">{brief.searchTerms.slice(0, 4).join(" | ")}</dd>
                </div>
                <div>
                  <dt className="text-vercel-muted">Qualification signals</dt>
                  <dd className="text-vercel-text">{briefValue(brief.qualificationSignals)}</dd>
                </div>
              </dl>
              {brief.warnings.length > 0 && <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-200">{brief.warnings.join(" ")}</p>}
              <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={createJob} disabled={submitting || Boolean(brief.needsMoreInfo)}>
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {submitting ? "Creating job..." : `Create ${pack.leads}-lead job`}
              </button>
            </div>
          )}

          {message && <div className="rounded-2xl border border-white/10 bg-black/50 p-4 text-sm text-vercel-text">{message}</div>}
        </aside>
      </div>
    </div>
  );
}
