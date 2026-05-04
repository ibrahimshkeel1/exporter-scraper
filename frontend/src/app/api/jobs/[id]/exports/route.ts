import { NextRequest, NextResponse } from "next/server";
import { runLeadJobReview } from "../../../../../lib/gemini";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ExportPayload = {
  format?: string;
  storage_path?: string | null;
  public_url?: string | null;
  row_count?: number | string | null;
};

type LeadExportRow = {
  format: string;
  storage_path: string | null;
  public_url: string | null;
  row_count: number | null;
};

function verifyWebhook(request: NextRequest) {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get("x-exportflow-secret") === expected;
}

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

export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const exports: ExportPayload[] = Array.isArray(body.exports) ? body.exports : [body];
  const supabase = createAdminSupabase();

  const rows = exports
    .filter((item) => item && (item.storage_path || item.public_url))
    .map((item) => ({
      job_id: id,
      format: String(item.format ?? "file"),
      storage_path: item.storage_path ?? null,
      public_url: item.public_url ?? null,
      row_count: item.row_count == null ? null : Math.round(Number(item.row_count))
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "At least one export file is required." }, { status: 400 });
  }

  const { error: deleteError } = await supabase.from("lead_exports").delete().eq("job_id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error } = await supabase.from("lead_exports").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("lead_jobs")
    .update({ status: "delivered", error_message: null })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("job_events").insert({
    job_id: id,
    status: "delivered",
    message: "Lead export files registered.",
    metadata: { exports: rows }
  });
  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  const { data: job } = await supabase
    .from("lead_jobs")
    .select("id, plan_name, target_region, refined_industry, lead_limit, min_score, preflight, job_config")
    .eq("id", id)
    .single();

  const leadFile = pickLeadFile(rows as LeadExportRow[]);
  const auditFile = pickAuditFile(rows as LeadExportRow[]);

  let reportWarning: string | null = null;
  if (job) {
    try {
      const [finalCsv, auditCsv] = await Promise.all([
        fetchExportText(supabase, leadFile),
        fetchExportText(supabase, auditFile)
      ]);

      if (finalCsv || auditCsv) {
        const report = await runLeadJobReview({
          jobId: id,
          planName: String(job.plan_name ?? "Lead pack"),
          targetRegion: String(job.target_region ?? "International"),
          refinedIndustry: String(job.refined_industry ?? ""),
          leadLimit: Number(job.lead_limit ?? 0),
          minScore: Number(job.min_score ?? 0),
          finalCsv,
          auditCsv,
          finalRowCount: countCsvRows(finalCsv),
          auditRowCount: countCsvRows(auditCsv),
          preflight: (job.preflight ?? {}) as Record<string, unknown>
        });

        await supabase.from("job_events").insert({
          job_id: id,
          status: "report_ready",
          message: report.executiveSummary,
          metadata: {
            report,
            lead_file: leadFile?.storage_path ?? leadFile?.public_url ?? null,
            audit_file: auditFile?.storage_path ?? auditFile?.public_url ?? null
          }
        });
      } else {
        reportWarning = "Export report skipped because the final CSV or audit CSV could not be read.";
        await supabase.from("job_events").insert({
          job_id: id,
          status: "report_ready",
          message: reportWarning,
          metadata: { warning: reportWarning }
        });
      }
    } catch (reportError) {
      reportWarning = reportError instanceof Error ? reportError.message : "Unknown report generation error.";
      await supabase.from("job_events").insert({
        job_id: id,
        status: "report_error",
        message: reportWarning,
        metadata: { error: reportWarning }
      });
    }
  }

  return NextResponse.json({ ok: true, reportWarning });
}
