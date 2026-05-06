"use client";

import { ReactNode, createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { JobTableSelection } from "./JobTable";
import type { JobEvent } from "./JobLogViewer";
import type { WorkspaceArtifact, WorkspaceContext } from "./workspace-types";
import type { LeadJob } from "../lib/types";

const ACTIVE_JOB_STORAGE_KEY = "exportflow:active_job_id";

export type LeadWorkspaceJob = LeadJob & { job_events?: JobEvent[] };

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

function contextLabel(job: LeadWorkspaceJob) {
  return `${job.target_region} • ${job.refined_industry || job.original_industry}`;
}

function sortedEvents(job: LeadWorkspaceJob) {
  return [...(job.job_events || [])].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
}

function latestReportFromJob(job: LeadWorkspaceJob) {
  const events = sortedEvents(job);
  const latestReportEvent = [...events].reverse().find((event) => event.status === "report_ready");
  return latestReportEvent?.metadata?.report;
}

function buildSessionSummaryArtifact(job: LeadWorkspaceJob): WorkspaceArtifact {
  const exports = job.lead_exports || [];
  const report = latestReportFromJob(job) as Record<string, unknown> | undefined;

  return {
    id: `session-${job.id}-summary`,
    name: `${job.id.slice(0, 8)}.md`,
    folder: "Sessions",
    kind: "markdown",
    meta: `${job.status.toUpperCase()} • ${contextLabel(job)}`,
    content: [
      `# Search Session ${job.id.slice(0, 8)}`,
      "",
      `- Job ID: ${job.id}`,
      `- Status: ${job.status}`,
      `- Created: ${new Date(job.created_at).toLocaleString()}`,
      `- Target: ${contextLabel(job)}`,
      `- Lead Limit: ${job.lead_limit}`,
      `- Minimum Score: ${job.min_score}`,
      `- Files: ${exports.length}`,
      "",
      report && typeof report.headline === "string" ? `## AI Headline\n${report.headline}` : "## AI Headline\nNo report generated yet.",
      report && typeof report.executiveSummary === "string" ? `\n## Executive Summary\n${report.executiveSummary}` : "",
    ]
      .join("\n")
      .trim(),
  };
}

function buildActiveJobArtifacts(active: LeadWorkspaceJob): WorkspaceArtifact[] {
  const exports = active.lead_exports || [];
  const events = sortedEvents(active);
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

  return artifacts;
}

export function buildLeadSessionExplorerContext(
  selectedJob: LeadWorkspaceJob | null,
  jobs: LeadWorkspaceJob[]
): WorkspaceContext | null {
  if (!selectedJob && jobs.length === 0) return null;

  const active = selectedJob || jobs[0] || null;
  if (!active) return null;

  const sessionArtifacts = jobs.map((job) => buildSessionSummaryArtifact(job));
  const activeArtifacts = buildActiveJobArtifacts(active);

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
    artifacts: [...sessionArtifacts, ...activeArtifacts],
  };
}

export function mergeWorkspaceContexts(
  leadContext: WorkspaceContext | null,
  secondaryContext: WorkspaceContext | null,
  secondaryFolderPrefix: string
) {
  if (!leadContext) return secondaryContext;
  if (!secondaryContext) return leadContext;

  return {
    ...leadContext,
    artifacts: [
      ...leadContext.artifacts,
      ...secondaryContext.artifacts.map((artifact) => ({
        ...artifact,
        id: `${secondaryContext.id}-${artifact.id}`,
        folder: `${secondaryFolderPrefix}/${artifact.folder}`,
      })),
    ],
  };
}

function readStoredActiveJobId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
}

function writeStoredActiveJobId(jobId: string | null) {
  if (typeof window === "undefined") return;
  if (jobId) {
    window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
  } else {
    window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  }
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return null;
}

function numberFromMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = pickNumber(metadata[key]);
    if (value !== null) return value;
  }
  return null;
}

function compactMessage(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 42 ? `${clean.slice(0, 39)}...` : clean;
}

function isAuditExport(file: NonNullable<LeadJob["lead_exports"]>[number]) {
  const path = (file.storage_path || "").toLowerCase();
  const format = (file.format || "").toLowerCase();
  return path.includes("audit") || format.includes("audit");
}

function summarizeJob(job: LeadWorkspaceJob | null) {
  if (!job) return "No lead session selected";

  const events = sortedEvents(job);
  const exports = job.lead_exports || [];
  const lastEvent = [...events].reverse().find((event) => event.message || event.metadata?.message);
  const discovered =
    [...events]
      .reverse()
      .map((event) =>
        numberFromMetadata(event.metadata || {}, [
          "discovered",
          "discovered_count",
          "candidate_count",
          "candidates",
          "total_candidates",
          "found",
          "found_count",
          "count",
        ])
      )
      .find((value) => value !== null) ??
    events.filter((event) => String(event.status || "").toLowerCase().includes("discover")).length;
  const enriched =
    [...events]
      .reverse()
      .map((event) => numberFromMetadata(event.metadata || {}, ["enriched", "enriched_count", "processed", "processed_count", "scored", "scored_count"]))
      .find((value) => value !== null) ??
    events.filter((event) => /enrich|scor/i.test(`${event.status || ""} ${event.message || ""}`)).length;
  const exported = exports
    .filter((file) => !isAuditExport(file))
    .reduce((total, file) => total + (file.row_count ?? 0), 0);
  const lastMessage = compactMessage(
    (typeof lastEvent?.metadata?.message === "string" ? lastEvent.metadata.message : lastEvent?.message) || job.status
  );

  return [
    `job:${job.id.slice(0, 8)}`,
    job.status,
    `found:${discovered}`,
    `enriched:${enriched}`,
    exported > 0 ? `exported:${exported}` : null,
    lastMessage ? `now:${lastMessage}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function useLeadSessionWorkspaceState() {
  const [jobs, setJobs] = useState<LeadWorkspaceJob[]>([]);
  const [selectedJobId, setSelectedJobIdState] = useState<string | null>(() => readStoredActiveJobId());
  const [pendingSelectedJobId, setPendingSelectedJobId] = useState<string | null>(null);
  const [sessionOpenToken, setSessionOpenToken] = useState(0);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  );

  const selectJob = useCallback((jobId: string | null, openSession = true) => {
    setSelectedJobIdState(jobId);
    setPendingSelectedJobId(jobId);
    writeStoredActiveJobId(jobId);
    if (openSession && jobId) {
      setSessionOpenToken((value) => value + 1);
    }
  }, []);

  const handleJobsChange = useCallback(
    (nextJobs: LeadJob[]) => {
      const typedJobs = nextJobs as LeadWorkspaceJob[];
      setJobs(typedJobs);
      if (typedJobs.length === 0) {
        selectJob(null, false);
        return;
      }
      const stored = readStoredActiveJobId();
      const preferred = selectedJobId || stored;
      if (pendingSelectedJobId && typedJobs.some((job) => job.id === pendingSelectedJobId)) {
        setPendingSelectedJobId(null);
        return;
      }
      if (!preferred) {
        selectJob(typedJobs[0].id, false);
        return;
      }
      if (!typedJobs.some((job) => job.id === preferred) && preferred !== pendingSelectedJobId) {
        selectJob(typedJobs[0].id, false);
      }
    },
    [pendingSelectedJobId, selectJob, selectedJobId]
  );

  const handleSelectedJobChange = useCallback(
    (job: JobTableSelection) => {
      if (job?.id && job.id !== selectedJobId) {
        selectJob(job.id, false);
      }
    },
    [selectJob, selectedJobId]
  );

  useEffect(() => {
    if (selectedJobId && !selectedJob && jobs.length > 0) {
      const nextJobId = jobs[0]?.id ?? null;
      selectJob(nextJobId, false);
    }
  }, [jobs, selectJob, selectedJob, selectedJobId]);

  const explorerContext = useMemo(() => buildLeadSessionExplorerContext(selectedJob, jobs), [selectedJob, jobs]);
  const terminalJobId = selectedJobId || selectedJob?.id || null;
  const terminalEvents = selectedJob?.id === terminalJobId ? selectedJob.job_events || [] : [];
  const terminalSummary = summarizeJob(selectedJob);

  return {
    jobs,
    selectedJob,
    selectedJobId,
    selectJob,
    explorerContext,
    sessionOpenToken,
    terminalJobId,
    terminalEvents,
    terminalSummary,
    jobTableProps: {
      initialJobs: jobs,
      selectedJobId,
      onSelectedJobIdChange: (jobId: string | null) => selectJob(jobId, false),
      onSelectedJobChange: handleSelectedJobChange,
      onJobsChange: handleJobsChange,
    },
  };
}

export type LeadSessionWorkspaceValue = ReturnType<typeof useLeadSessionWorkspaceState>;

const LeadSessionWorkspaceContext = createContext<LeadSessionWorkspaceValue | null>(null);

export function LeadSessionWorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useLeadSessionWorkspaceState();
  return createElement(LeadSessionWorkspaceContext.Provider, { value }, children);
}

export function useLeadSessionWorkspace() {
  const value = useContext(LeadSessionWorkspaceContext);
  if (!value) {
    throw new Error("useLeadSessionWorkspace must be used inside LeadSessionWorkspaceProvider.");
  }
  return value;
}
