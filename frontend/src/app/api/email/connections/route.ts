import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../lib/supabase-admin";
import { listUserEmailConnections } from "../../../../lib/email-connections";

export async function GET(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  try {
    const connections = await listUserEmailConnections(createAdminSupabase(), user.id);
    return NextResponse.json({ connections });
  } catch (listError) {
    return NextResponse.json(
      { error: listError instanceof Error ? listError.message : "Could not load email connections." },
      { status: 500 }
    );
  }
}
