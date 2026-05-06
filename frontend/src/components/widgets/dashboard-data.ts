import { OutreachCampaign } from "../../lib/outreach";
import { LeadJob } from "../../lib/types";

export type DashboardJob = LeadJob & {
  job_events?: Array<{ status?: string; created_at?: string; metadata?: Record<string, unknown>; message?: string }>;
};

export type DashboardSnapshot = {
  jobs: DashboardJob[];
  campaigns: OutreachCampaign[];
  loading: boolean;
  error: string | null;
  refreshedAt: string | null;
  refresh: () => void;
};

export function isAuditExport(file: NonNullable<LeadJob["lead_exports"]>[number]) {
  const path = String(file.storage_path || "").toLowerCase();
  const format = String(file.format || "").toLowerCase();
  return path.includes("audit") || format.includes("audit");
}

export function leadRowsForJob(job: LeadJob) {
  return (job.lead_exports || [])
    .filter((file) => !isAuditExport(file))
    .reduce((sum, file) => sum + Number(file.row_count || 0), 0);
}

export function auditRowsForJob(job: LeadJob) {
  return (job.lead_exports || [])
    .filter((file) => isAuditExport(file))
    .reduce((sum, file) => sum + Number(file.row_count || 0), 0);
}

export function hasReport(job: DashboardJob) {
  return (job.job_events || []).some((event) => event.status === "report_ready" && Boolean(event.metadata?.report));
}
