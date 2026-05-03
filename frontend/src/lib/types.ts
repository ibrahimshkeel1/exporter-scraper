export type LeadJobStatus =
  | "draft"
  | "payment_pending"
  | "payment_review"
  | "approved"
  | "queued"
  | "running"
  | "delivered"
  | "failed"
  | "rejected";

export type PaymentStatus = "not_required" | "pending" | "under_review" | "approved" | "rejected";

export type TargetingPreflight = {
  refinedIndustry: string;
  searchTerms: string[];
  buyerTypes: string[];
  riskLevel: "low" | "medium" | "high";
  qualityNotes: string;
  recommendedMinScore: number;
  warnings: string[];
};

export type LeadJob = {
  id: string;
  user_id: string;
  customer_email: string | null;
  status: LeadJobStatus;
  payment_status: PaymentStatus;
  plan_id: string;
  plan_name: string;
  price_usd: number;
  lead_limit: number;
  target_region: string;
  original_industry: string;
  refined_industry: string;
  buyer_types: string[];
  export_format: string;
  min_score: number;
  preflight: TargetingPreflight | Record<string, unknown>;
  job_config: Record<string, unknown>;
  admin_note: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  lead_exports?: LeadExport[];
  payment_proofs?: PaymentProof[];
};

export type LeadExport = {
  id: string;
  job_id: string;
  format: string;
  storage_path: string | null;
  public_url: string | null;
  row_count: number | null;
  created_at: string;
};

export type PaymentProof = {
  id: string;
  job_id: string;
  user_id: string;
  amount_usd: number | null;
  transaction_id: string | null;
  storage_path: string | null;
  note: string | null;
  status: PaymentStatus;
  created_at: string;
};

export type LeadRequestInput = {
  packId: string;
  region: string;
  productCategory: string;
  buyerType: string;
  notes: string;
  exportFormat: string;
  adminBypassCode?: string;
  preflight: TargetingPreflight;
  advanced?: {
    allowNoEmail: boolean;
    allowWeakBuyerEvidence: boolean;
    minScore: number;
  };
};
