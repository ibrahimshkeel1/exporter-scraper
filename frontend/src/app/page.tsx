import { ArrowRight, CheckCircle2, Database, Mail, ServerCog, Sparkles } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { leadPacks } from "@/lib/pricing";

export default function HomePage() {
  return (
    <main className="flex flex-col gap-12 pb-12">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div className="flex flex-col gap-6">
          <span className="text-sm font-medium text-vercel-muted tracking-tight">Pakistan exporters - Apparel/Textile v1</span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 pb-2">Verified buyer leads with evidence, contact routes, and export-ready files.</h1>
          <p className="text-vercel-muted text-lg leading-relaxed">
            ExportFlow turns a niche and target market into scored buyer leads for USA, UK, and Europe. Gemini reviews the brief, n8n queues the worker, and the VPS scraper delivers XLSX, CSV, or JSON.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <a className="group inline-flex items-center gap-2 bg-vercel-accent text-black hover:bg-white rounded-md px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]" href="/dashboard">
              Start a lead job <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
            <a className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 text-vercel-text hover:bg-white/5 rounded-md px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" href="/admin">
              Admin queue
            </a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-10 pt-8 border-t border-white/10">
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">A+</strong>
              <span className="text-sm text-vercel-muted">Strict buyer evidence</span>
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">3</strong>
              <span className="text-sm text-vercel-muted">Launch markets</span>
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">24/7</strong>
              <span className="text-sm text-vercel-muted">VPS worker</span>
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">XLSX</strong>
              <span className="text-sm text-vercel-muted">Default delivery</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <AuthPanel />
          <div className="bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex flex-col gap-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div>
                <h2 className="text-xl font-semibold text-vercel-text mb-1">Launch offer</h2>
                <p className="text-sm text-vercel-muted">Sell verified packs first, outreach automation second.</p>
              </div>
              <CheckCircle2 className="text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)] shrink-0" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
              {leadPacks.map((pack) => (
                <div className="flex flex-col gap-1 p-4 rounded-lg bg-black/40 border border-white/5 hover:border-white/20 transition-colors" key={pack.id}>
                  <strong className="text-lg font-medium text-vercel-text">${pack.priceUsd}</strong>
                  <span className="text-sm text-vercel-muted mt-1">{pack.description}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex flex-col gap-6">
            <h2 className="text-xl font-semibold text-vercel-text">Operating flow</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/20 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all">
                    <Sparkles size={18} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">AI preflight</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">Refines search terms and flags weak targeting before payment.</p>
              </div>
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-teal-500/10 border border-teal-500/20 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                    <ServerCog size={18} className="text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">Worker queue</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">n8n triggers the VPS scraper and records progress in Supabase.</p>
              </div>
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-purple-500/10 border border-purple-500/20 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all">
                    <Database size={18} className="text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">Lead vault</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">Supabase stores jobs, proofs, exports, and status events.</p>
              </div>
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                    <Mail size={18} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">Email option</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">Customers can be notified when files are ready.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
