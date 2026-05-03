import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createAdminSupabase();

  const { data: job, error: jobError } = await supabase
    .from("lead_jobs")
    .select("id,user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const { error: proofError } = await supabase.from("payment_proofs").insert({
    job_id: id,
    user_id: user.id,
    amount_usd: body.amountUsd ? Math.round(Number(body.amountUsd)) : null,
    transaction_id: body.transactionId || null,
    storage_path: body.storagePath || null,
    note: body.note || null,
    status: "under_review"
  });

  if (proofError) {
    return NextResponse.json({ error: proofError.message }, { status: 500 });
  }

  await supabase
    .from("lead_jobs")
    .update({ status: "payment_review", payment_status: "under_review" })
    .eq("id", id);

  await supabase.from("job_events").insert({
    job_id: id,
    status: "payment_review",
    message: "Payment proof submitted for admin review.",
    metadata: {}
  });

  return NextResponse.json({ ok: true });
}
