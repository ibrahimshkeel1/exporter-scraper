/**
 * Admin Config Tuning API — Per-Config
 * =====================================
 *
 * POST /api/admin/configs/[slug]/tune
 * Body: { action, configYaml, jobSummary?, auditSummary?, previousScores? }
 *
 * Actions:
 *   "analyze"    → Feed job results to Gemini, get tuning suggestions
 *   "critic"     → Final quality check: is this config A+ ready?
 *   "classify"   → Given an industry string, which config matches?
 */

import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function parseGeminiJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

function extractConfigSummary(yaml: string): string {
  // Extract key sections from YAML for cost-efficient Gemini prompts
  const sections: string[] = [];
  
  const triggersMatch = yaml.match(/triggers:[\s\S]*?(?=\n\S|$)/);
  if (triggersMatch) sections.push(`## Triggers\n${triggersMatch[0].slice(0, 300)}`);

  const searchMatch = yaml.match(/search_queries:[\s\S]*?(?=\n  \S|$)/);
  if (searchMatch) {
    const lines = searchMatch[0].split("\n");
    const queryLines = lines.filter(l => l.trim().startsWith("- '"));
    sections.push(`## Search Queries (${queryLines.length} total)\n${queryLines.slice(0, 8).join("\n")}${queryLines.length > 8 ? `\n  ... +${queryLines.length - 8} more` : ""}`);
  }

  const buyerMatch = yaml.match(/strong_buyer_keywords:[\s\S]*?(?=\n  \S|$)/);
  if (buyerMatch) {
    const lines = buyerMatch[0].split("\n").filter(l => l.trim().startsWith("- "));
    sections.push(`## Buyer Keywords (${lines.length})\n${lines.join("\n")}`);
  }

  const exclusionMatch = yaml.match(/exporter_country_suffixes:[\s\S]*?(?=\n\S|$)/);
  if (exclusionMatch) {
    const lines = exclusionMatch[0].split("\n").filter(l => l.trim().startsWith("- "));
    sections.push(`## Country Exclusions (${lines.length})\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// POST Handler
// ─────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const body = await request.json();
    const { action, configYaml, jobSummary, auditSummary } = body;

    switch (action) {
      case "analyze": {
        return handleAnalyze(slug, configYaml, jobSummary, auditSummary);
      }
      case "critic": {
        return handleCritic(slug, configYaml, jobSummary);
      }
      default: {
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// Action: analyze
// Feed summarized job results to Gemini for tuning suggestions
// ─────────────────────────────────────────────

async function handleAnalyze(
  slug: string,
  configYaml: string,
  jobSummary?: string,
  auditSummary?: string,
) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured. Add it to your .env.local." },
      { status: 400 }
    );
  }

  const configSummary = extractConfigSummary(configYaml);

  const systemPrompt = `You are a specialist lead-generation config tuner for industries.
Your job: Analyze a config YAML + job results and suggest concrete tuning changes.

Rules:
1. Suggest specific search query ADDITIONS or MODIFICATIONS
2. Suggest keyword ADDITIONS for scoring (buyer_intent, product_fit)
3. Suggest domain/path EXCLUSION additions or relaxations
4. NEVER suggest removing existing queries/keywords — only ADD
5. Return ONLY valid JSON with this structure:
{
  "diagnosis": "Brief analysis of what's working and what's not",
  "score": 0-10 quality score for current config,
  "suggestions": [
    {
      "type": "add_search_query" | "add_keyword" | "add_exclusion" | "add_seed_url" | "relax_filter",
      "target": "discovery.search_queries" | "scoring.keywords.strong_buyer_keywords" | "scoring.keywords.product_keywords" | "discovery.seed_urls.usa" | etc,
      "value": "The exact value to add",
      "reasoning": "Why this improves results"
    }
  ],
  "warnings": ["any concerns about the config"]
}`;

  const userPrompt = `Config: ${slug}
  
Current config summary:
${configSummary.slice(0, 1500)}

${jobSummary ? `Job run summary:\n${jobSummary.slice(0, 1200)}` : "No job results yet."}
${auditSummary ? `\nAudit/rejects summary:\n${auditSummary.slice(0, 800)}` : ""}

Analyze and suggest tuning changes. Be specific — give exact search queries and keywords.`;

  const raw = await callGemini(systemPrompt, userPrompt);
  const result = parseGeminiJson(raw);

  return NextResponse.json({
    action: "analyze",
    slug,
    ...result,
    raw: raw.slice(0, 200),
  });
}

// ─────────────────────────────────────────────
// Action: critic
// Final quality check — is this config A+ ready?
// ─────────────────────────────────────────────

async function handleCritic(
  slug: string,
  configYaml: string,
  jobSummary?: string,
) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured." },
      { status: 400 }
    );
  }

  const configSummary = extractConfigSummary(configYaml);

  const systemPrompt = `You are a lead-generation quality critic (Verification Agent).
Your job: Review a specialist config + its latest job results and decide if it's ready for production.

Evaluate:
1. Are search queries specific and industry-targeted? (not generic)
2. Are buyer keywords comprehensive for this niche?
3. Are supplier-country exclusions appropriate?
4. Do seed URLs cover major known buyers in this industry?
5. Do job results show high-quality leads (score 80+), not directory fluff?

Return ONLY valid JSON:
{
  "approved": true/false,
  "tier": "A+" | "A" | "B" | "C",
  "confidence": 0.0-1.0,
  "score_breakdown": {
    "query_specificity": 0-10,
    "keyword_coverage": 0-10,
    "seed_coverage": 0-10,
    "exclusion_accuracy": 0-10,
    "result_quality": 0-10
  },
  "strengths": ["what's working well"],
  "gaps": ["what's missing"],
  "verdict": "Final summary — one sentence"
}`;

  const userPrompt = `Config: ${slug}
Tier claimed: A+

Config summary:
${configSummary.slice(0, 1500)}

${jobSummary ? `Latest job results:\n${jobSummary.slice(0, 1200)}` : "No job results available."}

Is this config production-ready for ${slug}?`;

  const raw = await callGemini(systemPrompt, userPrompt);
  const result = parseGeminiJson(raw);

  return NextResponse.json({
    action: "critic",
    slug,
    ...result,
    raw: raw.slice(0, 200),
  });
}
