"use client";

import { useMemo, useState } from "react";
import { AgenticChat, DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable, JobTableSelection } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { WorkspaceArtifact, WorkspaceContext } from "../../components/workspace-types";

function kindFromExport(format: string) {
  const normalized = format.toLowerCase();
  if (normalized === "csv") return "csv" as const;
  if (normalized === "xlsx") return "xlsx" as const;
  if (normalized === "json") return "json" as const;
  return "text" as const;
}

function buildSearchExplorerContext(job: JobTableSelection): WorkspaceContext | null {
  if (!job) return null;

  const exports = job.lead_exports || [];
  const events = [...(job.job_events || [])].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const latestReportEvent = [...events].reverse().find((event) => event.status === "report_ready");
  const report = latestReportEvent?.metadata?.report;

  const exportsSummary =
    exports.length > 0
      ? exports
          .map((file) => {
            const fileName = file.storage_path?.split("/").at(-1) || `${file.format.toLowerCase()}_export`;
            const rows = file.row_count ?? "-";
            return `- ${fileName} (${file.format.toUpperCase()}, ${rows} rows)`;
          })
          .join("\n")
      : "- waiting for export files";

  const analysis = [
    "# AI Analysis",
    `- Job: ${job.id}`,
    `- Status: ${job.status}`,
    `- Target Region: ${job.target_region}`,
    `- Industry: ${job.refined_industry || job.original_industry}`,
    `- Min Score: ${job.min_score}`,
    "",
    "## Preflight",
    "```json",
    JSON.stringify(job.preflight || {}, null, 2),
    "```",
    "",
    "## Job Config",
    "```json",
    JSON.stringify(job.job_config || {}, null, 2),
    "```",
  ].join("\n");

  const logContent =
    events.length > 0
      ? events
          .map((event) => `[${new Date(event.created_at || Date.now()).toLocaleString()}] ${event.status || "event"} :: ${event.message || ""}`)
          .join("\n")
      : "No job events yet.";

  const artifactFiles: WorkspaceArtifact[] = exports.map((file) => {
    const fileName = file.storage_path?.split("/").at(-1) || `${file.format.toLowerCase()}_export`;
    const auditFile = file.storage_path?.toLowerCase().includes("audit");
    return {
      id: `job-${job.id}-export-${file.id}`,
      name: fileName,
      folder: auditFile ? "Logs" : "Results",
      kind: kindFromExport(file.format),
      meta: `${file.format.toUpperCase()} • ${file.row_count ?? "-"} rows`,
      content: `storage_path: ${file.storage_path || "N/A"}\npublic_url: ${file.public_url || "N/A"}\nformat: ${file.format}\nrow_count: ${file.row_count ?? "N/A"}`,
      externalUrl: file.public_url || undefined,
    };
  });

  const artifacts: WorkspaceArtifact[] = [
    {
      id: `job-${job.id}-results`,
      name: "leads_found.csv",
      folder: "Results",
      kind: "csv" as const,
      meta: `${exports.length} export file(s)`,
      content: exportsSummary,
    },
    {
      id: `job-${job.id}-analysis`,
      name: "ai_analysis.md",
      folder: "Insights",
      kind: "markdown" as const,
      content: analysis,
    },
    {
      id: `job-${job.id}-logs`,
      name: "audit_trail.log",
      folder: "Logs",
      kind: "log" as const,
      content: logContent,
    },
    ...artifactFiles,
  ];

  if (report) {
    artifacts.push({
      id: `job-${job.id}-report`,
      name: "report.json",
      folder: "Insights",
      kind: "json" as const,
      content: JSON.stringify(report, null, 2),
    });
  }

  return {
    id: job.id,
    label: `Search Job ${job.id.slice(0, 8)}`,
    description: `${job.target_region} • ${job.refined_industry || job.original_industry}`,
    artifacts,
  };
}

export default function SearchPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeTerminalJobId, setActiveTerminalJobId] = useState<string | undefined>(undefined);
  const [selectedJob, setSelectedJob] = useState<JobTableSelection>(null);

  const explorerContext = useMemo(() => buildSearchExplorerContext(selectedJob), [selectedJob]);
  const terminalSummary = activeTerminalJobId
    ? `Scoring: LIVE | Enriching: active lanes | Job: ${activeTerminalJobId.slice(0, 8)}`
    : "Scoring: idle | Enriching: idle";

  return (
    <VSCodeLayout
      mode="search"
      title="Agentic Lead Search"
      subtitle="Single SSE stream, dual live lanes"
      activeTerminalJobId={activeTerminalJobId}
      explorerContext={explorerContext}
      terminalSummary={terminalSummary}
      mainEditor={
        <AgenticChat
          onJobCreated={() => setRefreshSignal((value) => value + 1)}
          onActiveJobChange={(jobId) => setActiveTerminalJobId(jobId)}
        />
      }
      jobsPanel={
        <JobTable
          refreshSignal={refreshSignal}
          compact
          onSelectedJobChange={(job) => setSelectedJob(job)}
        />
      }
      terminalContent={
        activeTerminalJobId ? (
          <DualLiveTerminal jobId={activeTerminalJobId} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[#8b949e]">
            No active job. Start a search to see live worker lanes.
          </div>
        )
      }
    />
  );
}
