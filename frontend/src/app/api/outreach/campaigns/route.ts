import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../lib/supabase-admin";
import { OutreachLeadInput } from "../../../../lib/outreach";
import { toLeadRows } from "../../../../lib/outreach-server";
import { findUserEmailConnection } from "../../../../lib/email-connections";

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

export async function GET(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data, error: queryError } = await supabase
    .from("outreach_campaigns")
    .select("*, outreach_leads(*), outreach_messages(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const leads = Array.isArray(body.leads) ? (body.leads as OutreachLeadInput[]) : [];
  if (leads.length === 0) {
    return NextResponse.json({ error: "Add at least one test lead." }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const requestedConnectionId = cleanText(body.email_connection_id);
  const emailConnection = await findUserEmailConnection(supabase, user.id, requestedConnectionId || null);
  if (requestedConnectionId && !emailConnection) {
    return NextResponse.json({ error: "Selected email connection was not found." }, { status: 400 });
  }

  const { data: campaign, error: insertError } = await supabase
    .from("outreach_campaigns")
    .insert({
      user_id: user.id,
      email_connection_id: emailConnection?.id || null,
      business_plan: cleanText(body.business_plan),
      offer: cleanText(body.offer),
      target_buyer: cleanText(body.target_buyer),
      tone: cleanText(body.tone, "professional"),
      cta: cleanText(body.cta),
      signature: cleanText(body.signature),
      sender_name: cleanText(body.sender_name || emailConnection?.from_name || emailConnection?.display_name, "ExportFlow"),
      sender_email: cleanText(body.sender_email || emailConnection?.email) || null,
      status: "draft"
    })
    .select()
    .single();

  if (insertError || !campaign) {
    return NextResponse.json({ error: insertError?.message || "Could not create outreach campaign." }, { status: 500 });
  }

  const rows = toLeadRows(campaign.id, user.id, leads);
  if (rows.length === 0) {
    await supabase.from("outreach_campaigns").delete().eq("id", campaign.id);
    return NextResponse.json({ error: "No valid leads were found." }, { status: 400 });
  }

  const { error: leadsError } = await supabase.from("outreach_leads").insert(rows);
  if (leadsError) {
    await supabase.from("outreach_campaigns").delete().eq("id", campaign.id);
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const { data: fullCampaign, error: fullError } = await supabase
    .from("outreach_campaigns")
    .select("*, outreach_leads(*), outreach_messages(*)")
    .eq("id", campaign.id)
    .single();

  if (fullError || !fullCampaign) {
    return NextResponse.json({ campaign }, { status: 201 });
  }

  return NextResponse.json({ campaign: fullCampaign }, { status: 201 });
}
