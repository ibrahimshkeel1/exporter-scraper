"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TerminalSquare } from "lucide-react";
import { PaymentProofUpload } from "./PaymentProofUpload";
import { StatusPill } from "./StatusPill";
import { JobLogViewer, JobEvent } from "./JobLogViewer";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { LeadJob } from "../lib/types";

type JobTableProps = {
  refreshSignal: number;
};

type LeadExportFile = NonNullable<LeadJob["lead_exports"]>[number];

export function JobTable({ refreshSignal }: JobTableProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [jobs, setJobs] = useState<LeadJob[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeLogs, setActiveLogs] = useState<JobEvent[] | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setMessage("");
    if (!supabase) {
      setLoading(false);
      setJobs([]);
      setMessage("Supabase public env vars are not configured.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      setJobs([]);
      setMessage("Sign in to see jobs.");
      return;
    }

    const response = await fetch("/api/jobs", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not load jobs.");
      return;
    }

    setJobs(payload.jobs ?? []);
  }

  async function downloadExport(file: LeadExportFile) {
    if (file.public_url) {
      window.open(file.public_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!supabase || !file.storage_path) {
      setMessage("No download URL is available for this export yet.");
      return;
    }

    const { data, error } = await supabase.storage.from("lead-exports").createSignedUrl(file.storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "Could not create a download link.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    loadJobs();
  }, [refreshSignal]);

  return (
    <div className="bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-vercel-text tracking-tight">Lead jobs</h2>
          <p className="text-sm text-vercel-muted">Payment review, worker progress, and export delivery live here.</p>
        </div>
        <button className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 text-vercel-text hover:bg-white/5 rounded-lg px-4 py-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" type="button" onClick={loadJobs} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {message && <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-lg shadow-sm">{message}</div>}

      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-black/40">
              <th className="py-4 px-4 font-medium text-vercel-muted">Status</th>
              <th className="py-4 px-4 font-medium text-vercel-muted">Pack</th>
              <th className="py-4 px-4 font-medium text-vercel-muted">Target</th>
              <th className="py-4 px-4 font-medium text-vercel-muted min-w-[280px]">Payment</th>
              <th className="py-4 px-4 font-medium text-vercel-muted">Exports & Logs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 px-4 text-center text-vercel-muted">
                  No jobs yet.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-white/5 transition-colors group">
                <td className="py-4 px-4 align-top">
                  <div className="flex flex-col gap-1.5 items-start">
                    <StatusPill status={job.status} />
                    <span className="text-xs text-vercel-muted opacity-70 group-hover:opacity-100 transition-opacity">{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                </td>
                <td className="py-4 px-4 align-top">
                  <div className="flex flex-col gap-1">
                    <strong className="font-medium text-vercel-text">{job.plan_name}</strong>
                    <span className="text-vercel-muted">{job.lead_limit} leads - ${job.price_usd}</span>
                  </div>
                </td>
                <td className="py-4 px-4 align-top">
                  <div className="flex flex-col gap-1">
                    <strong className="font-medium text-vercel-text">{job.target_region}</strong>
                    <span className="text-vercel-muted">{job.refined_industry || job.original_industry}</span>
                  </div>
                </td>
                <td className="py-4 px-4 align-top min-w-[280px]">
                  <div className="flex flex-col gap-2 items-start">
                    <StatusPill status={job.payment_status} />
                    {job.payment_status === "pending" && (
                      <PaymentProofUpload jobId={job.id} amountUsd={job.price_usd} onUploaded={loadJobs} />
                    )}
                    {job.payment_status !== "pending" && job.admin_note && <p className="text-xs text-vercel-muted mt-1 bg-black/40 p-2 rounded-md border border-white/5">{job.admin_note}</p>}
                  </div>
                </td>
                <td className="py-4 px-4 align-top">
                  <div className="flex flex-col gap-2 items-start">
                    {job.lead_exports && job.lead_exports.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {job.lead_exports.map((file) => {
                          const isAudit = file.storage_path?.includes("audit");
                          return (
                            <button className={`inline-flex items-center gap-1.5 ${isAudit ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20" : "bg-black/50 border border-white/10 text-vercel-text hover:bg-white/10"} rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm`} key={file.id} type="button" onClick={() => downloadExport(file)}>
                              {isAudit ? "AUDIT CSV" : file.format.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-vercel-muted italic">Waiting for delivery</span>
                    )}
                    
                    <button 
                      onClick={() => {
                        setActiveJobId(job.id);
                        setActiveLogs((job as any).job_events || []);
                      }}
                      className="inline-flex items-center gap-1.5 bg-vercel-accent text-black hover:bg-white rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_10px_rgba(255,255,255,0.1)] mt-2"
                    >
                      <TerminalSquare size={14} /> View Logs
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {activeJobId && activeLogs && (
        <JobLogViewer 
          jobId={activeJobId} 
          initialEvents={activeLogs} 
          onClose={() => {
            setActiveJobId(null);
            setActiveLogs(null);
          }} 
        />
      )}
    </div>
  );
}
