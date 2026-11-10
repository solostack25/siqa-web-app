-- Series and playlists.
--
-- series    — a creator's ordered set of episodes (a class, a tafsir run).
--             Belongs to a speaker's channel, or to a content org (org_id).
--             Holds the defaults the upload screen pre-fills for the next
--             episode: description, topics, cover, format, visibility, Seed.
-- videos.series_id / episode_number — which series a video is part of.
-- playlists — any signed-in person's own list of videos, private or public.

-- ── Series ──────────────────────────────────────────────────────────
create table if not exists public.series (
  id                    uuid primary key default gen_random_uuid(),
  speaker_id            uuid references public.speakers(id) on delete cascade,
  org_id                uuid references public.organizations(id) on delete cascade,
  title                 text not null check (length(trim(title)) between 1 and 120),
  description           text check (description is null or length(description) <= 5000),
  cover_url             text,
  default_topics        text[] not null default '{}',
  default_format        text check (default_format is null or default_format in ('short', 'long')),
  default_visibility    text check (default_visibility is null or default_visibility in ('public', 'followers')),
  default_fundraiser_id uuid references public.fundraisers(id) on delete set null,
  is_published          boolean not null default true,
  created_by            uuid default auth.uid() references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint series_owner check (speaker_id is not null or org_id is not null)
);

create index if not exists series_speaker on public.series (speaker_id, created_at desc);
create index if not exists series_org on public.series (org_id, created_at desc) where org_id is not null;

comment on table public.series is 'Ordered episodes from one channel (speaker) or content org. Stores upload defaults for the next episode.';

-- Speaker series: that speaker (or a Siqa admin). Org series: the org's
-- managers or any of its confirmed scholars.
create or replace function public.can_manage_series(p_speaker_id uuid, p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_siqa_admin()
    or (p_org_id is null and p_speaker_id is not null and public.owns_speaker(p_speaker_id))
    or (p_org_id is not null and (
          public.can_manage_org(p_org_id)
          or exists (
            select 1 from speaker_affiliations a
            where a.org_id = p_org_id and a.status = 'confirmed' and public.owns_speaker(a.speaker_id)
          )
       ));
$$;
revoke all on function public.can_manage_series(uuid, uuid) from public;
grant execute on function public.can_manage_series(uuid, uuid) to anon, authenticated;

create or replace function public.series_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists series_touch on public.series;
create trigger series_touch before update on public.series
  for each row execute function public.series_touch();

alter table public.series enable row level security;

drop policy if exists series_read on public.series;
create policy series_read on public.series
  for select using (is_published or public.can_manage_series(speaker_id, org_id));

drop policy if exists series_write on public.series;
create policy series_write on public.series
  for all using (public.can_manage_series(speaker_id, org_id))
  with check (public.can_manage_series(speaker_id, org_id));

-- ── Videos in a series ──────────────────────────────────────────────
alter table public.videos
  add column if not exists series_id uuid references public.series(id) on delete set null,
  add column if not exists episode_number integer check (episode_number is null or episode_number between 1 and 10000);

create index if not exists videos_series on public.videos (series_id, episode_number)
  where series_id is not null;

-- A video can only join a series from its own channel (or its org's).
create or replace function public.videos_guard_series()
returns trigger language plpgsql set search_path = public as $$
declare s record;
begin
  if new.series_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.series_id is not distinct from old.series_id
     and new.speaker_id is not distinct from old.speaker_id
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;
  if public.is_siqa_admin() or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  select speaker_id, org_id into s from series where id = new.series_id;
  if not found then raise exception 'Series not found'; end if;
  if s.org_id is not null then
    if new.org_id is distinct from s.org_id then
      raise exception 'Post this video under the organization to add it to that series';
    end if;
  elsif new.speaker_id is distinct from s.speaker_id then
    raise exception 'That series belongs to another channel';
  end if;
  return new;
end;
$$;

drop trigger if exists videos_guard_series on public.videos;
create trigger videos_guard_series
  before insert or update of series_id, speaker_id, org_id on public.videos
  for each row execute function public.videos_guard_series();

-- ── Playlists ───────────────────────────────────────────────────────
create table if not exists public.playlists (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 120),
  description  text check (description is null or length(description) <= 1000),
  visibility   text not null default 'private' check (visibility in ('private', 'public')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists playlists_profile on public.playlists (profile_id, updated_at desc);

create table if not exists public.playlist_items (
  playlist_id  uuid not null references public.playlists(id) on delete cascade,
  video_id     uuid not null references public.videos(id) on delete cascade,
  position     integer not null default 0,
  added_at     timestamptz not null default now(),
  primary key (playlist_id, video_id)
);
create index if not exists playlist_items_order on public.playlist_items (playlist_id, position, added_at);

drop trigger if exists playlists_touch on public.playlists;
create trigger playlists_touch before update on public.playlists
  for each row execute function public.series_touch();

-- Adding/removing a video bumps the playlist so "recent" sorts right.
create or replace function public.playlist_items_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update playlists set updated_at = now() where id = coalesce(new.playlist_id, old.playlist_id);
  return null;
end;
$$;
revoke all on function public.playlist_items_touch() from public, anon, authenticated;
drop trigger if exists playlist_items_touch on public.playlist_items;
create trigger playlist_items_touch after insert or delete on public.playlist_items
  for each row execute function public.playlist_items_touch();

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;

drop policy if exists playlists_read on public.playlists;
create policy playlists_read on public.playlists
  for select using (visibility = 'public' or profile_id = auth.uid());

drop policy if exists playlists_write on public.playlists;
create policy playlists_write on public.playlists
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists playlist_items_read on public.playlist_items;
create policy playlist_items_read on public.playlist_items
  for select using (exists (
    select 1 from playlists p where p.id = playlist_id and (p.visibility = 'public' or p.profile_id = auth.uid())
  ));

drop policy if exists playlist_items_write on public.playlist_items;
create policy playlist_items_write on public.playlist_items
  for all using (exists (select 1 from playlists p where p.id = playlist_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from playlists p where p.id = playlist_id and p.profile_id = auth.uid()));
