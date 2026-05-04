create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_email text,
  status text not null default 'payment_pending',
  payment_status text not null default 'pending',
  plan_id text not null,
  plan_name text not null,
  price_usd integer not null,
  lead_limit integer not null,
  target_region text not null,
  original_industry text not null,
  refined_industry text not null,
  buyer_types text[] not null default '{}',
  export_format text not null default 'all',
  min_score integer not null default 75,
  preflight jsonb not null default '{}'::jsonb,
  job_config jsonb not null default '{}'::jsonb,
  n8n_execution_id text,
  admin_note text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_jobs_status_check check (
    status in ('draft', 'payment_pending', 'payment_review', 'approved', 'queued', 'running', 'delivered', 'failed', 'rejected')
  ),
  constraint lead_jobs_payment_status_check check (
    payment_status in ('not_required', 'pending', 'under_review', 'approved', 'rejected')
  )
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.lead_jobs(id) on delete cascade,
  status text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.lead_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd integer,
  transaction_id text,
  storage_path text,
  note text,
  status text not null default 'under_review',
  created_at timestamptz not null default now(),
  constraint payment_proofs_status_check check (
    status in ('not_required', 'pending', 'under_review', 'approved', 'rejected')
  )
);

create table if not exists public.lead_exports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.lead_jobs(id) on delete cascade,
  format text not null,
  storage_path text,
  public_url text,
  row_count integer,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_bypass_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text,
  source text,
  created_at timestamptz not null default now(),
  constraint suppression_list_email_or_domain check (email is not null or domain is not null)
);

create index if not exists lead_jobs_user_id_created_at_idx on public.lead_jobs(user_id, created_at desc);
create index if not exists job_events_job_id_created_at_idx on public.job_events(job_id, created_at desc);
create index if not exists payment_proofs_job_id_idx on public.payment_proofs(job_id);
create index if not exists lead_exports_job_id_idx on public.lead_exports(job_id);
create index if not exists suppression_list_email_idx on public.suppression_list(email);
create index if not exists suppression_list_domain_idx on public.suppression_list(domain);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_lead_jobs_updated_at on public.lead_jobs;
create trigger set_lead_jobs_updated_at
before update on public.lead_jobs
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.lead_jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.lead_exports enable row level security;
alter table public.admin_bypass_tokens enable row level security;
alter table public.suppression_list enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "lead_jobs_select_own" on public.lead_jobs;
create policy "lead_jobs_select_own" on public.lead_jobs for select using (auth.uid() = user_id);

drop policy if exists "lead_jobs_insert_own" on public.lead_jobs;
create policy "lead_jobs_insert_own" on public.lead_jobs for insert with check (auth.uid() = user_id);

drop policy if exists "job_events_select_own_job" on public.job_events;
create policy "job_events_select_own_job" on public.job_events for select using (
  exists (
    select 1 from public.lead_jobs
    where lead_jobs.id = job_events.job_id
      and lead_jobs.user_id = auth.uid()
  )
);

drop policy if exists "payment_proofs_select_own" on public.payment_proofs;
create policy "payment_proofs_select_own" on public.payment_proofs for select using (auth.uid() = user_id);

drop policy if exists "payment_proofs_insert_own" on public.payment_proofs;
create policy "payment_proofs_insert_own" on public.payment_proofs for insert with check (auth.uid() = user_id);

drop policy if exists "lead_exports_select_own_job" on public.lead_exports;
create policy "lead_exports_select_own_job" on public.lead_exports for select using (
  exists (
    select 1 from public.lead_jobs
    where lead_jobs.id = lead_exports.job_id
      and lead_jobs.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values
  ('payment-proofs', 'payment-proofs', false),
  ('lead-exports', 'lead-exports', false)
on conflict (id) do nothing;

drop policy if exists "payment_proofs_storage_insert_own" on storage.objects;
create policy "payment_proofs_storage_insert_own" on storage.objects for insert with check (
  bucket_id = 'payment-proofs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "payment_proofs_storage_select_own" on storage.objects;
create policy "payment_proofs_storage_select_own" on storage.objects for select using (
  bucket_id = 'payment-proofs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "lead_exports_storage_select_own" on storage.objects;
create policy "lead_exports_storage_select_own" on storage.objects for select using (
  bucket_id = 'lead-exports'
  and exists (
    select 1
    from public.lead_exports
    join public.lead_jobs on lead_jobs.id = lead_exports.job_id
    where lead_exports.storage_path = storage.objects.name
      and lead_jobs.user_id = auth.uid()
  )
);
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_id_created_at_idx on public.chat_sessions(user_id, created_at desc);

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

alter table public.chat_sessions enable row level security;

drop policy if exists "chat_sessions_select_own" on public.chat_sessions;
create policy "chat_sessions_select_own" on public.chat_sessions for select using (auth.uid() = user_id);

drop policy if exists "chat_sessions_insert_own" on public.chat_sessions;
create policy "chat_sessions_insert_own" on public.chat_sessions for insert with check (auth.uid() = user_id);

drop policy if exists "chat_sessions_update_own" on public.chat_sessions;
create policy "chat_sessions_update_own" on public.chat_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
