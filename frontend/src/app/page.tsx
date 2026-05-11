import { ArrowRight, CheckCircle2, Database, Mail, ServerCog, Sparkles } from "lucide-react";
import { AuthPanel } from "../components/AuthPanel";
import { leadPacks } from "../lib/pricing";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-12 px-4 pb-12 pt-6 sm:px-6 lg:px-10">
      <header className="flex items-center justify-between border-b border-[#3c3c3c] pb-4">
        <a className="text-lg font-semibold text-vercel-text" href="/">ExportFlow</a>
        <div className="flex items-center gap-2">
          <a className="rounded-md border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-sm text-vercel-text hover:bg-[#333333]" href="/dashboard">Dashboard</a>
          <a className="rounded-md border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-sm text-vercel-text hover:bg-[#333333]" href="/search">Search</a>
          <a className="rounded-md border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-sm text-vercel-text hover:bg-[#333333]" href="/outreach">Outreach</a>
          <a className="rounded-md border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-sm text-vercel-text hover:bg-[#333333]" href="/admin">Admin</a>
        </div>
      </header>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div className="flex flex-col gap-6">
          <span className="text-sm font-medium text-vercel-muted tracking-tight">Pakistan exporters - Apparel/Textile v1</span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 pb-2">Verified buyer leads with evidence, contact routes, and export-ready files.</h1>
          <p className="text-vercel-muted text-lg leading-relaxed">
            ExportFlow turns a niche and target market into scored buyer leads for USA, UK, and Europe. Gemini reviews the brief, n8n queues the worker, and the VPS scraper delivers XLSX, CSV, or JSON.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <a className="group inline-flex items-center gap-2 bg-vercel-accent text-white hover:bg-[#1f8ad6] rounded-md px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" href="/search">
              Start a lead job <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
            <a className="inline-flex items-center gap-2 bg-[#252526] backdrop-blur-md border border-[#3c3c3c] text-vercel-text hover:bg-[#252526] rounded-md px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" href="/admin">
              Admin queue
            </a>
            <a className="inline-flex items-center gap-2 bg-[#252526] backdrop-blur-md border border-[#569cd6]/40 text-[#d4d4d4] hover:bg-[#1f3a4f] rounded-md px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" href="/outreach">
              Auto email test
            </a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-10 pt-8 border-t border-[#3c3c3c]">
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text">A+</strong>
              <span className="text-sm text-vercel-muted">Strict buyer evidence</span>
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text">3</strong>
              <span className="text-sm text-vercel-muted">Launch markets</span>
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text">24/7</strong>
              <span className="text-sm text-vercel-muted">VPS worker</span>
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold text-vercel-text">XLSX</strong>
              <span className="text-sm text-vercel-muted">Default delivery</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <AuthPanel />
          <div className="bg-gradient-to-b from-[#252526] to-[#1e1e1e] backdrop-blur-md border border-[#3c3c3c] rounded-xl p-8 flex flex-col gap-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div>
                <h2 className="text-xl font-semibold text-vercel-text mb-1">Launch offer</h2>
                <p className="text-sm text-vercel-muted">Sell verified packs first, outreach automation second.</p>
              </div>
              <CheckCircle2 className="text-emerald-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
              {leadPacks.map((pack) => (
                <div className="flex flex-col gap-1 p-4 rounded-lg bg-[#252526] border border-[#333333] hover:border-[#569cd6]/60 transition-colors" key={pack.id}>
                  <strong className="text-lg font-medium text-vercel-text">${pack.priceUsd}</strong>
                  <span className="text-sm text-vercel-muted mt-1">{pack.description}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-b from-[#252526] to-[#1e1e1e] backdrop-blur-md border border-[#3c3c3c] rounded-xl p-8 flex flex-col gap-6">
            <h2 className="text-xl font-semibold text-vercel-text">Operating flow</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-[#1f3a4f] border border-[#569cd6]/30 transition-colors group-hover:bg-[#264f78]">
                    <Sparkles size={18} className="text-[#569cd6]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">AI preflight</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">Refines search terms and flags weak targeting before payment.</p>
              </div>
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-[#263524] border border-[#6a9955]/30 transition-colors group-hover:bg-[#31452d]">
                    <ServerCog size={18} className="text-[#6a9955]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">Worker queue</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">n8n triggers the VPS scraper and records progress in Supabase.</p>
              </div>
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-[#3a3320] border border-[#dcdcaa]/30 transition-colors group-hover:bg-[#46402a]">
                    <Database size={18} className="text-[#dcdcaa]" aria-hidden="true" />
                  </div>
                  <strong className="font-medium text-vercel-text">Lead vault</strong>
                </div>
                <p className="text-sm text-vercel-muted pl-11">Supabase stores jobs, proofs, exports, and status events.</p>
              </div>
              <div className="flex flex-col gap-2 group cursor-default">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-[#3a2a22] border border-[#ce9178]/30 transition-colors group-hover:bg-[#4a352b]">
                    <Mail size={18} className="text-[#ce9178]" aria-hidden="true" />
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
