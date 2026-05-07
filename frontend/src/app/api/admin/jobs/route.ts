import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "../../../../lib/api-auth";
import { buildScraperJobConfig } from "../../../../lib/job-config";
import { triggerLeadJob } from "../../../../lib/n8n";
import { createAdminSupabase } from "../../../../lib/supabase-admin";
import { LeadJob, LeadRequestInput, TargetingPreflight } from "../../../../lib/types";

export async function GET(request: NextRequest) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("lead_jobs")
    .select("*, lead_exports(*), payment_proofs(*), job_events(*)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}

async function addJobEvent(jobId: string, status: string, message: string, metadata = {}) {
  const supabase = createAdminSupabase();
  await supabase.from("job_events").insert({ job_id: jobId, status, message, metadata });
}

async function getTuningUserId() {
  const configured = process.env.ADMIN_TUNING_USER_ID || process.env.ADMIN_USER_ID;
  if (configured) return configured;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    throw new Error(`Could not resolve tuning user: ${error.message}`);
  }
  const user = data.users[0];
  if (!user) {
    throw new Error("Create at least one Supabase auth user or set ADMIN_TUNING_USER_ID.");
  }
  return user.id;
}

function splitTerms(value: unknown) {
  return String(value || "")
    .split(/[,\n]/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function POST(request: NextRequest) {
  const admin = assertAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.mode !== "tuning_test") {
      return NextResponse.json({ error: "Only tuning_test jobs can be created here." }, { status: 400 });
    }

    const region = String(body.region || body.targeting?.region || "USA");
    const industry = String(body.industry || body.targeting?.industry || "").trim();
    const refinedIndustry = String(body.refinedIndustry || body.targeting?.refined_industry || industry).trim();
    const configSlug = String(body.configSlug || body.config_slug || "").trim();
    const limit = Math.min(Math.max(Number(body.limit || body.lead_pack?.limit || 10), 3), 25);
    const minScore = Math.min(Math.max(Number(body.minScore || body.lead_pack?.min_score || 75), 55), 90);
    const maxAnalyzed = Math.min(Math.max(Number(body.maxAnalyzed || body.lead_pack?.max_analyzed || limit * 30), 80), 600);
    const searchTerms = splitTerms(body.searchTerms || body.targeting?.search_terms);

    if (!industry || !refinedIndustry || !configSlug) {
      return NextResponse.json({ error: "Config, scenario, and refined industry are required." }, { status: 400 });
    }

    const userId = await getTuningUserId();
    const preflight: TargetingPreflight = {
      businessSummary: "Admin tuning test run.",
      offerSummary: industry,
      idealCustomerProfile: "Importers, wholesalers, retailers, private-label brands, and procurement/vendor teams.",
      refinedIndustry,
      searchTerms: searchTerms.length ? searchTerms : [industry, refinedIndustry],
      buyerTypes: splitTerms(body.buyerTypes).length
        ? splitTerms(body.buyerTypes)
        : ["Importers", "Wholesalers", "Distributors", "Retailers", "Private-label brands", "Procurement/vendor portals"],
      qualificationSignals: [
        "importer",
        "wholesale",
        "distributor",
        "vendor application",
        "supplier portal",
        "procurement",
        "private label",
      ],
      disqualificationSignals: ["manufacturer", "factory", "exporter", "supplier country"],
      outreachAngle: "Export supplier qualification for a category-specific buyer.",
      riskLevel: "medium",
      qualityNotes: "Synthetic preflight for a bounded admin tuning run.",
      recommendedMinScore: minScore,
      warnings: [`Tuning cost cap: ${limit} leads, ${maxAnalyzed} analyzed pages.`],
    };

    const input: LeadRequestInput = {
      packId: "starter",
      region,
      productCategory: industry,
      buyerType: preflight.buyerTypes.join(", "),
      notes: "Admin tuning test.",
      exportFormat: "all",
      preflight,
      advanced: {
        allowNoEmail: false,
        allowWeakBuyerEvidence: false,
        minScore,
      },
    };

    const supabase = createAdminSupabase();
    const { data: inserted, error: insertError } = await supabase
      .from("lead_jobs")
      .insert({
        user_id: userId,
        customer_email: "admin-tuning@exportflow.local",
        status: "approved",
        payment_status: "not_required",
        plan_id: "tuning_test",
        plan_name: `Tuning test: ${configSlug}`,
        price_usd: 0,
        lead_limit: limit,
        target_region: region,
        original_industry: industry,
        refined_industry: refinedIndustry,
        buyer_types: preflight.buyerTypes,
        export_format: "all",
        min_score: minScore,
        preflight,
        admin_note: `Config tuning run for ${configSlug}.`,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ error: insertError?.message ?? "Could not create tuning job." }, { status: 500 });
    }

    const jobConfig = buildScraperJobConfig(inserted.id, input, preflight, {
      demoBypass: true,
      leadLimit: limit,
      minScore,
    });
    const boundedJobConfig = {
      ...jobConfig,
      config_slug: configSlug,
      test_mode: true,
      targeting: {
        ...jobConfig.targeting,
        config_slug: configSlug,
      },
      lead_pack: {
        ...jobConfig.lead_pack,
        limit,
        min_score: minScore,
        max_analyzed: maxAnalyzed,
        fill_until_complete: false,
        mode: "tuning_test",
      },
      quality: {
        ...jobConfig.quality,
        allow_no_email: false,
        allow_weak_buyer_evidence: false,
      },
    };

    const { data: updated, error: updateError } = await supabase
      .from("lead_jobs")
      .update({ job_config: boundedJobConfig })
      .eq("id", inserted.id)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "Could not finalize tuning job." }, { status: 500 });
    }

    await addJobEvent(updated.id, "approved", "Bounded config tuning test created.", {
      config_slug: configSlug,
      limit,
      max_analyzed: maxAnalyzed,
    });

    const trigger = await triggerLeadJob(updated as LeadJob);
    if (!trigger.ok) {
      await addJobEvent(updated.id, "approved", "Tuning job created, but worker trigger failed.", { error: trigger.error });
      return NextResponse.json({ job: updated, jobId: updated.id, warning: trigger.error }, { status: 202 });
    }

    const { data: queued } = await supabase
      .from("lead_jobs")
      .update({ status: "queued" })
      .eq("id", updated.id)
      .select()
      .single();
    await addJobEvent(updated.id, "queued", "Tuning worker job queued.");

    return NextResponse.json({ job: queued ?? updated, jobId: updated.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not create tuning job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
