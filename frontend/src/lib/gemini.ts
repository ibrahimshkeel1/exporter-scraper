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

export type LeadJobReviewInput = {
  jobId: string;
  planName: string;
  targetRegion: string;
  refinedIndustry: string;
  leadLimit: number;
  minScore: number;
  finalCsv: string;
  auditCsv: string;
  finalRowCount: number;
  auditRowCount: number;
  preflight?: Record<string, unknown>;
};

export type LeadJobReviewReport = {
  headline: string;
  executiveSummary: string;
  outcome: string;
  leadCount: number;
  auditCount: number;
  strongestPatterns: string[];
  concerns: string[];
  nextActions: string[];
  qualityAssessment: string;
  confidence: "low" | "medium" | "high";
  recommendedFollowUpSearches: string[];
  notableLeads: string[];
  warnings: string[];
};

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function hasAudienceSignal(text: string) {
  return /retail|retailer|restaurant|hospitality|industrial|factory|warehouse|developer|franchise|chain|company|companies|business|firm|client|customer|buyer|lead|prospect/.test(text);
}

function hasEvidenceSignal(text: string) {
  return /email|contact form|contact route|contact|niche fit|fit|buying intent|company size|decision maker|website|lead evidence|useful/.test(text);
}

function extractWebsite(text: string) {
  const explicitUrl = text.match(/https?:\/\/[^\s)]+/i)?.[0];
  const bareDomain = text.match(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s)]*)?/i)?.[0];
  return (explicitUrl || bareDomain || "").replace(/[.,]+$/, "");
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
  const isArchitectureBusiness = hasAny(lower, ["architecture", "architect", "architectural", "interior design", "commercial design", "masdesigns", "masdesigns.pk"]);
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

  if (isArchitectureBusiness) {
    const buyerTypes = unique([
      hasAny(lower, ["retail", "retailer", "retailers"]) ? "Growing retailers" : "",
      hasAny(lower, ["restaurant", "restaurants", "hospitality"]) ? "Restaurant and hospitality groups" : "",
      hasAny(lower, ["industrial", "factory", "warehouse"]) ? "Industrial firms expanding facilities" : "",
      "Franchise operators",
      "Commercial property developers"
    ]);
    const audience = buyerTypes.slice(0, 3).join(", ").toLowerCase();

    return {
      transcript,
      website,
      businessSummary: `Pakistan-based architecture and commercial design business${website ? ` with website ${website}` : ""}.`,
      offerSummary: "Architecture, interior design, commercial fit-out, and planning expertise for businesses opening or upgrading physical locations.",
      idealCustomerProfile: buyerTypes.join(", "),
      refinedIndustry: `growing retailers restaurants industrial firms needing architecture commercial interior design`,
      buyerTypes,
      targetMarkets,
      excludedMarkets: ["Pakistan-based prospects unless explicitly international-facing"],
      qualificationSignals: [
        "retail expansion",
        "new store",
        "restaurant opening",
        "franchise locations",
        "commercial fit-out",
        "architecture or design need",
        "facility expansion",
        "usable email or contact route",
        "niche fit"
      ],
      disqualificationSignals: ["architecture firms", "design agencies", "job listings", "directories without direct company websites", "suppliers selling to architects"],
      searchStem: `${audience || "growing retail restaurant industrial companies"} architecture design fit out expansion`
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
  const inferredBuyer = unique([
    hasAny(lower, ["retail", "retailer", "retailers"]) ? "Retail companies" : "",
    hasAny(lower, ["restaurant", "restaurants"]) ? "Restaurants" : "",
    hasAny(lower, ["industrial", "factory", "warehouse"]) ? "Industrial firms" : "",
    hasAny(lower, ["firm", "firms", "company", "companies", "business", "businesses"]) ? "Relevant companies" : ""
  ]).join(", ");
  const buyer = input.buyerType.trim() || inferredBuyer || "qualified prospects and decision makers";
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
  const hasOfferSignal = brief.offerSummary.length > 30 || hasAny(transcript, ["sell", "offer", "service", "manufacturer", "agency", "brand", "website", "export", "architecture", "architect", "design", "expertise"]);
  const hasQualitySignal = hasEvidenceSignal(transcript);
  const needsMoreInfo = brief.transcript.length < 50 || !hasSpecificAudience || !hasMarketSignal || !hasOfferSignal || !hasAudienceSignal(transcript) || !hasQualitySignal;
  const followUpQuestions = [
    !hasOfferSignal ? "What exactly are you selling, and what makes your offer different?" : "",
    !hasSpecificAudience ? "What type of companies or people should count as ideal leads?" : "",
    !hasMarketSignal ? "Which countries or regions should I prioritize, or should this be international?" : "",
    !hasQualitySignal ? "What lead evidence should I require before a result is considered useful, such as email, contact form, buying intent, company size, or niche fit?" : ""
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

function fallbackLeadJobReview(input: LeadJobReviewInput): LeadJobReviewReport {
  const finalCount = Math.max(0, input.finalRowCount || 0);
  const auditCount = Math.max(0, input.auditRowCount || 0);
  const filled = finalCount >= input.leadLimit;

  return {
    headline: `${input.planName} review: ${finalCount}/${input.leadLimit} final leads`,
    executiveSummary: `The run analyzed ${auditCount} candidates and exported ${finalCount} final leads for ${input.targetRegion}. Review the audit file for the full rejection story.`,
    outcome: filled ? "filled" : "partial",
    leadCount: finalCount,
    auditCount,
    strongestPatterns: [
      "The final leads are the closest buyer-side matches from the run.",
      "The audit file shows the reasons weaker candidates were skipped."
    ],
    concerns: filled ? [] : ["The run did not fully hit the requested pack size with the current search space."],
    nextActions: [
      "Review the audit CSV for the most common rejection reasons.",
      "Broaden or narrow the brief based on the best-performing buyers.",
      "Run a follow-up search if you want more volume."
    ],
    qualityAssessment: filled ? "The pack is complete." : "The pack is useful but short of the target.",
    confidence: finalCount > 0 ? "medium" : "low",
    recommendedFollowUpSearches: [
      input.refinedIndustry,
      `${input.refinedIndustry} wholesale buyers`,
      `${input.refinedIndustry} supplier application`
    ].filter(Boolean),
    notableLeads: [],
    warnings: ["Gemini was unavailable, so a local fallback review was used."]
  };
}

function parseLeadJobReviewJson(text: string): LeadJobReviewReport | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      headline: String(parsed.headline ?? ""),
      executiveSummary: String(parsed.executiveSummary ?? ""),
      outcome: String(parsed.outcome ?? ""),
      leadCount: Number(parsed.leadCount ?? 0),
      auditCount: Number(parsed.auditCount ?? 0),
      strongestPatterns: Array.isArray(parsed.strongestPatterns) ? parsed.strongestPatterns.map(String).slice(0, 8) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 8) : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String).slice(0, 8) : [],
      qualityAssessment: String(parsed.qualityAssessment ?? ""),
      confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium",
      recommendedFollowUpSearches: Array.isArray(parsed.recommendedFollowUpSearches) ? parsed.recommendedFollowUpSearches.map(String).slice(0, 8) : [],
      notableLeads: Array.isArray(parsed.notableLeads) ? parsed.notableLeads.map(String).slice(0, 8) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 6) : []
    };
  } catch {
    return null;
  }
}

export async function runTargetingPreflight(input: PreflightInput): Promise<TargetingPreflight> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const localPreflight = fallbackPreflight(input);

  if (!apiKey) {
    return localPreflight;
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
      ...localPreflight,
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
      ...localPreflight,
      riskLevel: "medium",
      warnings: ["Gemini returned an incomplete lead brief; fallback targeting was used."]
    };
  }

  if (parsed.needsMoreInfo && !localPreflight.needsMoreInfo) {
    return {
      ...localPreflight,
      ...parsed,
      needsMoreInfo: false,
      followUpQuestions: [],
      riskLevel: parsed.riskLevel === "high" ? "medium" : parsed.riskLevel,
      qualityNotes: parsed.qualityNotes || "The chat contains enough offer, audience, market, and lead-evidence context to run the search.",
      warnings: unique([
        ...(parsed.warnings || []),
        "Gemini requested more context, but the local completeness check found enough detail to proceed."
      ])
    };
  }

  return parsed;
}

export async function runLeadJobReview(input: LeadJobReviewInput): Promise<LeadJobReviewReport> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  if (!apiKey) {
    return fallbackLeadJobReview(input);
  }

  const finalPreview = input.finalCsv.slice(-20000);
  const auditPreview = input.auditCsv.slice(-20000);

  const prompt = [
    "You are an AI lead-quality reviewer for a lead-generation app.",
    "Review the final CSV and audit CSV from this run and return JSON only.",
    "Do not use markdown.",
    "Schema keys: headline, executiveSummary, outcome, leadCount, auditCount, strongestPatterns, concerns, nextActions, qualityAssessment, confidence, recommendedFollowUpSearches, notableLeads, warnings.",
    "Compare the final CSV against the audit CSV.",
    "Explain what the final leads have in common and what the audit rows reveal about near-misses and rejection reasons.",
    "If the run is partial, say that plainly.",
    "Do not invent rows or names not present in the input.",
    "Keep the response concise but useful for a customer reading their job summary.",
    "",
    `Job id: ${input.jobId}`,
    `Plan: ${input.planName}`,
    `Target region: ${input.targetRegion}`,
    `Refined industry: ${input.refinedIndustry}`,
    `Requested lead count: ${input.leadLimit}`,
    `Minimum score used: ${input.minScore}`,
    `Final CSV row count: ${input.finalRowCount}`,
    `Audit CSV row count: ${input.auditRowCount}`,
    "",
    "Preflight context:",
    JSON.stringify(input.preflight || {}, null, 2),
    "",
    "Final CSV preview:",
    finalPreview || "No final CSV available.",
    "",
    "Audit CSV preview:",
    auditPreview || "No audit CSV available."
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
      ...fallbackLeadJobReview(input),
      warnings: [
        response.status === 429
          ? "Gemini is rate-limited, so a local review was used."
          : `Gemini job review failed with HTTP ${response.status}; a local review was used.`
      ]
    };
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = typeof text === "string" ? parseLeadJobReviewJson(text) : null;

  if (!parsed || !parsed.headline || !parsed.executiveSummary) {
    return {
      ...fallbackLeadJobReview(input),
      warnings: ["Gemini returned an incomplete job review; fallback review was used."]
    };
  }

  return parsed;
}
