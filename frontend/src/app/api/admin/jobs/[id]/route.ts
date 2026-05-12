import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "../../../../../lib/api-auth";
import { ensureJobReport } from "../../../../../lib/job-report";
import { triggerLeadJob } from "../../../../../lib/n8n";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";
import { LeadJob } from "../../../../../lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function addEvent(jobId: string, status: string, message: string, metadata = {}) {
  const supabase = createAdminSupabase();
  await supabase.from("job_events").insert({ job_id: jobId, status, message, metadata });
}

type LeadExportRow = {
  id: string;
  format: string;
  storage_path: string | null;
  public_url: string | null;
  row_count: number | null;
};

type JobEventRow = {
  status?: string;
  message?: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

function isAuditExport(row: LeadExportRow) {
  const path = row.storage_path || "";
  const format = row.format || "";
  return /audit/i.test(path) || /audit/i.test(format);
}

function pickLeadExport(rows: LeadExportRow[]) {
  return rows.find((row) => !isAuditExport(row) && /_leads\.csv$/i.test(row.storage_path || ""))
    || rows.find((row) => !isAuditExport(row) && (row.format || "").toLowerCase() === "csv")
    || rows.find((row) => !isAuditExport(row));
}

function pickAuditExport(rows: LeadExportRow[]) {
  return rows.find((row) => /_audit\.csv$/i.test(row.storage_path || ""))
    || rows.find(isAuditExport);
}

function latestReport(events: JobEventRow[]) {
  const reportEvent = [...events].reverse().find((event) => event.status === "report_ready" && event.metadata?.report);
  return reportEvent?.metadata?.report ?? null;
}

function compactCsvPreview(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 80)
    .join("\n");
}

async function readExportPreview(supabase: ReturnType<typeof createAdminSupabase>, row: LeadExportRow | undefined) {
  if (!row?.storage_path) return "";
  const path = row.storage_path.toLowerCase();
  const format = (row.format || "").toLowerCase();
  if (!path.endsWith(".csv") && !path.endsWith(".json") && format !== "csv" && format !== "json") return "";

  const { data, error } = await supabase.storage.from("lead-exports").download(row.storage_path);
  if (error || !data) return "";
  return compactCsvPreview(await data.text());
}

async function signedExport(supabase: ReturnType<typeof createAdminSupabase>, row: LeadExportRow) {
  if (row.public_url) return { ...row, signed_url: row.public_url };
  if (!row.storage_path) return { ...row, signed_url: null };
  const { data } = await supabase.storage.from("lead-exports").createSignedUrl(row.storage_path, 60 * 60);
  return { ...row, signed_url: data?.signedUrl ?? null };
}

function listText(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, limit) : [];
}

function buildReportSummary(report: unknown) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return "";
  const payload = report as Record<string, unknown>;
  return [
    typeof payload.headline === "string" ? `AI headline: ${payload.headline}` : "",
    typeof payload.executiveSummary === "string" ? `Executive summary: ${payload.executiveSummary}` : "",
    typeof payload.qualityAssessment === "string" ? `Quality assessment: ${payload.qualityAssessment}` : "",
    listText(payload.strongestPatterns).length ? `Strongest patterns:\n- ${listText(payload.strongestPatterns).join("\n- ")}` : "",
    listText(payload.concerns).length ? `Concerns:\n- ${listText(payload.concerns).join("\n- ")}` : "",
    listText(payload.nextActions).length ? `Next actions:\n- ${listText(payload.nextActions).join("\n- ")}` : "",
    listText(payload.recommendedFollowUpSearches).length ? `Recommended follow-up searches:\n- ${listText(payload.recommendedFollowUpSearches).join("\n- ")}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildLogSummary(events: JobEventRow[]) {
  return events
    .slice(-30)
    .map((event) => {
      const metadata = event.metadata || {};
      const message = typeof metadata.message === "string" ? metadata.message : event.message || "";
      if (!message) return "";
      const when = event.created_at ? new Date(event.created_at).toISOString() : "";
      return `[${when}] ${event.status || "event"}: ${message}`;
    })
    .filter(Boolean)
    .join("\n");
}

export async function GET(request: NextRequest, context: RouteContext) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminSupabase();
  const ensureReport = request.nextUrl.searchParams.get("ensureReport") === "1";

  if (ensureReport) {
    await ensureJobReport(id);
  }

  const { data: job, error } = await supabase
    .from("lead_jobs")
    .select("*, lead_exports(*), payment_proofs(*), job_events(*)")
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const exports = ((job.lead_exports || []) as LeadExportRow[]);
  const events = ((job.job_events || []) as JobEventRow[]).sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const leadExport = pickLeadExport(exports);
  const auditExport = pickAuditExport(exports);
  const [signedExports, leadPreview, auditPreview] = await Promise.all([
    Promise.all(exports.map((row) => signedExport(supabase, row))),
    readExportPreview(supabase, leadExport),
    readExportPreview(supabase, auditExport),
  ]);
  const report = latestReport(events);
  const logSummary = buildLogSummary(events);

  return NextResponse.json({
    job: { ...job, lead_exports: signedExports, job_events: events },
    evidence: {
      report,
      leadExportId: leadExport?.id ?? null,
      auditExportId: auditExport?.id ?? null,
      leadPreview,
      auditPreview,
      logSummary,
      jobSummary: [
        buildReportSummary(report),
        leadPreview ? `Lead CSV preview:\n${leadPreview}` : "",
        logSummary ? `Recent stored log events:\n${logSummary}` : "",
      ].filter(Boolean).join("\n\n"),
      auditSummary: auditPreview ? `Audit CSV preview:\n${auditPreview}` : "",
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const action = String(body.action ?? "");
  const supabase = createAdminSupabase();

  const { data: job, error: jobError } = await supabase.from("lead_jobs").select("*").eq("id", id).single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (action === "reject") {
    const { data, error } = await supabase
      .from("lead_jobs")
      .update({
        status: "rejected",
        payment_status: "rejected",
        admin_note: body.adminNote || "Rejected by admin."
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await addEvent(id, "rejected", "Payment proof rejected.", { adminNote: body.adminNote || "" });
    return NextResponse.json({ job: data });
  }

  if (action === "mark_delivered") {
    const { data, error } = await supabase
      .from("lead_jobs")
      .update({ status: "delivered", admin_note: body.adminNote || null })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await addEvent(id, "delivered", "Job marked delivered by admin.", { adminNote: body.adminNote || "" });
    return NextResponse.json({ job: data });
  }

  if (action !== "approve" && action !== "retry") {
    return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });
  }

  const trigger = await triggerLeadJob(job as LeadJob);
  if (!trigger.ok) {
    await addEvent(id, "approved", "Admin approved job, but n8n trigger failed.", { error: trigger.error });
    const { data } = await supabase
      .from("lead_jobs")
      .update({
        status: "approved",
        payment_status: "approved",
        admin_note: trigger.error
      })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json({ job: data, warning: trigger.error }, { status: 202 });
  }

  const { data, error } = await supabase
    .from("lead_jobs")
    .update({
      status: "queued",
      payment_status: "approved",
      admin_note: body.adminNote || null,
      error_message: null
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await addEvent(id, "queued", action === "retry" ? "Job retried by admin." : "Payment approved; job queued.");
  return NextResponse.json({ job: data });
}
