create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  email text not null,
  display_name text,
  from_name text,
  reply_to text,
  status text not null default 'active',
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  smtp_host text,
  smtp_port integer,
  smtp_secure boolean,
  smtp_username text,
  smtp_password_encrypted text,
  imap_host text,
  imap_port integer,
  imap_secure boolean,
  imap_username text,
  imap_password_encrypted text,
  imap_mailbox text not null default 'INBOX',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_connections_provider_check check (provider in ('google', 'smtp')),
  constraint email_connections_status_check check (status in ('active', 'error', 'revoked'))
);

alter table public.outreach_campaigns
  add column if not exists email_connection_id uuid references public.email_connections(id) on delete set null;

create index if not exists email_connections_user_id_created_at_idx
  on public.email_connections(user_id, created_at desc);

create unique index if not exists email_connections_user_provider_email_idx
  on public.email_connections(user_id, provider, lower(email));

create index if not exists outreach_campaigns_email_connection_id_idx
  on public.outreach_campaigns(email_connection_id);

drop trigger if exists set_email_connections_updated_at on public.email_connections;
create trigger set_email_connections_updated_at
before update on public.email_connections
for each row execute function public.set_updated_at();

alter table public.email_connections enable row level security;

-- Email tokens and SMTP passwords are intentionally exposed only through server API routes.
-- The service role used by those routes bypasses RLS; browser clients should not select this table directly.
