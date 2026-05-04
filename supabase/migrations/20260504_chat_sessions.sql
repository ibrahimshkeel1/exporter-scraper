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