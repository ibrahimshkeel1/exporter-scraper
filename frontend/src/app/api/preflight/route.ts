import { NextRequest, NextResponse } from "next/server";
import { runTargetingPreflight } from "../../../lib/gemini";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const region = String(body.region ?? "International");
  const productCategory = String(body.productCategory ?? "").trim();
  const buyerType = String(body.buyerType ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  const conversation = Array.isArray(body.conversation)
    ? body.conversation
        .map((message: Record<string, unknown>) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content ?? "").trim()
        }))
        .filter((message: { role: "user" | "assistant"; content: string }) => message.content)
        .slice(-20)
    : [];

  if (!productCategory && conversation.length === 0) {
    return NextResponse.json({ error: "Describe the business or target leads first." }, { status: 400 });
  }

  const preflight = await runTargetingPreflight({
    region,
    productCategory,
    buyerType,
    notes,
    conversation
  });

  return NextResponse.json({ preflight });
}
