"use client";

import { useMemo, useState } from "react";
import { AgenticChat, DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable, JobTableSelection } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { WorkspaceArtifact, WorkspaceContext } from "../../components/workspace-types";
import { LeadJob } from "../../lib/types";

type SearchJob = NonNullable<JobTableSelection>;

function kindFromExport(format: string) {
  const normalized = format.toLowerCase();
  if (normalized === "csv") return "csv" as const;
  if (normalized === "xlsx") return "xlsx" as const;
  if (normalized === "json") return "json" as const;
  return "text" as const;
}

function isAuditFile(file: NonNullable<LeadJob["lead_exports"]>[number]) {
  const path = (file.storage_path || "").toLowerCase();
  const format = (file.format || "").toLowerCase();
  return path.includes("audit") || format.includes("audit");
}

function contextLabel(job: SearchJob) {
  return `${job.target_region} • ${job.refined_industry || job.original_industry}`;
}

function buildSearchExplorerContext(selectedJob: SearchJob | null, jobs: SearchJob[]): WorkspaceContext | null {
  if (!selectedJob && jobs.length === 0) return null;

  const active = selectedJob || jobs[0] || null;
  if (!active) return null;

  const exports = active.lead_exports || [];
  const events = [...(active.job_events || [])].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const latestReportEvent = [...events].reverse().find((event) => event.status === "report_ready");
  const report = latestReportEvent?.metadata?.report;

  const analysis = [
    "# AI Analysis",
    `- Job: ${active.id}`,
    `- Status: ${active.status}`,
    `- Target Region: ${active.target_region}`,
    `- Industry: ${active.refined_industry || active.original_industry}`,
    `- Min Score: ${active.min_score}`,
    "",
    "## Notes",
    `- Exports available: ${exports.length}`,
    `- Event count: ${events.length}`,
  ].join("\n");

  const preflightJson = JSON.stringify(active.preflight || {}, null, 2);
  const jobConfigJson = JSON.stringify(active.job_config || {}, null, 2);
  const logContent =
    events.length > 0
      ? events
          .map((event) => `[${new Date(event.created_at || Date.now()).toLocaleString()}] ${event.status || "event"} :: ${event.message || ""}`)
          .join("\n")
      : "No job events yet.";

  const fileArtifacts: WorkspaceArtifact[] = exports.map((file) => {
    const fileName = file.storage_path?.split("/").at(-1) || `${file.format.toLowerCase()}_export`;
    const audit = isAuditFile(file);
    return {
      id: `job-${active.id}-export-${file.id}`,
      name: fileName,
      folder: audit ? "Leads/Audit" : "Leads/Qualified",
      kind: kindFromExport(file.format),
      meta: `${file.format.toUpperCase()} • ${file.row_count ?? "-"} rows`,
      content: `Loading preview for ${fileName}...`,
      externalUrl: file.public_url || undefined,
      download: {
        kind: "export",
        jobId: active.id,
        exportId: file.id,
        filename: fileName,
      },
      preview: {
        kind: "export",
        jobId: active.id,
        exportId: file.id,
        format: file.format,
      },
    };
  });

  const artifacts: WorkspaceArtifact[] = [
    {
      id: `job-${active.id}-analysis-overview`,
      name: "ai_analysis.md",
      folder: "Analysis/Overview",
      kind: "markdown",
      content: analysis,
    },
    {
      id: `job-${active.id}-analysis-preflight`,
      name: "preflight.json",
      folder: "Analysis/Config",
      kind: "json",
      content: preflightJson,
    },
    {
      id: `job-${active.id}-analysis-job-config`,
      name: "job_config.json",
      folder: "Analysis/Config",
      kind: "json",
      content: jobConfigJson,
    },
    {
      id: `job-${active.id}-audit-log`,
      name: "audit_events.log",
      folder: "Audit/Events",
      kind: "log",
      content: logContent,
    },
    ...fileArtifacts,
  ];

  if (report) {
    artifacts.push({
      id: `job-${active.id}-analysis-report`,
      name: "report.json",
      folder: "Analysis/Reports",
      kind: "json",
      content: JSON.stringify(report, null, 2),
      download: {
        kind: "report",
        jobId: active.id,
        filename: `${active.id}_ai_report.json`,
      },
    });
  }

  return {
    id: active.id,
    label: `Search Session ${active.id.slice(0, 8)}`,
    description: contextLabel(active),
    activeSessionId: active.id,
    sessions: jobs.map((job) => ({
      id: job.id,
      label: `${job.id.slice(0, 8)} • ${job.status}`,
      description: contextLabel(job),
      status: job.status,
    })),
    artifacts,
  };
}

export default function SearchPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeTerminalJobId, setActiveTerminalJobId] = useState<string | undefined>(undefined);
  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  );

  const explorerContext = useMemo(() => buildSearchExplorerContext(selectedJob, jobs), [selectedJob, jobs]);
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
      onSelectExplorerSession={(sessionId) => setSelectedJobId(sessionId)}
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
          showFilesPane={false}
          selectedJobId={selectedJobId}
          onSelectedJobIdChange={(jobId) => setSelectedJobId(jobId)}
          onSelectedJobChange={(job) => {
            if (job?.id) setSelectedJobId(job.id);
          }}
          onJobsChange={(nextJobs) => setJobs(nextJobs as SearchJob[])}
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
