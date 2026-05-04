import { getLeadPack } from "./pricing";
import { LeadRequestInput, TargetingPreflight } from "./types";

type BuildScraperJobConfigOptions = {
  demoBypass?: boolean;
  leadLimit?: number;
  minScore?: number;
};

function buildWorkerOutputDir(jobId: string) {
  const baseDir = (process.env.WORKER_OUTPUT_BASE_DIR || "exports/worker-runs").replace(/\/+$/, "");
  return `${baseDir}/${jobId}/exports`;
}

export function buildScraperJobConfig(
  jobId: string,
  input: LeadRequestInput,
  preflight: TargetingPreflight,
  options: BuildScraperJobConfigOptions = {}
) {
  const pack = getLeadPack(input.packId);
  const demoBypass = Boolean(options.demoBypass);
  const leadLimit = options.leadLimit ?? (demoBypass ? 1 : pack.leads);
  const maxAnalyzed = demoBypass ? 200 : Math.max(5000, pack.leads * 1000);

  const minScore = options.minScore ?? input.advanced?.minScore ?? (demoBypass ? 0 : preflight.recommendedMinScore || 75);
  const allowNoEmail = input.advanced?.allowNoEmail ?? true;
  const allowWeakBuyerEvidence = input.advanced?.allowWeakBuyerEvidence ?? true;
  const scoringKeywords = [
    preflight.refinedIndustry,
    preflight.offerSummary,
    preflight.idealCustomerProfile,
    ...(preflight.buyerTypes || []),
    ...(preflight.qualificationSignals || [])
  ]
    .filter(Boolean)
    .join(" ");

  return {
    job_id: jobId,
    targeting: {
      region: input.region,
      industry: input.productCategory,
      refined_industry: preflight.refinedIndustry,
      search_terms: preflight.searchTerms,
      buyer_types: preflight.buyerTypes
    },
    lead_pack: {
      limit: leadLimit,
      min_score: minScore,
      max_analyzed: maxAnalyzed,
      fill_until_complete: false,
      mode: demoBypass ? "demo" : "verified"
    },
    quality: {
      allow_no_email: allowNoEmail,
      allow_weak_buyer_evidence: allowWeakBuyerEvidence,
      a_plus_score: 85,
      qualification_signals: preflight.qualificationSignals || [],
      disqualification_signals: preflight.disqualificationSignals || [],
      outreach_angle: preflight.outreachAngle || ""
    },
    scoring_context: {
      product_keywords: scoringKeywords
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4)
        .slice(0, 80),
      buyer_keywords: [
        ...(preflight.buyerTypes || []),
        ...(preflight.qualificationSignals || []),
        "contact",
        "email",
        "book",
        "quote",
        "pricing",
        "partner",
        "vendor",
        "supplier",
        "procurement",
        "services",
        "solutions"
      ],
      negative_keywords: preflight.disqualificationSignals || []
    },
    delivery: {
      format: input.exportFormat || "all",
      output_dir: buildWorkerOutputDir(jobId)
    }
  };
}
