import { TargetingPreflight } from "./types";

type PreflightInput = {
  region: string;
  productCategory: string;
  buyerType: string;
  notes?: string;
};

function fallbackPreflight(input: PreflightInput): TargetingPreflight {
  const product = input.productCategory.trim() || "apparel textile";
  const buyer = input.buyerType.trim() || "importers wholesalers distributors";
  const region = input.region || "USA";
  const base = `${product} ${buyer} ${region}`;

  return {
    refinedIndustry: `${product} importers wholesalers private label clothing buyers`,
    searchTerms: [
      `${base} contact email`,
      `${product} supplier application vendor portal ${region}`,
      `${product} procurement sourcing buyers ${region}`,
      `${product} wholesale distributor retailer ${region}`
    ],
    buyerTypes: [input.buyerType || "Importers", "Wholesalers", "Distributors"],
    riskLevel: product.length < 4 ? "high" : "low",
    qualityNotes:
      "Fallback preflight used because Gemini is not configured. The scraper will run with strict buyer-side evidence filters.",
    recommendedMinScore: 75,
    warnings: product.length < 4 ? ["Product category is too broad."] : []
  };
}

function parseGeminiJson(text: string): TargetingPreflight | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    
    let minScore = Number(parsed.recommendedMinScore ?? 75);
    if (!isNaN(minScore) && minScore > 0 && minScore <= 1) {
      minScore = minScore * 100;
    }

    return {
      refinedIndustry: String(parsed.refinedIndustry ?? ""),
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms.map(String).slice(0, 8) : [],
      buyerTypes: Array.isArray(parsed.buyerTypes) ? parsed.buyerTypes.map(String).slice(0, 6) : [],
      riskLevel: ["low", "medium", "high"].includes(parsed.riskLevel) ? parsed.riskLevel : "medium",
      qualityNotes: String(parsed.qualityNotes ?? ""),
      recommendedMinScore: Math.round(minScore || 75),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 6) : []
    };
  } catch {
    return null;
  }
}

export async function runTargetingPreflight(input: PreflightInput): Promise<TargetingPreflight> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  if (!apiKey) {
    return fallbackPreflight(input);
  }

  const prompt = [
    "You are refining a paid B2B buyer-lead generation job for Pakistan-based apparel/textile exporters.",
    "Return JSON only with keys: refinedIndustry, searchTerms, buyerTypes, riskLevel, qualityNotes, recommendedMinScore (integer 0-100), warnings.",
    "The scraper works best when search terms include buyer-side intent: importer, wholesaler, distributor, retailer, procurement, sourcing, vendor application, supplier portal.",
    "Reject or warn about vague consumer niches, supplier/manufacturer targets, and anything outside apparel/textile for v1.",
    "",
    `Region: ${input.region}`,
    `Product category: ${input.productCategory}`,
    `Buyer type: ${input.buyerType}`,
    `Customer notes: ${input.notes || "none"}`
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    return {
      ...fallbackPreflight(input),
      riskLevel: "medium",
      warnings: [`Gemini preflight failed with HTTP ${response.status}; fallback targeting was used.`]
    };
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = typeof text === "string" ? parseGeminiJson(text) : null;

  if (!parsed || !parsed.refinedIndustry || parsed.searchTerms.length === 0) {
    return {
      ...fallbackPreflight(input),
      riskLevel: "medium",
      warnings: ["Gemini returned an incomplete preflight; fallback targeting was used."]
    };
  }

  return parsed;
}
