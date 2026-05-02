import { NextRequest, NextResponse } from "next/server";
import { runTargetingPreflight } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const region = String(body.region ?? "USA");
  const productCategory = String(body.productCategory ?? "").trim();
  const buyerType = String(body.buyerType ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  if (!productCategory) {
    return NextResponse.json({ error: "Product category is required." }, { status: 400 });
  }

  const preflight = await runTargetingPreflight({
    region,
    productCategory,
    buyerType,
    notes
  });

  return NextResponse.json({ preflight });
}
