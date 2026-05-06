"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileJson2, FileSpreadsheet, RefreshCw, TerminalSquare } from "lucide-react";
import { PaymentProofUpload } from "./PaymentProofUpload";
import { StatusPill } from "./StatusPill";
import { JobLogViewer, JobEvent } from "./JobLogViewer";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { LeadJob } from "../lib/types";

type JobTableProps = {
  refreshSignal: number;
  compact?: boolean;
  initialJobs?: LeadJob[];
  onSelectedJobChange?: (job: JobTableSelection) => void;
  onJobsChange?: (jobs: LeadJob[]) => void;
  selectedJobId?: string | null;
  onSelectedJobIdChange?: (jobId: string | null) => void;
  showFilesPane?: boolean;
};

type LeadExportFile = NonNullable<LeadJob["lead_exports"]>[number];
export type JobTableSelection = (LeadJob & { job_events?: JobEvent[] }) | null;

export function JobTable({
  refreshSignal,
  compact = false,
  initialJobs = [],
  onSelectedJobChange,
  onJobsChange,
  selectedJobId: controlledSelectedJobId,
  onSelectedJobIdChange,
  showFilesPane = true,
}: JobTableProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [jobs, setJobs] = useState<LeadJob[]>(initialJobs);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportJobId, setReportJobId] = useState<string | null>(null);
  const [activeLogs, setActiveLogs] = useState<JobEvent[] | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobsCollapsed, setJobsCollapsed] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [internalSelectedJobId, setInternalSelectedJobId] = useState<string | null>(null);

  const selectedJobId = controlledSelectedJobId !== undefined ? controlledSelectedJobId : internalSelectedJobId;

  function setSelectedJobId(nextJobId: string | null) {
    if (controlledSelectedJobId === undefined) {
      setInternalSelectedJobId(nextJobId);
    }
    onSelectedJobIdChange?.(nextJobId);
  }

  async function loadJobs() {
    setLoading(true);
    setMessage("");
    if (!supabase) {
      setLoading(false);
      setJobs([]);
      onJobsChange?.([]);
      setMessage("Supabase public env vars are not configured.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      setJobs([]);
      onJobsChange?.([]);
      setMessage("Sign in to see jobs.");
      return;
    }

    const response = await fetch("/api/jobs", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      onJobsChange?.([]);
      setMessage(payload.error ?? "Could not load jobs.");
      return;
    }

    const fetchedJobs = (payload.jobs ?? []) as LeadJob[];
    setJobs(fetchedJobs);
    onJobsChange?.(fetchedJobs);
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
    void loadJobs();
  }, [refreshSignal]);

  useEffect(() => {
    if (initialJobs.length > 0) {
      setJobs(initialJobs);
    }
  }, [initialJobs]);

  useEffect(() => {
    if (jobs.length === 0) {
      if (selectedJobId !== null) setSelectedJobId(null);
      return;
    }
    if (!selectedJobId) {
      setSelectedJobId(jobs[0].id);
      return;
    }
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(jobs[0]?.id ?? null);
    }
  }, [jobs, selectedJobId]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  useEffect(() => {
    onSelectedJobChange?.((selectedJob as LeadJob & { job_events?: JobEvent[] }) ?? null);
  }, [onSelectedJobChange, selectedJob]);

  if (compact) {
    return (
      <div className="ide-panel flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-3 py-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-vercel-text">Jobs</h2>
            <p className="text-[11px] text-vercel-muted">Session queue and status</p>
          </div>
          <button className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-[10px]" type="button" onClick={() => void loadJobs()} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {message && <div className="border-b border-[#30363d] bg-[#220b0b] px-3 py-2 text-xs text-[#ff6b6b]">{message}</div>}

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[#30363d]">
              <button
                type="button"
                onClick={() => setJobsCollapsed((value) => !value)}
                className="flex w-full items-center justify-between bg-[#0d1117] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#8b949e]"
              >
                <span>Jobs ({jobs.length})</span>
                {jobsCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {!jobsCollapsed && (
                <div className="max-h-[46vh] overflow-y-auto">
                  <div className="divide-y divide-[#30363d]">
                    {jobs.length === 0 && <p className="px-3 py-3 text-xs text-vercel-muted">No jobs yet.</p>}
                    {jobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setSelectedJobId(job.id)}
                        className={`w-full space-y-1 px-3 py-2 text-left ${selectedJobId === job.id ? "bg-[#13212e]" : "bg-transparent hover:bg-[#161b22]"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <StatusPill status={job.status} />
                          <span className="font-mono text-[10px] text-[#8b949e]">{job.id.slice(0, 8)}</span>
                        </div>
                        <p className="text-xs text-vercel-text">{job.target_region} | {job.refined_industry || job.original_industry}</p>
                        <p className="text-[11px] text-vercel-muted">{new Date(job.created_at).toLocaleString()}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {showFilesPane && (
              <div className="min-h-0 flex-1 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFilesCollapsed((value) => !value)}
                  className="flex w-full items-center justify-between border-b border-[#30363d] bg-[#0d1117] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#8b949e]"
                >
                  <span>Files & Audit</span>
                  {filesCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {!filesCollapsed && (
                  <div className="min-h-0 h-full overflow-y-auto p-3">
                    {!selectedJob && <p className="text-xs text-vercel-muted">Select a job to view files.</p>}
                    {selectedJob && (
                      <div className="space-y-3">
                        <div className="border border-[#30363d] bg-black p-2 text-xs text-vercel-text">
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8b949e]">Selected Job</p>
                          <p>{selectedJob.target_region} | {selectedJob.refined_industry || selectedJob.original_industry}</p>
                          {selectedJob.error_message && <p className="mt-1 text-[#ff6b6b]">{selectedJob.error_message}</p>}
                        </div>

                        <div className="space-y-2">
                          {(selectedJob.lead_exports || []).length > 0 ? (
                            selectedJob.lead_exports?.map((file) => {
                              const isAudit = file.storage_path?.includes("audit");
                              return (
                                <button
                                  className="ide-btn inline-flex w-full items-center justify-between gap-2 px-3 py-2 text-xs"
                                  key={file.id}
                                  type="button"
                                  onClick={() => void downloadExport(file)}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    {isAudit ? <FileSpreadsheet size={12} /> : <FileJson2 size={12} />}
                                    {file.storage_path?.split("/").at(-1) || file.format.toUpperCase()}
                                  </span>
                                  <span className="text-[#8b949e]">{file.row_count ?? "-"} rows</span>
                                </button>
                              );
                            })
                          ) : (
                            <p className="text-xs text-vercel-muted">
                              {selectedJob.status === "failed" ? "No delivered files. Check logs." : "Waiting for delivery files."}
                            </p>
                          )}
                        </div>

                        {selectedJob.status === "delivered" &&
                          !(((selectedJob as any).job_events || []) as JobEvent[]).some((event) => event.status === "report_ready") && (
                            <button
                              type="button"
                              onClick={() => void requestReport(selectedJob.id)}
                              disabled={reportJobId === selectedJob.id}
                              className="ide-btn inline-flex w-full items-center justify-center gap-1.5 border-[#00ff00] px-3 py-1.5 text-xs font-medium text-[#00ff00] disabled:opacity-60"
                            >
                              {reportJobId === selectedJob.id ? "Generating..." : "Generate Analysis"}
                            </button>
                          )}

                        {selectedJob && (
                          <button
                            onClick={() => {
                              setActiveJobId(selectedJob.id);
                              setActiveLogs((selectedJob as any).job_events || []);
                            }}
                            className="ide-btn ide-btn-primary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium"
                          >
                            <TerminalSquare size={14} /> View Logs
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
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
