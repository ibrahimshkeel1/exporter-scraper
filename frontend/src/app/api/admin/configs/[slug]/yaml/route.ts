/**
 * Admin Config YAML Loader
 * ========================
 * GET /api/admin/configs/[slug]/yaml  →  Returns the raw YAML content
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // Try loading from scraper configs directory
    const configPath = path.resolve(
      process.cwd(),
      "..",
      "scraper",
      "configs",
      `${slug}.yml`
    );

    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ error: `Config not found: ${slug}` }, { status: 404 });
    }

    const yaml = fs.readFileSync(configPath, "utf-8");

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
