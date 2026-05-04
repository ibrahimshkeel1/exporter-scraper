import { TargetingPreflight } from "./types";

type IntakeMessage = {
  role: "user" | "assistant";
  content: string;
};

type PreflightInput = {
  region: string;
  productCategory: string;
  buyerType: string;
  notes?: string;
  conversation?: IntakeMessage[];
};

function fallbackPreflight(input: PreflightInput): TargetingPreflight {
  const transcript = (input.conversation || [])
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ")
    .trim();
  const product = input.productCategory.trim() || transcript.slice(0, 100) || "business services";
  const buyer = input.buyerType.trim() || "ideal customers decision makers";
  const region = input.region || "International";
  const base = `${product} ${buyer} ${region}`;

  return {
    businessSummary: product,
    offerSummary: product,
    website: "",
    idealCustomerProfile: buyer,
    refinedIndustry: `${product} target customers`,
    searchTerms: [
      `${base} contact email`,
      `${product} companies ${region}`,
      `${product} service buyers ${region}`,
      `${product} decision makers ${region}`
    ],
    buyerTypes: [input.buyerType || "Ideal customers", "Decision makers", "Companies with buying intent"],
    targetMarkets: [region],
    excludedMarkets: [],
    qualificationSignals: ["Clear fit for the offer", "Public website", "Usable contact route"],
    disqualificationSignals: ["Directories without company websites", "Competitors", "Irrelevant consumer pages"],
    outreachAngle: "Lead with the specific business problem the offer solves.",
    needsMoreInfo: false,
    followUpQuestions: [],
    riskLevel: product.length < 4 ? "high" : "low",
    qualityNotes:
      "Fallback AI brief used because Gemini is not configured. Discovery will use broad generic customer-fit signals.",
    recommendedMinScore: 60,
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
      businessSummary: String(parsed.businessSummary ?? ""),
      offerSummary: String(parsed.offerSummary ?? ""),
      website: String(parsed.website ?? ""),
      idealCustomerProfile: String(parsed.idealCustomerProfile ?? ""),
      refinedIndustry: String(parsed.refinedIndustry ?? ""),
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms.map(String).slice(0, 8) : [],
      buyerTypes: Array.isArray(parsed.buyerTypes) ? parsed.buyerTypes.map(String).slice(0, 6) : [],
      targetMarkets: Array.isArray(parsed.targetMarkets) ? parsed.targetMarkets.map(String).slice(0, 8) : [],
      excludedMarkets: Array.isArray(parsed.excludedMarkets) ? parsed.excludedMarkets.map(String).slice(0, 8) : [],
      qualificationSignals: Array.isArray(parsed.qualificationSignals) ? parsed.qualificationSignals.map(String).slice(0, 12) : [],
      disqualificationSignals: Array.isArray(parsed.disqualificationSignals) ? parsed.disqualificationSignals.map(String).slice(0, 12) : [],
      outreachAngle: String(parsed.outreachAngle ?? ""),
      needsMoreInfo: Boolean(parsed.needsMoreInfo),
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions.map(String).slice(0, 4) : [],
      riskLevel: ["low", "medium", "high"].includes(parsed.riskLevel) ? parsed.riskLevel : "medium",
      qualityNotes: String(parsed.qualityNotes ?? ""),
      recommendedMinScore: Math.round(minScore || 60),
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

  const transcript = (input.conversation || [])
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")
    .slice(-12000);

  const prompt = [
    "You are an AI lead-generation strategist. Build a generic B2B/B2C lead search brief from the user's chat context.",
    "Return JSON only. Do not include markdown.",
    "Schema keys: businessSummary, offerSummary, website, idealCustomerProfile, refinedIndustry, searchTerms, buyerTypes, targetMarkets, excludedMarkets, qualificationSignals, disqualificationSignals, outreachAngle, needsMoreInfo, followUpQuestions, riskLevel, qualityNotes, recommendedMinScore, warnings.",
    "Make searchTerms specific enough for web discovery. Include commercial intent words relevant to the target, such as contact, email, suppliers, vendors, agencies, clinics, founders, procurement, booking, partnerships, directories, or country/city terms when appropriate.",
    "buyerTypes must describe the actual client/company/person types to find, not generic labels.",
    "qualificationSignals should include keywords or website evidence that prove a lead fits the user's offer.",
    "disqualificationSignals should include competitors, irrelevant pages, marketplaces/directories without direct company websites, jobs/careers, and countries/categories the user excludes.",
    "If the user did not provide enough context to run a good search, set needsMoreInfo true and ask up to 4 specific followUpQuestions. Still provide your best draft brief.",
    "Use recommendedMinScore 45-65 for broad exploratory lead gen, 65-80 only when the user asks for strict verified leads.",
    "",
    `Selected market: ${input.region || "International"}`,
    `Legacy category field, if any: ${input.productCategory || "none"}`,
    `Legacy client type field, if any: ${input.buyerType || "none"}`,
    `Extra notes: ${input.notes || "none"}`,
    "",
    "Conversation:",
    transcript || "No conversation supplied."
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
      warnings: [`Gemini lead brief failed with HTTP ${response.status}; fallback targeting was used.`]
    };
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = typeof text === "string" ? parseGeminiJson(text) : null;

  if (!parsed || !parsed.refinedIndustry || parsed.searchTerms.length === 0) {
    return {
      ...fallbackPreflight(input),
      riskLevel: "medium",
      warnings: ["Gemini returned an incomplete lead brief; fallback targeting was used."]
    };
  }

  return parsed;
}
