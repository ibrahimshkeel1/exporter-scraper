import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data, error: queryError } = await supabase
    .from("lead_jobs")
    .select("id,created_at,target_region,refined_industry,original_industry,status,lead_exports(*)")
    .eq("user_id", user.id)
    .eq("status", "delivered")
    .order("created_at", { ascending: false })
    .limit(20);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}
