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
  const [reportJobId, setReportJobId] = useState<string | null>(null);
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

  async function requestReport(jobId: string) {
    if (!supabase) return;
    setReportJobId(jobId);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Sign in to generate a report.");
      setReportJobId(null);
      return;
    }

    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    setReportJobId(null);
    if (!response.ok) {
      setMessage(payload.error || "Could not generate report.");
      return;
    }
    await loadJobs();
  }

  useEffect(() => {
    loadJobs();
  }, [refreshSignal]);

  return (
    <div className="ide-panel flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-vercel-text tracking-tight">Lead jobs</h2>
          <p className="text-sm text-vercel-muted">Payment review, worker progress, and export delivery live here.</p>
        </div>
        <button className="ide-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-medium" type="button" onClick={loadJobs} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {message && <div className="border border-[#ff6b6b] bg-[#220b0b] px-4 py-3 text-sm text-[#ff6b6b]">{message}</div>}

      <div className="overflow-x-auto border border-[#30363d] bg-[#0d1117]">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#30363d] bg-[#161b22]">
              <th className="py-4 px-4 font-medium text-vercel-muted">Status</th>
              <th className="py-4 px-4 font-medium text-vercel-muted">Pack</th>
              <th className="py-4 px-4 font-medium text-vercel-muted">Target</th>
              <th className="py-4 px-4 font-medium text-vercel-muted min-w-[280px]">Payment</th>
              <th className="py-4 px-4 font-medium text-vercel-muted">Exports & Logs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363d]">
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 px-4 text-center text-vercel-muted">
                  No jobs yet.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="group hover:bg-[#161b22]">
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
                    {job.payment_status !== "pending" && job.admin_note && <p className="mt-1 border border-[#30363d] bg-black p-2 text-xs text-vercel-muted">{job.admin_note}</p>}
                  </div>
                </td>
                <td className="py-4 px-4 align-top">
                  <div className="flex flex-col gap-2 items-start">
                    {job.lead_exports && job.lead_exports.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {job.lead_exports.map((file) => {
                          const isAudit = file.storage_path?.includes("audit");
                          return (
                            <button className={`ide-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${isAudit ? "border-[#ff6b6b] text-[#ff6b6b]" : ""}`} key={file.id} type="button" onClick={() => downloadExport(file)}>
                              {isAudit ? "AUDIT CSV" : file.format.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-vercel-muted italic">
                        {job.status === "failed" ? "Delivery failed (check logs)." : "Waiting for delivery"}
                      </span>
                    )}
                    {job.status === "delivered" &&
                      !(((job as any).job_events || []) as JobEvent[]).some((event) => event.status === "report_ready") && (
                        <button
                          type="button"
                          onClick={() => void requestReport(job.id)}
                          disabled={reportJobId === job.id}
                          className="ide-btn inline-flex items-center gap-1.5 border-[#00ff00] px-3 py-1.5 text-xs font-medium text-[#00ff00] disabled:opacity-60"
                        >
                          {reportJobId === job.id ? "Generating..." : "Generate Analysis"}
                        </button>
                      )}
                    
                    <button 
                      onClick={() => {
                        setActiveJobId(job.id);
                        setActiveLogs((job as any).job_events || []);
                      }}
                      className="ide-btn ide-btn-primary mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
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
