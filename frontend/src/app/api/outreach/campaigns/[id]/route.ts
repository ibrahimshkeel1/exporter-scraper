import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { getCampaignForUser } from "../../../../../lib/outreach-server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await context.params;
  const { campaign, error: campaignError } = await getCampaignForUser(id, user.id);
  if (!campaign) {
    return NextResponse.json({ error: campaignError }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}
