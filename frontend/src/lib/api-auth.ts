import { NextRequest } from "next/server";
import { createAdminSupabase } from "./supabase-admin";

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return { user: null, error: "Missing bearer token." };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: error?.message ?? "Invalid session." };
  }

  return { user: data.user, error: null };
}

export function assertAdmin(request: NextRequest) {
  const supplied = request.headers.get("x-admin-password");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return { ok: false, error: "ADMIN_PASSWORD is not configured." };
  }

  if (!supplied || supplied !== expected) {
    return { ok: false, error: "Invalid admin password." };
  }

  return { ok: true, error: null };
}
