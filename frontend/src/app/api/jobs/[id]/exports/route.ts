import { NextRequest, NextResponse } from "next/server";
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

function verifyWebhook(request: NextRequest) {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get("x-exportflow-secret") === expected;
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

  return NextResponse.json({ ok: true });
}
