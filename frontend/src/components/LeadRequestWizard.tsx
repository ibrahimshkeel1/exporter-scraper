"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Play, Sparkles } from "lucide-react";
import { buyerTypes, exportFormats, getLeadPack, leadPacks, regions } from "@/lib/pricing";
import { createBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase-client";
import { TargetingPreflight } from "@/lib/types";

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
    <div className="panel panel-inner stack">
      <div className="row">
        <div className="tight-stack">
          <h2>New lead pack</h2>
          <p>Gemini preflights the target, then the VPS worker produces verified buyer leads.</p>
        </div>
        <span className="status status-delivered">${pack.priceUsd} / {pack.leads} leads</span>
      </div>

      <form className="stack" onSubmit={runPreflight}>
        <div className="field">
          <label>Lead pack</label>
          <div className="segmented">
            {leadPacks.map((leadPack) => (
              <button
                key={leadPack.id}
                className="segment"
                type="button"
                data-active={leadPack.id === packId}
                onClick={() => setPackId(leadPack.id)}
              >
                <strong>{leadPack.name}</strong>
                <span className="muted">
                  ${leadPack.priceUsd} - {leadPack.leads} verified leads
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="region">Target market</label>
            <select id="region" className="select" value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="buyerType">Buyer type</label>
            <select
              id="buyerType"
              className="select"
              value={buyerType}
              onChange={(event) => setBuyerType(event.target.value)}
            >
              {buyerTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="product">Product or niche</label>
          <input
            id="product"
            className="input"
            value={productCategory}
            onChange={(event) => setProductCategory(event.target.value)}
            placeholder="socks hosiery importers wholesalers private label buyers"
            required
          />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="format">Delivery format</label>
            <select
              id="format"
              className="select"
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
          <div className="field">
            <label htmlFor="bypass">Admin bypass code</label>
            <input
              id="bypass"
              className="input"
              value={adminBypassCode}
              onChange={(event) => setAdminBypassCode(event.target.value)}
              placeholder="optional for demos"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="notes">Extra targeting notes</label>
          <textarea
            id="notes"
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Example: prioritize US importers and wholesalers that have supplier/vendor pages."
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loadingPreflight}>
          {loadingPreflight ? <Loader2 size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {loadingPreflight ? "Reviewing target" : "Review target"}
        </button>
      </form>

      {preflight && (
        <div className={`notice ${preflight.riskLevel === "high" ? "warning" : ""}`}>
          <div className="stack">
            <div className="row">
              <strong>AI targeting review</strong>
              <span className="status status-running">{preflight.riskLevel} risk</span>
            </div>
            <p>{preflight.qualityNotes}</p>
            <div className="grid-2">
              <div className="tight-stack">
                <strong>Refined scraper seed</strong>
                <span>{preflight.refinedIndustry}</span>
              </div>
              <div className="tight-stack">
                <strong>Minimum score</strong>
                <span>{preflight.recommendedMinScore}</span>
              </div>
            </div>
            {preflight.searchTerms.length > 0 && (
              <div className="tight-stack">
                <strong>Search terms</strong>
                <p>{preflight.searchTerms.join(" | ")}</p>
              </div>
            )}
            {preflight.warnings.length > 0 && <p>{preflight.warnings.join(" ")}</p>}
            <button className="btn btn-primary" type="button" onClick={createJob} disabled={submitting}>
              {submitting ? <Loader2 size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {submitting ? "Creating job" : "Create job"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="notice">
          <CheckCircle2 size={16} aria-hidden="true" /> {message}
        </div>
      )}
    </div>
  );
}
