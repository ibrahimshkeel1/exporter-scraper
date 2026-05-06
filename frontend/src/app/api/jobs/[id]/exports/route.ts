import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { ensureJobReport } from "../../../../../lib/job-report";
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
  id?: string;
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

function pickByFormat(rows: LeadExportRow[], format: string) {
  const normalized = format.toLowerCase();
  if (normalized === "audit") {
    return pickAuditFile(rows);
  }
  if (normalized === "leads") {
    return pickLeadFile(rows);
  }
  const matches = rows.filter((row) => (row.format || "").toLowerCase() === normalized);
  if (matches.length === 0) return null;
  if (normalized === "csv") {
    return matches.find((row) => !/(^|\/|_)audit(\.|_|$)/i.test(row.storage_path || "")) || matches[0];
  }
  return matches[0];
}

function pickById(rows: LeadExportRow[], exportId: string | null) {
  if (!exportId) return null;
  return rows.find((row) => row.id === exportId) || null;
}

function canPreviewAsText(row: LeadExportRow) {
  const path = (row.storage_path || "").toLowerCase();
  const format = (row.format || "").toLowerCase();
  if (format === "csv" || format === "json" || format === "txt" || format === "log" || format === "md") return true;
  if (path.endsWith(".csv") || path.endsWith(".json") || path.endsWith(".txt") || path.endsWith(".log") || path.endsWith(".md")) return true;
  return false;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminSupabase();
  const format = request.nextUrl.searchParams.get("format") || "csv";
  const exportId = request.nextUrl.searchParams.get("exportId");
  const mode = request.nextUrl.searchParams.get("mode") || "redirect";

  const { data: job, error: jobError } = await supabase
    .from("lead_jobs")
    .select("id,user_id,lead_exports(*)")
    .eq("id", id)
    .single();

  if (jobError || !job || job.user_id !== user.id) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const rows = (job.lead_exports || []) as LeadExportRow[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No exports available yet." }, { status: 404 });
  }

  const selected = exportId ? pickById(rows, exportId) : pickByFormat(rows, format);
  if (!selected) {
    const message = exportId ? `No export found for id '${exportId}'.` : `No export found for format '${format}'.`;
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (mode === "preview") {
    if (!selected.storage_path) {
      return NextResponse.json({ error: "Preview is unavailable because storage path is missing." }, { status: 404 });
    }
    if (!canPreviewAsText(selected)) {
      return NextResponse.json({
        preview: `Preview unavailable for ${(selected.format || "file").toUpperCase()}.\nPath: ${selected.storage_path}`,
        format: selected.format,
        truncated: false,
      });
    }
    const { data: blob, error: downloadError } = await supabase.storage.from("lead-exports").download(selected.storage_path);
    if (downloadError || !blob) {
      return NextResponse.json({ error: downloadError?.message || "Could not download export for preview." }, { status: 500 });
    }
    const text = await blob.text();
    const lines = text.split(/\r?\n/);
    const MAX_LINES = 220;
    const sliced = lines.slice(0, MAX_LINES).join("\n");
    return NextResponse.json({
      preview: sliced,
      format: selected.format,
      truncated: lines.length > MAX_LINES,
      lineCount: lines.length,
    });
  }

  if (selected.public_url) {
    if (mode === "url") {
      return NextResponse.json({ url: selected.public_url });
    }
    return NextResponse.redirect(selected.public_url, { status: 302 });
  }

  if (!selected.storage_path) {
    return NextResponse.json({ error: "Export file path is missing." }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("lead-exports")
    .createSignedUrl(selected.storage_path, 60 * 60);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message || "Could not generate download URL." }, { status: 500 });
  }

  if (mode === "url") {
    return NextResponse.json({ url: signed.signedUrl });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
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

  const reportResult = await ensureJobReport(id, rows as LeadExportRow[]);
  const reportWarning = reportResult.warning;

  return NextResponse.json({ ok: true, reportWarning });
}
