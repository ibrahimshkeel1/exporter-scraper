"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Play, Sparkles } from "lucide-react";
import { buyerTypes, exportFormats, getLeadPack, leadPacks, regions } from "../lib/pricing";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { TargetingPreflight } from "../lib/types";

type WizardProps = {
  onJobCreated?: () => void;
};

export function LeadRequestWizard({ onJobCreated }: WizardProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [packId, setPackId] = useState("starter");
  const [region, setRegion] = useState("USA");
  const [productCategory, setProductCategory] = useState("apparel importers wholesalers private label clothing buyers");
  const [buyerType, setBuyerType] = useState("Importers");
  const [notes, setNotes] = useState("");
  const [exportFormat, setExportFormat] = useState("all");
  const [adminBypassCode, setAdminBypassCode] = useState("");
  const [preflight, setPreflight] = useState<TargetingPreflight | null>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minScore, setMinScore] = useState(75);
  const [allowNoEmail, setAllowNoEmail] = useState(false);
  const [allowWeakBuyerEvidence, setAllowWeakBuyerEvidence] = useState(false);

  const pack = getLeadPack(packId);

  async function runPreflight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoadingPreflight(true);
    setPreflight(null);

    const response = await fetch("/api/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, productCategory, buyerType, notes })
    });

    const payload = await response.json();
    setLoadingPreflight(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not run targeting preflight.");
      return;
    }

    setPreflight(payload.preflight);
  }

  async function createJob() {
    if (!preflight) return;

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
        notes,
        exportFormat,
        adminBypassCode: adminBypassCode || undefined,
        advanced: showAdvanced
          ? {
              allowNoEmail,
              allowWeakBuyerEvidence,
              minScore
            }
          : undefined,
        preflight
      })
    });

    const payload = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not create job.");
      return;
    }

    if (payload.job?.status === "queued") {
      setMessage("Demo-bypassed job queued. Watch the dashboard for progress.");
    } else if (payload.job?.payment_status === "not_required") {
      setMessage(payload.triggerWarning ?? "Demo-bypassed job approved. Connect n8n to start the worker automatically.");
    } else {
      setMessage("Job created. Upload payment proof from the job table to start admin review.");
    }
    onJobCreated?.();
  }

  return (
    <div className="bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-vercel-text tracking-tight">New lead pack</h2>
          <p className="text-sm text-vercel-muted max-w-xl">Gemini preflights the target, then the VPS worker produces verified buyer leads.</p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          ${pack.priceUsd} / {pack.leads} leads
        </span>
      </div>

      <form className="flex flex-col gap-6" onSubmit={runPreflight}>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-vercel-text">Lead pack</label>
          <div className="flex bg-black/40 border border-white/10 rounded-lg p-1.5 shadow-inner">
            {leadPacks.map((leadPack) => (
              <button
                key={leadPack.id}
                className={`flex-1 flex flex-col items-center justify-center p-3 rounded-md transition-all text-sm ${leadPack.id === packId ? "bg-[#222] shadow-md border border-white/10 text-vercel-text scale-[1.02]" : "text-vercel-muted hover:text-vercel-text hover:bg-white/5"}`}
                type="button"
                onClick={() => setPackId(leadPack.id)}
              >
                <strong className="font-medium">{leadPack.name}</strong>
                <span className="text-xs opacity-80 mt-1">
                  ${leadPack.priceUsd} - {leadPack.leads} leads
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="region" className="text-sm font-medium text-vercel-text">Target market</label>
            <select id="region" className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20" value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="buyerType" className="text-sm font-medium text-vercel-text">Buyer type</label>
            <select
              id="buyerType"
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20"
              value={buyerType}
              onChange={(event) => setBuyerType(event.target.value)}
            >
              {buyerTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="product" className="text-sm font-medium text-vercel-text">Product or niche</label>
          <input
            id="product"
            className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
            value={productCategory}
            onChange={(event) => setProductCategory(event.target.value)}
            placeholder="socks hosiery importers wholesalers private label buyers"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="format" className="text-sm font-medium text-vercel-text">Delivery format</label>
            <select
              id="format"
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value)}
            >
              {exportFormats.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bypass" className="text-sm font-medium text-vercel-text">Admin bypass code</label>
            <input
              id="bypass"
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
              value={adminBypassCode}
              onChange={(event) => setAdminBypassCode(event.target.value)}
              placeholder="optional for demos"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="notes" className="text-sm font-medium text-vercel-text">Extra targeting notes</label>
          <textarea
            id="notes"
            className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 min-h-[100px] placeholder:text-gray-600"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Example: prioritize US importers and wholesalers that have supplier/vendor pages."
          />
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-vercel-muted hover:text-vercel-text transition-colors w-fit"
          >
            {showAdvanced ? "Hide advanced quality settings" : "Show advanced quality settings"}
          </button>
          
          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-black/30 p-5 rounded-lg border border-white/5">
              <div className="flex flex-col gap-2">
                <label htmlFor="minScore" className="text-sm font-medium text-vercel-text">Minimum Score (0-100)</label>
                <input
                  id="minScore"
                  type="number"
                  min="0"
                  max="100"
                  className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20"
                  value={minScore}
                  onChange={(event) => setMinScore(Number(event.target.value))}
                />
              </div>
              <div className="flex flex-col gap-3 justify-center pt-6">
                <label className="flex items-center gap-3 text-sm text-vercel-text cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-white/10 bg-black/50 text-vercel-accent focus:ring-vercel-accent focus:ring-offset-black transition-all"
                    checked={allowNoEmail}
                    onChange={(event) => setAllowNoEmail(event.target.checked)}
                  />
                  <span className="group-hover:text-white transition-colors">Allow leads without emails</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-vercel-text cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-white/10 bg-black/50 text-vercel-accent focus:ring-vercel-accent focus:ring-offset-black transition-all"
                    checked={allowWeakBuyerEvidence}
                    onChange={(event) => setAllowWeakBuyerEvidence(event.target.checked)}
                  />
                  <span className="group-hover:text-white transition-colors">Allow weak buyer evidence</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <button className="inline-flex items-center justify-center gap-2 bg-vercel-accent text-black hover:bg-white rounded-lg px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] w-fit mt-2" type="submit" disabled={loadingPreflight}>
          {loadingPreflight ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
          {loadingPreflight ? "Reviewing target..." : "Review target"}
        </button>
      </form>

      {preflight && (
        <div className={`p-6 rounded-xl border backdrop-blur-md ${preflight.riskLevel === "high" ? "bg-amber-500/5 border-amber-500/20" : "bg-white/5 border-white/10"}`}>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <strong className="font-semibold text-vercel-text text-lg">AI targeting review</strong>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${preflight.riskLevel === "high" ? "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]"}`}>{preflight.riskLevel} risk</span>
            </div>
            <p className="text-sm text-vercel-text leading-relaxed">{preflight.qualityNotes}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-black/30 p-4 rounded-lg border border-white/5">
              <div className="flex flex-col gap-1.5">
                <strong className="text-sm font-medium text-vercel-text flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-vercel-accent" /> Refined scraper seed
                </strong>
                <span className="text-sm text-vercel-muted pl-3.5">{preflight.refinedIndustry}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <strong className="text-sm font-medium text-vercel-text flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-vercel-accent" /> Minimum score
                </strong>
                <span className="text-sm text-vercel-muted pl-3.5">{preflight.recommendedMinScore}</span>
              </div>
            </div>
            {preflight.searchTerms.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <strong className="text-sm font-medium text-vercel-text">Search terms</strong>
                <div className="flex flex-wrap gap-2">
                  {preflight.searchTerms.map((term, idx) => (
                    <span key={idx} className="text-xs text-vercel-muted font-mono bg-black/40 border border-white/10 px-2 py-1 rounded">{term}</span>
                  ))}
                </div>
              </div>
            )}
            {preflight.warnings.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {preflight.warnings.map((warning, idx) => (
                  <p key={idx} className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg shadow-sm">{warning}</p>
                ))}
              </div>
            )}
            <button className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] w-fit mt-4" type="button" onClick={createJob} disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Play size={18} className="fill-black" aria-hidden="true" />}
              {submitting ? "Creating job..." : "Create job"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="flex items-center gap-3 text-sm text-vercel-text bg-black/50 border border-white/10 px-5 py-4 rounded-lg shadow-lg">
          <CheckCircle2 size={18} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" aria-hidden="true" /> {message}
        </div>
      )}
    </div>
  );
}
