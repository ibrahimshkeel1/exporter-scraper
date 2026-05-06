create table if not exists public.user_dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_dashboard_layouts_user_id_idx on public.user_dashboard_layouts(user_id);

drop trigger if exists set_user_dashboard_layouts_updated_at on public.user_dashboard_layouts;
create trigger set_user_dashboard_layouts_updated_at
before update on public.user_dashboard_layouts
for each row execute function public.set_updated_at();

alter table public.user_dashboard_layouts enable row level security;

drop policy if exists "user_dashboard_layouts_select_own" on public.user_dashboard_layouts;
create policy "user_dashboard_layouts_select_own" on public.user_dashboard_layouts for select using (auth.uid() = user_id);

drop policy if exists "user_dashboard_layouts_insert_own" on public.user_dashboard_layouts;
create policy "user_dashboard_layouts_insert_own" on public.user_dashboard_layouts for insert with check (auth.uid() = user_id);

drop policy if exists "user_dashboard_layouts_update_own" on public.user_dashboard_layouts;
create policy "user_dashboard_layouts_update_own" on public.user_dashboard_layouts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_dashboard_layouts_delete_own" on public.user_dashboard_layouts;
create policy "user_dashboard_layouts_delete_own" on public.user_dashboard_layouts for delete using (auth.uid() = user_id);
