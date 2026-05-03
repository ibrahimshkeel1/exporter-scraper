import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { buildScraperJobConfig } from "@/lib/job-config";
import { getLeadPack } from "@/lib/pricing";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { LeadJob, LeadRequestInput, TargetingPreflight } from "@/lib/types";
import { triggerLeadJob } from "@/lib/n8n";

async function addJobEvent(jobId: string, status: string, message: string, metadata = {}) {
  const supabase = createAdminSupabase();
  await supabase.from("job_events").insert({
    job_id: jobId,
    status,
    message,
    metadata
  });
}

export async function GET(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data, error: queryError } = await supabase
    .from("lead_jobs")
    .select("*, lead_exports(*), payment_proofs(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = (await request.json()) as LeadRequestInput;
  const pack = getLeadPack(body.packId);
  const preflight = body.preflight as TargetingPreflight;

  if (!body.region || !body.productCategory || !preflight?.refinedIndustry) {
    return NextResponse.json({ error: "Missing targeting or preflight data." }, { status: 400 });
  }

  const adminBypassCode = process.env.ADMIN_BYPASS_CODE;
  const bypassed = Boolean(body.adminBypassCode && adminBypassCode && body.adminBypassCode === adminBypassCode);
  const leadLimit = bypassed ? 1 : pack.leads;
  const priceUsd = bypassed ? 0 : pack.priceUsd;
  const supabase = createAdminSupabase();

  const { data: inserted, error: insertError } = await supabase
    .from("lead_jobs")
    .insert({
      user_id: user.id,
      customer_email: user.email,
      status: bypassed ? "approved" : "payment_pending",
      payment_status: bypassed ? "not_required" : "pending",
      plan_id: pack.id,
      plan_name: bypassed ? `${pack.name} demo` : pack.name,
      price_usd: priceUsd,
      lead_limit: leadLimit,
      target_region: body.region,
      original_industry: body.productCategory,
      refined_industry: preflight.refinedIndustry,
      buyer_types: preflight.buyerTypes,
      export_format: body.exportFormat || "all",
      min_score: preflight.recommendedMinScore || 75,
      preflight,
      admin_note: bypassed ? "Created with admin bypass code." : null
    })
    .select()
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Could not create job." }, { status: 500 });
  }

  const jobConfig = buildScraperJobConfig(inserted.id, body, preflight);
  const { data: updated, error: updateError } = await supabase
    .from("lead_jobs")
    .update({ job_config: jobConfig })
    .eq("id", inserted.id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Could not finalize job config." }, { status: 500 });
  }

  await addJobEvent(updated.id, updated.status, bypassed ? "Job created with admin bypass." : "Job created; payment proof required.");

  let triggerWarning: string | null = null;
  let job = updated as LeadJob;
  if (bypassed) {
    const trigger = await triggerLeadJob(job);
    if (trigger.ok) {
      const { data: queued } = await supabase
        .from("lead_jobs")
        .update({ status: "queued", payment_status: "not_required" })
        .eq("id", job.id)
        .select()
        .single();
      job = (queued ?? job) as LeadJob;
      await addJobEvent(job.id, "queued", "n8n lead job webhook accepted.");
    } else {
      triggerWarning = trigger.error ?? "n8n trigger failed.";
      await addJobEvent(job.id, "approved", "Job approved but n8n was not triggered.", { error: trigger.error });
    }
  }

  return NextResponse.json({ job, triggerWarning });
}
