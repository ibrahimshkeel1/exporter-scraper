/**
 * Admin Config Tuning API
 * ======================
 * Lists available specialist configs from the scraper.
 * In production, this would proxy to the worker API.
 * For now, it reads the static config YAMLs bundled with the frontend.
 */

import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export type SpecialistConfigMeta = {
  slug: string;
  display_name: string;
  version: number;
  quality_tier: string;
  trigger_keywords: string[];
  keyword_count: number;
};

// In production these come from the scraper worker or DB.
// For the tuning page we serve static configs.
const STATIC_CONFIGS: SpecialistConfigMeta[] = [
  {
    slug: "textile-apparel",
    display_name: "Textile & Apparel Importers",
    version: 4,
    quality_tier: "A+",
    trigger_keywords: ["apparel", "clothing", "denim", "fabric", "fashion", "garment", "textile", "leather"],
    keyword_count: 27,
  },
  {
    slug: "generic-b2b",
    display_name: "Generic B2B / Services (Catch-All)",
    version: 1,
    quality_tier: "C",
    trigger_keywords: [],
    keyword_count: 0,
  },
];

export async function GET() {
  return NextResponse.json({ configs: STATIC_CONFIGS });
}
