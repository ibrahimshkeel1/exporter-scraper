import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("lead_jobs")
    .select("*, lead_exports(*), payment_proofs(*), job_events(*)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}
