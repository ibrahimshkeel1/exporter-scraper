import { getLeadPack } from "@/lib/pricing";
import { LeadRequestInput, TargetingPreflight } from "@/lib/types";

function buildWorkerOutputDir(jobId: string) {
  const baseDir = (process.env.WORKER_OUTPUT_BASE_DIR || "exports/worker-runs").replace(/\/+$/, "");
  return `${baseDir}/${jobId}/exports`;
}

export function buildScraperJobConfig(jobId: string, input: LeadRequestInput, preflight: TargetingPreflight) {
  const pack = getLeadPack(input.packId);
  const demoBypass = Boolean(input.adminBypassCode);
  const leadLimit = demoBypass ? 1 : pack.leads;
  const minScore = demoBypass ? 0 : preflight.recommendedMinScore || 75;
  const maxAnalyzed = demoBypass ? 80 : Math.max(1000, pack.leads * 300);

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
      fill_until_complete: true,
      mode: demoBypass ? "demo" : "verified"
    },
    quality: {
      allow_no_email: demoBypass,
      allow_weak_buyer_evidence: demoBypass,
      a_plus_score: 85
    },
    delivery: {
      format: input.exportFormat || "all",
      output_dir: buildWorkerOutputDir(jobId)
    }
  };
}
