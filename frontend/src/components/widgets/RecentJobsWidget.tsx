"use client";

import { useMemo } from "react";
import { FileJson2, FileSpreadsheet, RefreshCw } from "lucide-react";
import { DashboardSnapshot } from "./dashboard-data";

type RecentJobsWidgetProps = {
  snapshot: DashboardSnapshot;
};

export function RecentJobsWidget({ snapshot }: RecentJobsWidgetProps) {
  const jobs = useMemo(
    () =>
      [...snapshot.jobs]
        .filter((job) => job.status === "delivered" || job.status === "failed")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [snapshot.jobs]
  );

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-vercel-muted">Last 5 completed</span>
        <button
          type="button"
          onClick={snapshot.refresh}
          disabled={snapshot.loading}
          className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-[10px]"
        >
          <RefreshCw size={10} className={snapshot.loading ? "animate-spin" : ""} />
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
            className="flex items-center justify-between gap-2 border border-[#3c3c3c] bg-[#1e1e1e] p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 ${
                    job.status === "delivered" ? "bg-[#6a9955]" : "bg-[#ff6b6b]"
                  }`}
                />
                <span className="truncate text-xs font-medium text-vercel-text">
                  {job.refined_industry || job.original_industry}
                </span>
                <span className="text-[10px] font-mono text-[#858585]">{job.target_region}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-vercel-muted">
                {new Date(job.created_at).toLocaleDateString()} · {job.plan_name}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {(job.lead_exports || []).slice(0, 2).map((file) => {
                const isAudit = String(file.storage_path || "").toLowerCase().includes("audit");
                return (
                  <span
                    key={file.id}
                    className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-[10px]"
                    title={isAudit ? "Audit export" : "Leads export"}
                  >
                    {isAudit ? <FileSpreadsheet size={10} /> : <FileJson2 size={10} />}
                    {isAudit ? "AUDIT" : String(file.format || "file").toUpperCase()}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
