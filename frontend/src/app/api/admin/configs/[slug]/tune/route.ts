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
import { assertAdmin } from "../../../../../../lib/api-auth";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ANALYZE_RESULT_SHAPE = `{
  "diagnosis": string,
  "score": number,
  "suggestions": [
    {
      "type": string,
      "target": string,
      "value": string,
      "reasoning": string
    }
  ],
  "warnings": [string]
}`;
const CRITIC_RESULT_SHAPE = `{
  "approved": boolean,
  "tier": string,
  "confidence": number,
  "score_breakdown": { "query_specificity": number, "keyword_coverage": number, "seed_coverage": number, "exclusion_accuracy": number, "result_quality": number },
  "strengths": [string],
  "gaps": [string],
  "verdict": string
}`;

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
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function stripGeminiFences(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractBalancedJson(raw: string): string | null {
  const startIndex = raw.search(/[\[{]/);
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let quoteChar = "";

  for (let index = startIndex; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function normalizeParsedJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (Array.isArray(value) && value.length === 1) {
    return normalizeParsedJson(value[0]);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return normalizeParsedJson(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function parseGeminiJson(raw: string): Record<string, unknown> | null {
  const cleaned = stripGeminiFences(raw);
  const candidates = [cleaned, extractBalancedJson(cleaned)].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return normalizeParsedJson(JSON.parse(candidate));
    } catch {
      continue;
    }
  }

  return null;
}

async function repairGeminiJson(raw: string, shape: string, kind: "analyze" | "critic"): Promise<Record<string, unknown> | null> {
  if (!raw.trim()) return null;

  const repairSystemPrompt = `You are a strict JSON repair assistant for a lead-generation tuning tool.
Return only valid JSON. Do not add markdown, commentary, or code fences.`;
  const repairUserPrompt = `The previous Gemini response for the ${kind} step was not valid JSON.
Repair it to match this shape:
${shape}

Original raw output:
${raw.slice(0, 3500)}`;

  const repairedRaw = await callGemini(repairSystemPrompt, repairUserPrompt);
  return parseGeminiJson(repairedRaw);
}

function buildAnalyzeFallback(slug: string, raw: string) {
  return {
    action: "analyze",
    slug,
    diagnosis: "Gemini returned malformed JSON, so no structured analysis could be produced.",
    score: 0,
    suggestions: [],
    warnings: [
      "Gemini did not return valid JSON.",
      raw ? `Raw Gemini output was captured for debugging: ${raw.slice(0, 200)}` : "Gemini returned an empty response."
    ],
  };
}

function buildCriticFallback(slug: string, raw: string) {
  return {
    action: "critic",
    slug,
    approved: false,
    tier: "C",
    confidence: 0,
    score_breakdown: {
      query_specificity: 0,
      keyword_coverage: 0,
      seed_coverage: 0,
      exclusion_accuracy: 0,
      result_quality: 0,
    },
    strengths: [],
    gaps: ["Gemini did not return valid JSON, so the critic step could not complete."],
    verdict: raw ? "Malformed Gemini output prevented a critic verdict." : "Gemini returned an empty response.",
  };
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
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const { slug } = await params;

  try {
    const body = await request.json();
    const { action, configYaml, jobSummary, auditSummary, scenario, region, refinedIndustry } = body;

    switch (action) {
      case "analyze": {
        return await handleAnalyze(slug, configYaml, jobSummary, auditSummary, scenario, region, refinedIndustry);
      }
      case "critic": {
        return await handleCritic(slug, configYaml, jobSummary, scenario, region, refinedIndustry);
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
  scenario?: string,
  region?: string,
  refinedIndustry?: string,
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
5. Keep cost under control: return at most 6 high-impact suggestions
6. Tune for the parent category, but use the scenario as a representative test case
7. Return ONLY valid JSON with this structure:
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

Representative scenario: ${scenario || "not supplied"}
Target region: ${region || "not supplied"}
Refined industry: ${refinedIndustry || "not supplied"}

${jobSummary ? `Job run summary:\n${jobSummary.slice(0, 1200)}` : "No job results yet."}
${auditSummary ? `\nAudit/rejects summary:\n${auditSummary.slice(0, 800)}` : ""}

Analyze and suggest tuning changes. Be specific — give exact search queries and keywords.`;

  const raw = await callGemini(systemPrompt, userPrompt);
  let result = parseGeminiJson(raw);
  if (!result) {
    result = await repairGeminiJson(raw, ANALYZE_RESULT_SHAPE, "analyze");
  }

  if (!result) {
    return NextResponse.json({
      ...buildAnalyzeFallback(slug, raw),
      raw: raw.slice(0, 200),
    });
  }

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
  scenario?: string,
  region?: string,
  refinedIndustry?: string,
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
6. Would this parent category generalize to adjacent user requests, not only one exact phrase?

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

Representative scenario: ${scenario || "not supplied"}
Target region: ${region || "not supplied"}
Refined industry: ${refinedIndustry || "not supplied"}

${jobSummary ? `Latest job results:\n${jobSummary.slice(0, 1200)}` : "No job results available."}

Is this config production-ready for ${slug}?`;

  const raw = await callGemini(systemPrompt, userPrompt);
  let result = parseGeminiJson(raw);
  if (!result) {
    result = await repairGeminiJson(raw, CRITIC_RESULT_SHAPE, "critic");
  }

  if (!result) {
    return NextResponse.json({
      ...buildCriticFallback(slug, raw),
      raw: raw.slice(0, 200),
    });
  }

  return NextResponse.json({
    action: "critic",
    slug,
    ...result,
    raw: raw.slice(0, 200),
  });
}
