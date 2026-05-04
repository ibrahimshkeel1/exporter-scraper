import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { ensureJobReport } from "../../../../../lib/job-report";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminSupabase();
  const { data: job, error: jobError } = await supabase
    .from("lead_jobs")
    .select("id,user_id,status")
    .eq("id", id)
    .single();

  if (jobError || !job || job.user_id !== user.id) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (job.status !== "delivered") {
    return NextResponse.json({ error: "Report can be generated after delivery." }, { status: 400 });
  }

  const result = await ensureJobReport(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.warning || "Could not generate report." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
