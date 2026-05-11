import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";
import {
  emailOAuthRedirectUri,
  exchangeGoogleCode,
  getGoogleProfile,
  upsertGoogleConnection,
  verifyOAuthState
} from "../../../../../lib/email-connections";

function redirectWithStatus(request: NextRequest, returnTo: string, status: "connected" | "error", message?: string) {
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  const url = new URL(`${appUrl}${returnTo}`);
  url.searchParams.set("email_connection", status);
  if (message) url.searchParams.set("email_message", message.slice(0, 180));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";

  let returnTo = "/outreach";

  try {
    const statePayload = verifyOAuthState(state, "google");
    returnTo = statePayload.return_to;

    if (oauthError) {
      return redirectWithStatus(request, returnTo, "error", oauthError);
    }

    if (!code) {
      return redirectWithStatus(request, returnTo, "error", "Google did not return an authorization code.");
    }

    const redirectUri = emailOAuthRedirectUri("google", request.url);
    const tokenPayload = await exchangeGoogleCode(code, redirectUri);
    const profile = await getGoogleProfile(tokenPayload.access_token, tokenPayload.id_token);
    await upsertGoogleConnection(createAdminSupabase(), statePayload.user_id, tokenPayload, profile);

    return redirectWithStatus(request, returnTo, "connected", `Connected ${profile.email}.`);
  } catch (callbackError) {
    return redirectWithStatus(
      request,
      returnTo,
      "error",
      callbackError instanceof Error ? callbackError.message : "Google connection failed."
    );
  }
}
