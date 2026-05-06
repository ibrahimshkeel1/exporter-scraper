"use client";

import { useEffect, useMemo, useState } from "react";
import { FileJson2, FileSpreadsheet, RefreshCw, TerminalSquare } from "lucide-react";
import { createBrowserSupabase, isSupabaseConfigured } from "../../lib/supabase-client";
import { LeadJob } from "../../lib/types";

export function RecentJobsWidget() {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [jobs, setJobs] = useState<LeadJob[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadJobs() {
    setLoading(true);
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/jobs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      const allJobs = payload.jobs ?? [];
      const completed = allJobs
        .filter((j: LeadJob) => j.status === "delivered" || j.status === "failed")
        .slice(0, 5);
      setJobs(completed);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  async function downloadExport(job: LeadJob, file: NonNullable<LeadJob["lead_exports"]>[number]) {
    if (file.public_url) {
      window.open(file.public_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!supabase || !file.storage_path) return;
    const { data, error } = await supabase.storage.from("lead-exports").createSignedUrl(file.storage_path, 60 * 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-vercel-muted">Last 5 completed</span>
        <button
          type="button"
          onClick={() => void loadJobs()}
          disabled={loading}
          className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-[10px]"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {jobs.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-vercel-muted">
            No completed jobs yet.
          </div>
        )}
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center justify-between gap-2 border border-[#30363d] bg-[#0d1117] p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 ${
                    job.status === "delivered" ? "bg-[#00ff00]" : "bg-[#ff6b6b]"
                  }`}
                />
                <span className="truncate text-xs font-medium text-vercel-text">
                  {job.refined_industry || job.original_industry}
                </span>
                <span className="text-[10px] font-mono text-[#8b949e]">{job.target_region}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-vercel-muted">
                {new Date(job.created_at).toLocaleDateString()} · {job.plan_name}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {job.lead_exports?.map((file) => {
                const isAudit = file.storage_path?.includes("audit");
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => void downloadExport(job, file)}
                    className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-[10px]"
                    title={isAudit ? "Download audit" : "Download leads"}
                  >
                    {isAudit ? <FileSpreadsheet size={10} /> : <FileJson2 size={10} />}
                    {isAudit ? "AUDIT" : "LEADS"}
                  </button>
                );
              })}
              <button
                type="button"
                className="ide-btn inline-flex items-center gap-1 border-[#00ffff] px-2 py-1 text-[10px] text-[#00ffff]"
                title="Re-run job"
              >
                <RefreshCw size={10} />
                Re-run
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
