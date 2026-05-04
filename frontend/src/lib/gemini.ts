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

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function extractWebsite(text: string) {
  return text.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,]+$/, "") || "";
}

function inferMarkets(region: string, transcript: string) {
  const lower = transcript.toLowerCase();
  const markets: string[] = [];
  if (/\busa\b|\bu\.s\.\b|united states|america|american/.test(lower)) markets.push("USA");
  if (/\buk\b|u\.k\.|united kingdom|britain|england|london/.test(lower)) markets.push("UK");
  if (/europe|germany|france|netherlands|italy|spain|poland|sweden/.test(lower)) markets.push("Europe");
  if (/uae|dubai|saudi|qatar|kuwait|middle east|gcc/.test(lower)) markets.push("GCC");
  if (region && region !== "International") markets.unshift(region);
  return unique(markets.length ? markets : [region || "International"]).slice(0, 5);
}

function inferFallbackBriefParts(input: PreflightInput) {
  const transcript = (input.conversation || [])
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ")
    .trim();
  const lower = transcript.toLowerCase();
  const website = extractWebsite(transcript);
  const targetMarkets = inferMarkets(input.region, transcript);
  const isClothingManufacturer = hasAny(lower, ["manufacturer", "manufacturing", "factory", "export"]) && hasAny(lower, ["clothing", "apparel", "denim", "jeans", "garment"]);
  const isAgency = hasAny(lower, ["agency", "web design", "marketing", "seo", "software", "development"]);
  const isHealthcare = hasAny(lower, ["clinic", "dentist", "dental", "doctor", "medical"]);

  if (isClothingManufacturer) {
    const product = hasAny(lower, ["denim", "jeans"]) ? "denim jeans and clothing manufacturing" : "clothing manufacturing";
    return {
      transcript,
      website,
      businessSummary: `Pakistan-based ${product} business${website ? ` with website ${website}` : ""}.`,
      offerSummary: `Affordable ${product}, private-label production, and export supply for overseas buyers.`,
      idealCustomerProfile: "Fashion retailers, denim brands, boutiques, wholesalers, importers, and private-label clothing brands buying from USA/UK/international suppliers.",
      refinedIndustry: `${product} buyers retailers wholesalers importers private label brands`,
      buyerTypes: ["Fashion retailers", "Denim brands", "Private-label clothing brands", "Boutiques", "Wholesalers", "Importers"],
      targetMarkets,
      excludedMarkets: ["Pakistan", "India", "Bangladesh", "China"],
      qualificationSignals: [
        "denim",
        "jeans",
        "clothing",
        "apparel",
        "fashion retailer",
        "boutique",
        "wholesale",
        "private label",
        "supplier",
        "vendor",
        "import",
        "contact"
      ],
      disqualificationSignals: ["manufacturer competitors", "factories", "job listings", "fashion magazines", "marketplaces without direct brand websites"],
      searchStem: `${product} retailers wholesalers importers private label brands`
    };
  }

  if (isAgency || isHealthcare) {
    const offer = isAgency ? "digital services" : "business services";
    const audience = isHealthcare ? "clinics and healthcare businesses" : "companies likely to buy digital services";
    return {
      transcript,
      website,
      businessSummary: transcript.slice(0, 180) || `Business offering ${offer}.`,
      offerSummary: offer,
      idealCustomerProfile: audience,
      refinedIndustry: `${audience} needing ${offer}`,
      buyerTypes: isHealthcare ? ["Dental clinics", "Private clinics", "Healthcare practices"] : ["Small businesses", "Founders", "Local service companies", "Marketing decision makers"],
      targetMarkets,
      excludedMarkets: [],
      qualificationSignals: ["website", "contact", "booking", "services", "about", "email"],
      disqualificationSignals: ["job boards", "directories without websites", "competitors", "irrelevant blogs"],
      searchStem: `${audience} ${offer}`
    };
  }

  const product = input.productCategory.trim() || transcript.slice(0, 140) || "business services";
  const buyer = input.buyerType.trim() || "qualified prospects and decision makers";
  return {
    transcript,
    website,
    businessSummary: transcript.slice(0, 180) || product,
    offerSummary: product,
    idealCustomerProfile: buyer,
    refinedIndustry: `${product} ${buyer}`,
    buyerTypes: [buyer, "Decision makers", "Companies with buying intent"],
    targetMarkets,
    excludedMarkets: [],
    qualificationSignals: ["Clear fit for the offer", "Public website", "Usable contact route"],
    disqualificationSignals: ["Directories without company websites", "Competitors", "Irrelevant consumer pages"],
    searchStem: `${product} ${buyer}`
  };
}

function fallbackPreflight(input: PreflightInput): TargetingPreflight {
  const brief = inferFallbackBriefParts(input);
  const marketText = brief.targetMarkets.join(" ");
  const searchBase = `${brief.searchStem} ${marketText}`.trim();
  const transcript = brief.transcript.toLowerCase();
  const hasSpecificAudience = brief.buyerTypes.some((buyer) => !/qualified prospects|decision makers|companies with buying intent/i.test(buyer));
  const hasMarketSignal = brief.targetMarkets.some((market) => market !== "International") || /international|global|worldwide/.test(transcript);
  const hasOfferSignal = brief.offerSummary.length > 30 || hasAny(transcript, ["sell", "offer", "service", "manufacturer", "agency", "brand", "website", "export"]);
  const needsMoreInfo = brief.transcript.length < 80 || !hasSpecificAudience || !hasMarketSignal || !hasOfferSignal;
  const followUpQuestions = [
    !hasOfferSignal ? "What exactly are you selling, and what makes your offer different?" : "",
    !hasSpecificAudience ? "What type of companies or people should count as ideal leads?" : "",
    !hasMarketSignal ? "Which countries or regions should I prioritize, or should this be international?" : "",
    "What lead evidence should I require before a result is considered useful, such as email, contact form, buying intent, company size, or niche fit?"
  ].filter(Boolean).slice(0, 4);

  return {
    businessSummary: brief.businessSummary,
    offerSummary: brief.offerSummary,
    website: brief.website,
    idealCustomerProfile: brief.idealCustomerProfile,
    refinedIndustry: brief.refinedIndustry,
    searchTerms: [
      `${searchBase} contact email`,
      `${searchBase} supplier vendor procurement`,
      `${searchBase} wholesale private label buyers`,
      `${searchBase} retailers boutiques brands`
    ],
    buyerTypes: brief.buyerTypes,
    targetMarkets: brief.targetMarkets,
    excludedMarkets: brief.excludedMarkets,
    qualificationSignals: brief.qualificationSignals,
    disqualificationSignals: brief.disqualificationSignals,
    outreachAngle: brief.offerSummary,
    needsMoreInfo,
    followUpQuestions,
    riskLevel: needsMoreInfo ? "high" : "medium",
    qualityNotes:
      needsMoreInfo
        ? "Fallback draft used because Gemini was unavailable or rate-limited. More context is needed before running a high-quality search."
        : "Fallback lead brief used because Gemini was unavailable or rate-limited. The brief was inferred from your chat context.",
    recommendedMinScore: 55,
    warnings: [
      "Gemini was unavailable or rate-limited, so fallback targeting was used.",
      ...(needsMoreInfo ? ["Answer the follow-up questions for a stronger lead search."] : [])
    ]
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
    "Do not finalize too early. If the business offer, target customer type, target market, or lead quality/contact requirements are unclear, set needsMoreInfo true and ask up to 4 concise followUpQuestions. Still provide your best draft brief.",
    "If the user gives enough context, set needsMoreInfo false and write qualityNotes as a short final confirmation of the search strategy.",
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
      warnings: [
        response.status === 429
          ? "Gemini is currently rate-limited, so a local context-based brief was used. Try Build AI brief again later for a richer analysis."
          : `Gemini lead brief failed with HTTP ${response.status}; a local context-based brief was used.`
      ]
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
