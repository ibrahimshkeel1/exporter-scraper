import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "../../../../../../lib/api-auth";
import { appendTuningHistory, readTuningHistory } from "../../../../../../lib/admin-configs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const { slug } = await params;

  try {
    return NextResponse.json({
      slug,
      history: await readTuningHistory(slug),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not load tuning history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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
    const history = await appendTuningHistory(slug, body.entry || body);
    return NextResponse.json({ slug, history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not save tuning history.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
