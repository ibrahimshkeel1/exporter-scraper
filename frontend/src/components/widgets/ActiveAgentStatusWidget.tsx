"use client";

import { Activity, AlertTriangle, Clock, Search } from "lucide-react";
import { DashboardSnapshot } from "./dashboard-data";

type ActiveAgentStatusWidgetProps = {
  snapshot: DashboardSnapshot;
};

function eventProgress(status?: string) {
  const key = String(status || "").toLowerCase();
  if (["starting", "approved"].includes(key)) return 10;
  if (["queued"].includes(key)) return 20;
  if (["discovering", "discovered"].includes(key)) return 45;
  if (["enriching", "enriched"].includes(key)) return 70;
  if (["scoring", "exporting"].includes(key)) return 88;
  if (["delivered"].includes(key)) return 100;
  if (["failed"].includes(key)) return 100;
  return 35;
}

export function ActiveAgentStatusWidget({ snapshot }: ActiveAgentStatusWidgetProps) {
  const runningJobs = snapshot.jobs.filter((job) => job.status === "running" || job.status === "queued");
  const failedCount = snapshot.jobs.filter((job) => job.status === "failed").length;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6a9955] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6a9955]" />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#6a9955]">LIVE</span>
        </div>
        <span className="text-[11px] text-vercel-muted">{runningJobs.length} running</span>
        {failedCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-[#ff6b6b]">
            <AlertTriangle size={10} />
            {failedCount} failed
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {runningJobs.length === 0 && (
          <div className="flex h-full items-center justify-center border border-[#3c3c3c] bg-[#1e1e1e] text-xs text-vercel-muted">
            No active jobs.
          </div>
        )}
        {runningJobs.map((job) => {
          const latestEvent = [...(job.job_events || [])]
            .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
            .at(-1);
          const progress = eventProgress(latestEvent?.status || job.status);
          const laneTag = `${job.target_region}-${(job.refined_industry || job.original_industry || "search").slice(0, 18)}`;
          return (
            <div
              key={job.id}
              className="border border-[#3c3c3c] bg-[#1e1e1e] p-2.5 transition-colors hover:border-[#3c3c3c]/80"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {job.status === "running" && <Activity size={12} className="text-[#569cd6]" />}
                  {job.status === "queued" && <Clock size={12} className="text-[#858585]" />}
                  <span className="text-xs font-medium text-vercel-text">{job.id.slice(0, 8)}</span>
                </div>
                <span className="text-[10px] font-mono uppercase text-[#6a9955]">{job.status}</span>
              </div>

              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-vercel-muted">
                  <span>{progress}%</span>
                  <span className="font-mono">{latestEvent?.status || "running"}</span>
                </div>
                <div className="h-1.5 w-full bg-[#333333]">
                  <div className="h-full bg-[#569cd6] transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 border border-[#3c3c3c] bg-[#252526] px-1.5 py-0.5 text-[9px] text-vercel-muted">
                  <Search size={8} />
                  {laneTag}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
