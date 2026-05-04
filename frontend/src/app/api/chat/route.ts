import { NextResponse } from "next/server";
import { createAdminSupabase } from "../../../lib/supabase-admin";

export async function GET(request: Request) {
  const supabase = createAdminSupabase();
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ session: session || null });
}

export async function POST(request: Request) {
  const supabase = createAdminSupabase();
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { messages } = body;

  const { data: existingSession } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let session;
  if (existingSession) {
    const { data } = await supabase
      .from("chat_sessions")
      .update({ messages, updated_at: new Date().toISOString() })
      .eq("id", existingSession.id)
      .select()
      .single();
    session = data;
  } else {
    const { data } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, messages, is_active: true })
      .select()
      .single();
    session = data;
  }

  return NextResponse.json({ session });
}

export async function DELETE(request: Request) {
  const supabase = createAdminSupabase();
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase
    .from("chat_sessions")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  return NextResponse.json({ success: true });
}
