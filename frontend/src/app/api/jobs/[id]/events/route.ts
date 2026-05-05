import { NextRequest, NextResponse } from "next/server";
import { ensureJobReport } from "../../../../../lib/job-report";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
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
  const status = String(body.status ?? "running");
  const message = String(body.message ?? "Worker event received.");
  const supabase = createAdminSupabase();

  const { error: eventError } = await supabase.from("job_events").insert({
    job_id: id,
    status,
    message,
    metadata: body
  });
  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  const statusMap: Record<string, string> = {
    starting: "running",
    discovering: "running",
    discovered: "running",
    analyzing: "running",
    enriching: "running",
    enriched: "running",
    scoring: "running",
    exporting: "running",
    delivered: "delivered",
    failed: "failed"
  };

  const mappedStatus = statusMap[status] ?? "running";
  let updateQuery = supabase
    .from("lead_jobs")
    .update({
      status: mappedStatus,
      error_message: mappedStatus === "failed" ? message : null
    })
    .eq("id", id);
  if (mappedStatus === "failed") {
    updateQuery = updateQuery.neq("status", "delivered");
  }
  const { error: updateError } = await updateQuery;
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (status === "delivered") {
    await ensureJobReport(id);
  }

  return NextResponse.json({ ok: true });
}
