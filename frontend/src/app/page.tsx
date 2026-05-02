import { ArrowRight, CheckCircle2, Database, Mail, ServerCog, Sparkles } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { leadPacks } from "@/lib/pricing";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">Pakistan exporters · Apparel/Textile v1</span>
          <h1>Verified buyer leads with evidence, contact routes, and export-ready files.</h1>
          <p>
            ExportFlow turns a niche and target market into scored buyer leads for USA, UK, and Europe. Gemini reviews the brief, n8n queues the worker, and the VPS scraper delivers XLSX, CSV, or JSON.
          </p>
          <div className="row" style={{ justifyContent: "flex-start", marginTop: 24 }}>
            <a className="btn btn-primary" href="/dashboard">
              Start a lead job <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a className="btn btn-secondary" href="/admin">
              Admin queue
            </a>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <strong>A+</strong>
              <span className="muted">Strict buyer evidence</span>
            </div>
            <div className="stat">
              <strong>3</strong>
              <span className="muted">Launch markets</span>
            </div>
            <div className="stat">
              <strong>24/7</strong>
              <span className="muted">VPS worker</span>
            </div>
            <div className="stat">
              <strong>XLSX</strong>
              <span className="muted">Default delivery</span>
            </div>
          </div>
        </div>

        <div className="stack">
          <AuthPanel />
          <div className="panel panel-inner stack">
            <div className="row">
              <div>
                <h2>Launch offer</h2>
                <p>Sell verified packs first, outreach automation second.</p>
              </div>
              <CheckCircle2 color="#047857" aria-hidden="true" />
            </div>
            <div className="grid-3">
              {leadPacks.map((pack) => (
                <div className="stat" key={pack.id}>
                  <strong>${pack.priceUsd}</strong>
                  <span>{pack.leads} verified leads</span>
                  <p>{pack.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="panel panel-inner stack">
            <h2>Operating flow</h2>
            <div className="grid-2">
              <div className="tight-stack">
                <Sparkles size={18} color="#2563eb" aria-hidden="true" />
                <strong>AI preflight</strong>
                <p>Refines search terms and flags weak targeting before payment.</p>
              </div>
              <div className="tight-stack">
                <ServerCog size={18} color="#0f766e" aria-hidden="true" />
                <strong>Worker queue</strong>
                <p>n8n triggers the VPS scraper and records progress in Supabase.</p>
              </div>
              <div className="tight-stack">
                <Database size={18} color="#7c3aed" aria-hidden="true" />
                <strong>Lead vault</strong>
                <p>Supabase stores jobs, proofs, exports, and status events.</p>
              </div>
              <div className="tight-stack">
                <Mail size={18} color="#b45309" aria-hidden="true" />
                <strong>Email option</strong>
                <p>Customers can be notified when files are ready.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
