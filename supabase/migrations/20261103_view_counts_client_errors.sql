-- 1) View counts: one safe function the app calls when a Gem is watched.
-- 2) client_errors: app crashes/errors land here so you see launch-day breakage.
--
-- Run once in the Supabase SQL editor (project eixlmylbqqrfazjlgxcz).
-- Requires 20261103_report_block_moderation.sql (for is_siqa_admin()).
-- Safe to run more than once.

-- ── View counts ────────────────────────────────────────────────────────
create or replace function public.increment_video_view(p_video_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.videos
    set view_count = coalesce(view_count, 0) + 1
    where id = p_video_id and is_published = true;
$$;

revoke all on function public.increment_video_view(uuid) from public;
grant execute on function public.increment_video_view(uuid) to anon, authenticated;

-- ── Client error log ───────────────────────────────────────────────────
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  platform text,
  app_version text,
  route text,
  source text,
  message text not null check (char_length(message) <= 2000),
  stack text check (stack is null or char_length(stack) <= 8000),
  extra jsonb
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Anyone using the app (signed in or not) can log an error; only admins can read.
drop policy if exists "client_errors_insert" on public.client_errors;
create policy "client_errors_insert" on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "client_errors_admin_read" on public.client_errors;
create policy "client_errors_admin_read" on public.client_errors
  for select to authenticated
  using (public.is_siqa_admin());

drop policy if exists "client_errors_admin_delete" on public.client_errors;
create policy "client_errors_admin_delete" on public.client_errors
  for delete to authenticated
  using (public.is_siqa_admin());
