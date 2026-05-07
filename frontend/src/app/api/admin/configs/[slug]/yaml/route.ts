import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "../../../../../../lib/api-auth";
import { readConfigYaml, writeConfigYaml } from "../../../../../../lib/admin-configs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const yaml = await readConfigYaml(slug);

    return NextResponse.json({
      slug,
      yaml,
      size_bytes: Buffer.byteLength(yaml, "utf-8"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const { slug } = await params;

  try {
    const body = await request.json();
    const yaml = String(body.yaml || "");
    await writeConfigYaml(slug, yaml);
    return NextResponse.json({
      slug,
      yaml,
      size_bytes: Buffer.byteLength(yaml, "utf-8"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not save config.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
