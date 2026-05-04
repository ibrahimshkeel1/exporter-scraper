import { runLeadJobReview } from "./gemini";
import { createAdminSupabase } from "./supabase-admin";

type LeadExportRow = {
  format: string;
  storage_path: string | null;
  public_url: string | null;
  row_count: number | null;
};

function countCsvRows(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(0, trimmed.split(/\r?\n/).length - 1);
}

function pickLeadFile(rows: LeadExportRow[]) {
  return rows.find((row) => {
    const path = row.storage_path || "";
    const format = (row.format || "").toLowerCase();
    return !/audit/i.test(path) && !/audit/i.test(format) && (/_leads\.csv$/i.test(path) || format === "csv");
  }) || rows.find((row) => !/audit/i.test(row.format || "") && !/audit/i.test(row.storage_path || ""));
}

function pickAuditFile(rows: LeadExportRow[]) {
  return rows.find((row) => {
    const path = row.storage_path || "";
    return /_audit\.csv$/i.test(path) || /audit/i.test(row.format || "");
  });
}

async function fetchExportText(supabase: ReturnType<typeof createAdminSupabase>, row: LeadExportRow | undefined) {
  if (!row) return "";
  if (row.public_url) {
    const response = await fetch(row.public_url);
    if (!response.ok) return "";
    return response.text();
  }
  if (!row.storage_path) return "";

  const { data, error } = await supabase.storage.from("lead-exports").createSignedUrl(row.storage_path, 15 * 60);
  if (error || !data?.signedUrl) return "";

  const response = await fetch(data.signedUrl);
  if (!response.ok) return "";
  return response.text();
}

export async function ensureJobReport(jobId: string, rows?: LeadExportRow[]) {
  const supabase = createAdminSupabase();
  const { data: existingReport } = await supabase
    .from("job_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "report_ready")
    .limit(1);
  if (existingReport && existingReport.length > 0) {
    return { ok: true, warning: null };
  }

  const exportRows = rows ?? (
    await supabase
      .from("lead_exports")
      .select("format,storage_path,public_url,row_count")
      .eq("job_id", jobId)
  ).data as LeadExportRow[] | null;

  if (!exportRows || exportRows.length === 0) {
    return { ok: false, warning: "No export rows were found for report generation." };
  }

  const leadFile = pickLeadFile(exportRows);
  const auditFile = pickAuditFile(exportRows);

  const { data: job } = await supabase
    .from("lead_jobs")
    .select("id, plan_name, target_region, refined_industry, lead_limit, min_score, preflight")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, warning: "Lead job record not found for report generation." };
  }

  try {
    const [finalCsv, auditCsv] = await Promise.all([
      fetchExportText(supabase, leadFile),
      fetchExportText(supabase, auditFile),
    ]);

    if (!finalCsv && !auditCsv) {
      const warning = "Export report skipped because the final CSV or audit CSV could not be read.";
      await supabase.from("job_events").insert({
        job_id: jobId,
        status: "report_ready",
        message: warning,
        metadata: { warning },
      });
      return { ok: false, warning };
    }

    const report = await runLeadJobReview({
      jobId,
      planName: String(job.plan_name ?? "Lead pack"),
      targetRegion: String(job.target_region ?? "International"),
      refinedIndustry: String(job.refined_industry ?? ""),
      leadLimit: Number(job.lead_limit ?? 0),
      minScore: Number(job.min_score ?? 0),
      finalCsv,
      auditCsv,
      finalRowCount: countCsvRows(finalCsv),
      auditRowCount: countCsvRows(auditCsv),
      preflight: (job.preflight ?? {}) as Record<string, unknown>,
    });

    await supabase.from("job_events").insert({
      job_id: jobId,
      status: "report_ready",
      message: report.executiveSummary,
      metadata: {
        report,
        lead_file: leadFile?.storage_path ?? leadFile?.public_url ?? null,
        audit_file: auditFile?.storage_path ?? auditFile?.public_url ?? null,
      },
    });
    return { ok: true, warning: null };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Unknown report generation error.";
    await supabase.from("job_events").insert({
      job_id: jobId,
      status: "report_error",
      message: warning,
      metadata: { error: warning },
    });
    return { ok: false, warning };
  }
}
