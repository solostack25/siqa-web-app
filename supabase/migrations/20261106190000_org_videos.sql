-- Nonprofit profile videos.
--
-- These live ONLY on an organization's profile page. They are kept in their
-- own table (not public.videos) on purpose: every Gems / home / browse /
-- watch query reads public.videos, so org marketing videos can never leak
-- into the main content feed, even by a query that forgets a filter.
--
-- A video may optionally be attached to one of the org's own Seeds
-- (public.fundraisers); the profile then shows a "Support this Seed" button
-- under the player.

create table if not exists public.org_videos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  title            text not null check (length(trim(title)) between 1 and 140),
  description      text check (description is null or length(description) <= 2000),
  platform         text not null default 'bunny' check (platform in ('bunny', 'youtube')),
  video_url        text,                -- Bunny CDN url (platform = 'bunny')
  platform_video_id text,               -- YouTube id (platform = 'youtube')
  thumbnail_url    text,
  duration_secs    integer,
  fundraiser_id    uuid references public.fundraisers(id) on delete set null,
  is_published     boolean not null default true,
  sort_order       integer not null default 0,
  view_count       integer not null default 0,
  created_by       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint org_videos_source_check check (
    (platform = 'bunny'   and video_url is not null) or
    (platform = 'youtube' and platform_video_id is not null)
  )
);

comment on table public.org_videos is 'Nonprofit profile videos. Shown ONLY on the org profile page, never in Gems/home/browse (those read public.videos).';

create index if not exists org_videos_org on public.org_videos (org_id, is_published, sort_order, created_at desc);
create index if not exists org_videos_fundraiser on public.org_videos (fundraiser_id);

-- An attached Seed must belong to the same organization.
create or replace function public.org_videos_check_seed()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.fundraiser_id is not null and not exists (
    select 1 from fundraisers f where f.id = new.fundraiser_id and f.org_id = new.org_id
  ) then
    raise exception 'That Seed does not belong to this organization';
  end if;
  return new;
end;
$$;

drop trigger if exists org_videos_check_seed on public.org_videos;
create trigger org_videos_check_seed
  before insert or update on public.org_videos
  for each row execute function public.org_videos_check_seed();

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.org_videos enable row level security;

create or replace function public.can_manage_org(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations o where o.id = p_org_id and o.profile_id = auth.uid())
      or exists (select 1 from profiles p where p.id = auth.uid()
                  and lower(coalesce(p.role, '')) in ('admin', 'owner', 'moderator', 'super_admin'));
$$;
revoke all on function public.can_manage_org(uuid) from public;
grant execute on function public.can_manage_org(uuid) to anon, authenticated;

drop policy if exists org_videos_public_read on public.org_videos;
create policy org_videos_public_read on public.org_videos
  for select using (is_published or public.can_manage_org(org_id));

drop policy if exists org_videos_manage on public.org_videos;
create policy org_videos_manage on public.org_videos
  for all using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- Anyone can bump the view counter without write access to the row.
create or replace function public.org_video_viewed(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update org_videos set view_count = view_count + 1 where id = p_id and is_published;
$$;
revoke all on function public.org_video_viewed(uuid) from public;
grant execute on function public.org_video_viewed(uuid) to anon, authenticated;
