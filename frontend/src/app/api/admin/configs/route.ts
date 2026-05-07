import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "../../../../lib/api-auth";
import { createConfigFromGeneric, listSpecialistConfigs } from "../../../../lib/admin-configs";

export async function GET() {
  try {
    return NextResponse.json({ configs: listSpecialistConfigs() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not list configs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    createConfigFromGeneric({
      slug: body.slug,
      displayName: body.displayName,
      triggerKeywords: Array.isArray(body.triggerKeywords) ? body.triggerKeywords : [],
      productSeeds: Array.isArray(body.productSeeds) ? body.productSeeds : [],
    });
    return NextResponse.json({ configs: listSpecialistConfigs() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not create config.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
