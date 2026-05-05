import { NextRequest, NextResponse } from "next/server";
import { verifyOutreachWebhook } from "../../../../../lib/outreach-server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";

export async function POST(request: NextRequest) {
  if (!verifyOutreachWebhook(request)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const [{ count: campaigns }, { count: messages }] = await Promise.all([
    supabase.from("outreach_campaigns").select("id", { count: "exact", head: true }),
    supabase.from("outreach_messages").select("id", { count: "exact", head: true }).in("status", ["sent", "test_sent"])
  ]);

  return NextResponse.json({
    ok: true,
    campaigns: campaigns || 0,
    sent_messages: messages || 0,
    rebuilt_at: new Date().toISOString()
  });
}
