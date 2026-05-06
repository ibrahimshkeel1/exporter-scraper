"use client";

import { useMemo } from "react";
import { Cpu } from "lucide-react";
import { DashboardSnapshot, hasReport } from "./dashboard-data";

type SystemHealthWidgetProps = {
  snapshot: DashboardSnapshot;
};

function TerminalLine({ prompt = "$", text, color = "text-vercel-muted" }: { prompt?: string; text: string; color?: string }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] font-mono">
      <span className="text-[#00ff00]">{prompt}</span>
      <span className={color}>{text}</span>
    </div>
  );
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function SystemHealthWidget({ snapshot }: SystemHealthWidgetProps) {
  const stats = useMemo(() => {
    const jobs = snapshot.jobs;
    const oldest = jobs.length > 0 ? Math.min(...jobs.map((job) => new Date(job.created_at).getTime())) : Date.now();
    const uptime = formatDuration(Date.now() - oldest);
    const queueDepth = jobs.filter((job) => job.status === "queued" || job.status === "approved").length;
    const running = jobs.filter((job) => job.status === "running").length;
    const delivered = jobs.filter((job) => job.status === "delivered").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const reports = jobs.filter((job) => hasReport(job)).length;
    const reportCoverage = jobs.length > 0 ? Math.round((reports / jobs.length) * 100) : 0;
    return { uptime, queueDepth, running, delivered, failed, reports, reportCoverage };
  }, [snapshot.jobs]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center gap-2">
        <Cpu size={12} className="text-[#00ffff]" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#00ffff]">monitor_live</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 border border-[#30363d] bg-black p-2">
        <TerminalLine text={`uptime --workspace ${stats.uptime}`} color="text-[#00ff00]" />
        <TerminalLine text={`jobs_total --count ${snapshot.jobs.length}`} color="text-vercel-text" />
        <TerminalLine text={`queue_depth --count ${stats.queueDepth}`} color="text-vercel-text" />
        <TerminalLine text={`running --count ${stats.running}`} color="text-[#00ffff]" />
        <TerminalLine text={`delivered --count ${stats.delivered}`} color="text-[#00ff00]" />
        <TerminalLine text={`failed --count ${stats.failed}`} color={stats.failed > 0 ? "text-[#ff6b6b]" : "text-vercel-text"} />
        <TerminalLine text={`ai_reports --coverage ${stats.reportCoverage}%`} color="text-vercel-text" />
        <TerminalLine text={`campaigns --count ${snapshot.campaigns.length}`} color="text-vercel-text" />
        <TerminalLine text={`last_sync --time ${snapshot.refreshedAt ? new Date(snapshot.refreshedAt).toLocaleTimeString() : "n/a"}`} color="text-vercel-muted" />
      </div>
    </div>
  );
}
