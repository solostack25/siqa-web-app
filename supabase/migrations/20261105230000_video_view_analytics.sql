-- Speaker Studio analytics.
--
-- 1. video_view_events: one row per counted view, so views can be charted
--    over time. Clients can't touch the table directly; views come in only
--    through increment_video_view(), and speakers read aggregates of their
--    own videos only through the studio_* functions below.
-- 2. increment_video_view(video, session): was defined but never called by
--    the app, so Siqa-hosted videos all sat at 0 views. Now logs an event,
--    skips the speaker's own views, de-dupes the same viewer on the same
--    video for 30 minutes, and caps any one viewer at 200 views/hour.
-- 3. comments.comment_count: three triggers fought over it, and since the
--    publishing lockdown guard_videos() reset any counter change made as a
--    normal user, so counts stopped updating. Keep one recount trigger,
--    run it as SECURITY DEFINER, and backfill.

-- ── 1. View events ───────────────────────────────────────────────────
create table if not exists public.video_view_events (
  id          bigint generated always as identity primary key,
  video_id    uuid not null references public.videos(id) on delete cascade,
  speaker_id  uuid references public.speakers(id) on delete cascade,
  viewer_id   uuid references auth.users(id) on delete set null,
  session_key text,
  created_at  timestamptz not null default now()
);

create index if not exists video_view_events_speaker_time on public.video_view_events (speaker_id, created_at);
create index if not exists video_view_events_video_time   on public.video_view_events (video_id, created_at);
create index if not exists video_view_events_viewer_recent on public.video_view_events (viewer_id, created_at) where viewer_id is not null;
create index if not exists video_view_events_session_recent on public.video_view_events (session_key, created_at) where session_key is not null;

alter table public.video_view_events enable row level security;
-- No policies on purpose: no direct client reads or writes.
revoke all on table public.video_view_events from anon, authenticated;

-- ── 2. Recording a view ──────────────────────────────────────────────
drop function if exists public.increment_video_view(uuid);

create or replace function public.increment_video_view(p_video_id uuid, p_session text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_speaker uuid;
  v_uid     uuid := auth.uid();
  v_key     text := nullif(left(coalesce(p_session, ''), 64), '');
begin
  if v_uid is null and v_key is null then
    return false;
  end if;

  select speaker_id into v_speaker
    from videos
   where id = p_video_id
     and is_published = true
     and coalesce(published_at, now()) <= now();
  if not found then
    return false;
  end if;

  -- A speaker watching their own video isn't a view.
  if v_uid is not null and exists (
    select 1 from speakers where id = v_speaker and profile_id = v_uid
  ) then
    return false;
  end if;

  -- Same viewer, same video, within 30 minutes → already counted.
  if exists (
    select 1 from video_view_events e
     where e.video_id = p_video_id
       and e.created_at > now() - interval '30 minutes'
       and ((v_uid is not null and e.viewer_id = v_uid)
         or (v_uid is null and e.viewer_id is null and e.session_key = v_key))
  ) then
    return false;
  end if;

  -- Basic flood control per viewer.
  if (
    select count(*) from video_view_events e
     where e.created_at > now() - interval '1 hour'
       and ((v_uid is not null and e.viewer_id = v_uid)
         or (v_uid is null and e.viewer_id is null and e.session_key = v_key))
  ) >= 200 then
    return false;
  end if;

  insert into video_view_events (video_id, speaker_id, viewer_id, session_key)
  values (p_video_id, v_speaker, v_uid, v_key);

  update videos set view_count = coalesce(view_count, 0) + 1 where id = p_video_id;
  return true;
end
$$;

revoke all on function public.increment_video_view(uuid, text) from public;
grant execute on function public.increment_video_view(uuid, text) to anon, authenticated;

-- ── 3. Studio read functions (caller's own speaker profile only) ─────
-- Daily view counts in the viewer's time zone; the client groups days
-- into weeks/months as needed.
create or replace function public.studio_daily_views(p_from timestamptz, p_tz text default 'UTC')
returns table (day date, views bigint)
language sql
stable
security definer
set search_path = public
as $$
  select (e.created_at at time zone coalesce(nullif(p_tz, ''), 'UTC'))::date as day,
         count(*)::bigint as views
    from video_view_events e
    join speakers s on s.id = e.speaker_id
   where s.profile_id = auth.uid()
     and e.created_at >= p_from
   group by 1
   order by 1;
$$;

-- Views per video within a window (top videos for the period).
create or replace function public.studio_video_views(p_from timestamptz, p_to timestamptz default now())
returns table (video_id uuid, views bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.video_id, count(*)::bigint as views
    from video_view_events e
    join speakers s on s.id = e.speaker_id
   where s.profile_id = auth.uid()
     and e.created_at >= p_from
     and e.created_at < p_to
   group by e.video_id;
$$;

revoke all on function public.studio_daily_views(timestamptz, text) from public, anon;
revoke all on function public.studio_video_views(timestamptz, timestamptz) from public, anon;
grant execute on function public.studio_daily_views(timestamptz, text) to authenticated;
grant execute on function public.studio_video_views(timestamptz, timestamptz) to authenticated;

-- ── 4. Comment counts ────────────────────────────────────────────────
drop trigger if exists on_comment_change on public.comments;
drop trigger if exists video_comment_count_trigger on public.comments;

create or replace function public.sync_video_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.video_id else new.video_id end;
begin
  update videos
     set comment_count = (select count(*) from comments where video_id = v_id)
   where id = v_id;
  return null;
end
$$;

drop trigger if exists trg_sync_comment_count on public.comments;
create trigger trg_sync_comment_count
  after insert or delete on public.comments
  for each row execute function public.sync_video_comment_count();

update public.videos v
   set comment_count = sub.n
  from (select v2.id, count(c.id) as n
          from public.videos v2
          left join public.comments c on c.video_id = v2.id
         group by v2.id) sub
 where sub.id = v.id
   and coalesce(v.comment_count, -1) <> sub.n;
