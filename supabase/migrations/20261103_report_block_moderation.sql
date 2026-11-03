-- Launch safety: report anything, block users, and let admins remove reported content.
-- Apple App Review guideline 1.2 requires all three for apps with user content.
--
-- Run this once in the Supabase SQL editor (project eixlmylbqqrfazjlgxcz)
-- BEFORE shipping the app build that uses it. Safe to run more than once.

-- ── Admin check ────────────────────────────────────────────────────────
create or replace function public.is_siqa_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and lower(coalesce(role, '')) in ('admin', 'owner', 'moderator', 'super_admin')
  );
$$;

-- ── content_reports: report any kind of content, not just Gems ─────────
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid,
  profile_id uuid references auth.users(id) on delete set null,
  reason text,
  status text default 'open',
  created_at timestamptz default now()
);

alter table public.content_reports
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists reported_user_id uuid,
  add column if not exists details text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid;

-- Older rows were all Gem reports.
update public.content_reports
  set target_type = 'video', target_id = video_id
  where target_type is null and video_id is not null;

create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists "reports_insert_own" on public.content_reports;
create policy "reports_insert_own" on public.content_reports
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "reports_admin_read" on public.content_reports;
create policy "reports_admin_read" on public.content_reports
  for select to authenticated
  using (public.is_siqa_admin() or profile_id = auth.uid());

drop policy if exists "reports_admin_update" on public.content_reports;
create policy "reports_admin_update" on public.content_reports
  for update to authenticated
  using (public.is_siqa_admin())
  with check (public.is_siqa_admin());

-- ── user_blocks ────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists "blocks_own_read" on public.user_blocks;
create policy "blocks_own_read" on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "blocks_own_insert" on public.user_blocks;
create policy "blocks_own_insert" on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists "blocks_own_delete" on public.user_blocks;
create policy "blocks_own_delete" on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- ── Stop blocked users from messaging each other (server-side) ─────────
create or replace function public.prevent_blocked_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_seller_user uuid;
  v_other uuid;
begin
  select t.buyer_id, s.user_id into v_buyer, v_seller_user
  from public.marketplace_threads t
  left join public.marketplace_sellers s on s.id = t.seller_id
  where t.id = new.thread_id;

  v_other := case when new.sender_id = v_buyer then v_seller_user else v_buyer end;

  if v_other is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = v_other and blocked_id = new.sender_id)
       or (blocker_id = new.sender_id and blocked_id = v_other)
  ) then
    raise exception 'You can''t message this user.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_blocked_messages on public.marketplace_messages;
create trigger trg_prevent_blocked_messages
  before insert on public.marketplace_messages
  for each row execute function public.prevent_blocked_messages();

-- ── Admin: remove reported content in one step ─────────────────────────
-- Gems are unpublished, listings archived, comments/messages blanked
-- (blanked rather than deleted so replies and reactions don't break).
create or replace function public.admin_remove_reported_content(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.content_reports%rowtype;
  v_type text;
  v_target uuid;
begin
  if not public.is_siqa_admin() then
    raise exception 'Not allowed';
  end if;

  select * into r from public.content_reports where id = p_report_id;
  if not found then
    raise exception 'Report not found';
  end if;

  v_type := coalesce(r.target_type, case when r.video_id is not null then 'video' end);
  v_target := coalesce(r.target_id, r.video_id);

  if v_type = 'video' then
    update public.videos set is_published = false, status = 'rejected' where id = v_target;
  elsif v_type = 'comment' then
    update public.comments set body = '[Removed by a moderator]' where id = v_target;
  elsif v_type = 'listing' then
    update public.marketplace_products set status = 'archived' where id = v_target;
  elsif v_type = 'message' then
    update public.marketplace_messages set body = '[Removed by a moderator]' where id = v_target;
  elsif v_type = 'conversation' then
    -- Whole conversation reported: blank the reported user's messages in it.
    update public.marketplace_messages set body = '[Removed by a moderator]'
      where thread_id = v_target and sender_id = r.reported_user_id;
  else
    raise exception 'Unknown content type: %', v_type;
  end if;

  -- Close every open report about the same thing.
  update public.content_reports
    set status = 'removed', resolved_at = now(), resolved_by = auth.uid()
    where coalesce(target_id, video_id) = v_target
      and coalesce(status, 'open') in ('open', 'pending');

  return v_type;
end;
$$;

revoke all on function public.admin_remove_reported_content(uuid) from public, anon;
grant execute on function public.admin_remove_reported_content(uuid) to authenticated;
