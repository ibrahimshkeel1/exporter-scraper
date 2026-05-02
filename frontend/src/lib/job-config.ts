import { getLeadPack } from "@/lib/pricing";
import { LeadRequestInput, TargetingPreflight } from "@/lib/types";

export function buildScraperJobConfig(jobId: string, input: LeadRequestInput, preflight: TargetingPreflight) {
  const pack = getLeadPack(input.packId);

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
      limit: pack.leads,
      min_score: preflight.recommendedMinScore || 75,
      mode: "verified"
    },
    quality: {
      allow_no_email: false,
      allow_weak_buyer_evidence: false,
      a_plus_score: 85
    },
    delivery: {
      format: input.exportFormat || "all",
      output_dir: `/srv/exportflow/runs/${jobId}`
    }
  };
}
