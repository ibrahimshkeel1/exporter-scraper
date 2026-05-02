import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/api-auth";
import { triggerLeadJob } from "@/lib/n8n";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { LeadJob } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function addEvent(jobId: string, status: string, message: string, metadata = {}) {
  const supabase = createAdminSupabase();
  await supabase.from("job_events").insert({ job_id: jobId, status, message, metadata });
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
