import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { emailOAuthRedirectUri, googleAuthUrl, signOAuthState, safeReturnTo } from "../../../../../lib/email-connections";

export async function POST(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const redirectUri = emailOAuthRedirectUri("google", request.url);
    const state = signOAuthState({
      user_id: user.id,
      provider: "google",
      return_to: safeReturnTo(String(body.return_to || "/outreach"))
    });

    return NextResponse.json({ url: googleAuthUrl(state, redirectUri) });
  } catch (startError) {
    return NextResponse.json(
      { error: startError instanceof Error ? startError.message : "Could not start Google OAuth." },
      { status: 500 }
    );
  }
}
