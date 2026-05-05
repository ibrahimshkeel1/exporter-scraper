create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft',
  business_plan text not null default '',
  offer text not null default '',
  target_buyer text not null default '',
  tone text not null default 'professional',
  cta text not null default '',
  signature text not null default '',
  sender_name text not null default 'ExportFlow',
  sender_email text,
  generated_templates jsonb,
  approved_templates jsonb,
  last_n8n_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_campaigns_status_check check (
    status in ('draft', 'generating', 'template_ready', 'launching', 'active', 'completed', 'failed')
  )
);

create table if not exists public.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'pasted',
  contact_name text,
  company_name text,
  email text,
  website text,
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_leads_source_check check (source in ('pasted', 'scraper')),
  constraint outreach_leads_status_check check (
    status in ('draft', 'queued', 'initial_sent', 'followup_1_pending', 'followup_1_sent', 'followup_2_pending', 'followup_2_sent', 'failed', 'replied', 'unsubscribed')
  )
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step text not null default 'initial',
  status text not null default 'queued',
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  subject text,
  body_html text,
  body_text text,
  generated jsonb not null default '{}'::jsonb,
  gmail_message_id text,
  gmail_thread_id text,
  to_email text,
  original_to_email text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_messages_step_check check (step in ('initial', 'followup_1', 'followup_2')),
  constraint outreach_messages_status_check check (status in ('draft', 'queued', 'sending', 'sent', 'test_sent', 'failed', 'skipped'))
);

create unique index if not exists outreach_messages_campaign_lead_step_idx on public.outreach_messages(campaign_id, lead_id, step);
create index if not exists outreach_campaigns_user_id_created_at_idx on public.outreach_campaigns(user_id, created_at desc);
create index if not exists outreach_leads_campaign_id_idx on public.outreach_leads(campaign_id);
create index if not exists outreach_messages_due_idx on public.outreach_messages(status, scheduled_for);

drop trigger if exists set_outreach_campaigns_updated_at on public.outreach_campaigns;
create trigger set_outreach_campaigns_updated_at
before update on public.outreach_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_outreach_leads_updated_at on public.outreach_leads;
create trigger set_outreach_leads_updated_at
before update on public.outreach_leads
for each row execute function public.set_updated_at();

drop trigger if exists set_outreach_messages_updated_at on public.outreach_messages;
create trigger set_outreach_messages_updated_at
before update on public.outreach_messages
for each row execute function public.set_updated_at();

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_leads enable row level security;
alter table public.outreach_messages enable row level security;

drop policy if exists "outreach_campaigns_select_own" on public.outreach_campaigns;
create policy "outreach_campaigns_select_own" on public.outreach_campaigns for select using (auth.uid() = user_id);

drop policy if exists "outreach_campaigns_insert_own" on public.outreach_campaigns;
create policy "outreach_campaigns_insert_own" on public.outreach_campaigns for insert with check (auth.uid() = user_id);

drop policy if exists "outreach_campaigns_update_own" on public.outreach_campaigns;
create policy "outreach_campaigns_update_own" on public.outreach_campaigns for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "outreach_leads_select_own" on public.outreach_leads;
create policy "outreach_leads_select_own" on public.outreach_leads for select using (auth.uid() = user_id);

drop policy if exists "outreach_leads_insert_own" on public.outreach_leads;
create policy "outreach_leads_insert_own" on public.outreach_leads for insert with check (auth.uid() = user_id);

drop policy if exists "outreach_leads_update_own" on public.outreach_leads;
create policy "outreach_leads_update_own" on public.outreach_leads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "outreach_messages_select_own" on public.outreach_messages;
create policy "outreach_messages_select_own" on public.outreach_messages for select using (auth.uid() = user_id);

drop policy if exists "outreach_messages_insert_own" on public.outreach_messages;
create policy "outreach_messages_insert_own" on public.outreach_messages for insert with check (auth.uid() = user_id);

drop policy if exists "outreach_messages_update_own" on public.outreach_messages;
create policy "outreach_messages_update_own" on public.outreach_messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
