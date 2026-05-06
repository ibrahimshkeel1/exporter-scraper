import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "../../../../lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const admin = createAdminSupabase();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data, error } = await admin
      .from("user_dashboard_layouts")
      .select("layout")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ layout: data?.layout ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const admin = createAdminSupabase();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const layout = body.layout;
    if (!Array.isArray(layout)) {
      return NextResponse.json({ error: "layout must be an array" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("user_dashboard_layouts")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    let result;
    if (existing) {
      result = await admin
        .from("user_dashboard_layouts")
        .update({ layout, updated_at: new Date().toISOString() })
        .eq("user_id", userData.user.id)
        .select()
        .single();
    } else {
      result = await admin
        .from("user_dashboard_layouts")
        .insert({ user_id: userData.user.id, layout })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ layout: result.data.layout });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
