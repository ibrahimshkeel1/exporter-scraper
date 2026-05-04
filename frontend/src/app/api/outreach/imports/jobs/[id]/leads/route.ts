import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../../lib/api-auth";
import { normalizeOutreachLead, OutreachLeadInput } from "../../../../../../../lib/outreach";
import { createAdminSupabase } from "../../../../../../../lib/supabase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ExportRow = {
  format: string;
  storage_path: string | null;
  public_url: string | null;
};

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsvLeads(text: string): OutreachLeadInput[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    return normalizeOutreachLead({
      company_name: row.company_name || row.company || row.business_name || row.name,
      contact_name: row.contact_name || row.first_name || row.person_name,
      email: row.email || row.contact_email || row.primary_email,
      website: row.website || row.url || row.domain,
      notes: row.notes || row.evidence || row.buyer_evidence || row.summary,
      source: "scraper",
      evidence: row
    });
  }).filter((lead: OutreachLeadInput | null): lead is OutreachLeadInput => Boolean(lead));
}

function parseJsonLeads(text: string): OutreachLeadInput[] {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.leads) ? parsed.leads : [];
  return rows.map((row: Record<string, unknown>) => normalizeOutreachLead({
    company_name: String(row.company_name || row.company || row.name || ""),
    contact_name: String(row.contact_name || row.first_name || row.person_name || ""),
    email: String(row.email || row.contact_email || row.primary_email || ""),
    website: String(row.website || row.url || row.domain || ""),
    notes: String(row.notes || row.evidence || row.summary || ""),
    source: "scraper",
    evidence: row
  })).filter((lead: OutreachLeadInput | null): lead is OutreachLeadInput => Boolean(lead));
}

function pickExport(exports: ExportRow[]) {
  return exports.find((item) => item.storage_path && /_leads\.csv$/i.test(item.storage_path))
    || exports.find((item) => item.storage_path && item.format?.toLowerCase() === "csv" && !/audit/i.test(item.storage_path))
    || exports.find((item) => item.storage_path && item.format?.toLowerCase() === "json" && !/audit/i.test(item.storage_path))
    || null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminSupabase();
  const { data: job, error: queryError } = await supabase
    .from("lead_jobs")
    .select("id,user_id,status,lead_exports(format,storage_path,public_url)")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "delivered")
    .single();

  if (queryError || !job) {
    return NextResponse.json({ error: queryError?.message || "Delivered job not found." }, { status: 404 });
  }

  const selected = pickExport((job.lead_exports || []) as ExportRow[]);
  if (!selected?.storage_path) {
    return NextResponse.json({ error: "No lead export file was found for this job." }, { status: 404 });
  }

  const { data, error: downloadError } = await supabase.storage.from("lead-exports").download(selected.storage_path);
  if (downloadError || !data) {
    return NextResponse.json({ error: downloadError?.message || "Could not download lead export." }, { status: 500 });
  }

  const text = await data.text();
  const leads = selected.storage_path.toLowerCase().endsWith(".json") ? parseJsonLeads(text) : parseCsvLeads(text);
  return NextResponse.json({ leads: leads.slice(0, 50), source: selected.storage_path });
}
