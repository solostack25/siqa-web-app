-- Watch parties: watch a Gems lecture together in a Siqa Studio room, in sync, with chat,
-- then discuss it on camera. The host controls playback; everyone (and masjid TVs) follows.
-- Also: masjids can play a Gems lecture on all their TV screens ("Play on screens").
-- (Applied to production 2026-11-22.)

alter table studio.sessions
  add column if not exists watch_video_id uuid references public.videos(id) on delete set null,
  add column if not exists wp_playing boolean not null default false,
  add column if not exists wp_position double precision not null default 0,
  add column if not exists wp_at timestamptz,
  add column if not exists wp_phase text not null default 'watching' check (wp_phase in ('watching', 'discussing'));

-- Host picks the video for their session.
create or replace function public.studio_session_set_watch(p_session uuid, p_video uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from studio.sessions s where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff())) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.videos v where v.id = p_video and v.is_published) then
    raise exception 'Video not found';
  end if;
  update studio.sessions set watch_video_id = p_video, wp_playing = false, wp_position = 0, wp_at = now(), wp_phase = 'watching'
   where id = p_session;
end $$;
revoke all on function public.studio_session_set_watch(uuid, uuid) from public, anon;
grant execute on function public.studio_session_set_watch(uuid, uuid) to authenticated;

-- Host: play / pause / seek / switch to discussion. Position is in seconds at the moment of the call.
create or replace function public.studio_watchparty_control(p_session uuid, p_playing boolean, p_position double precision, p_phase text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from studio.sessions s where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff())) then
    raise exception 'not allowed';
  end if;
  update studio.sessions
     set wp_playing = coalesce(p_playing, wp_playing),
         wp_position = greatest(coalesce(p_position, wp_position), 0),
         wp_at = now(),
         wp_phase = coalesce(p_phase, wp_phase)
   where id = p_session;
end $$;
revoke all on function public.studio_watchparty_control(uuid, boolean, double precision, text) from public, anon;
grant execute on function public.studio_watchparty_control(uuid, boolean, double precision, text) to authenticated;

-- Everyone in the party (by the watch link or the invite link) and masjid TVs read the shared state.
-- server_now lets each player correct for its own clock.
create or replace function public.studio_watchparty_state(p_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'session_id', s.id, 'status', s.status, 'title', s.title,
    'playing', s.wp_playing, 'position', s.wp_position, 'at', s.wp_at, 'phase', s.wp_phase,
    'server_now', now(),
    'video', json_build_object('id', v.id, 'title', v.title, 'platform', v.platform, 'platform_video_id', v.platform_video_id,
                               'video_url', v.video_url, 'thumbnail_url', v.thumbnail_url, 'duration_secs', v.duration_secs,
                               'speaker_name', sp.display_name))
  from studio.sessions s
  join public.videos v on v.id = s.watch_video_id
  left join public.speakers sp on sp.id = v.speaker_id
  where (s.watch_token = p_token or s.guest_token = p_token)
  limit 1;
$$;
grant execute on function public.studio_watchparty_state(text) to anon, authenticated;

-- ── Play on screens ─────────────────────────────────────────────────────
alter table public.masjid_settings
  add column if not exists now_playing_video_id uuid references public.videos(id) on delete set null,
  add column if not exists now_playing_started_at timestamptz;

create or replace function public.masjid_play_video(p_org uuid, p_video uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org, 'editor') then raise exception 'not allowed'; end if;
  if p_video is not null and not exists (select 1 from public.videos v where v.id = p_video and v.is_published) then
    raise exception 'Video not found';
  end if;
  insert into public.masjid_settings (org_id, now_playing_video_id, now_playing_started_at)
  values (p_org, p_video, case when p_video is null then null else now() end)
  on conflict (org_id) do update
    set now_playing_video_id = excluded.now_playing_video_id, now_playing_started_at = excluded.now_playing_started_at;
end $$;
revoke all on function public.masjid_play_video(uuid, uuid) from public, anon;
grant execute on function public.masjid_play_video(uuid, uuid) to authenticated;

-- What a masjid TV should be playing now (null when nothing, or once the video has run its length).
create or replace function public.screen_now_playing(p_device_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('video_id', v.id, 'title', v.title, 'platform', v.platform, 'platform_video_id', v.platform_video_id,
                           'video_url', v.video_url, 'duration_secs', v.duration_secs, 'speaker_name', sp.display_name,
                           'started_at', ms.now_playing_started_at, 'server_now', now())
  from public.masjid_screens sc
  join public.masjid_settings ms on ms.org_id = sc.org_id
  join public.videos v on v.id = ms.now_playing_video_id
  left join public.speakers sp on sp.id = v.speaker_id
  where sc.device_token = p_device_token and sc.mode = 'masjid'
    and ms.now_playing_started_at is not null
    and ms.now_playing_started_at + make_interval(secs => coalesce(v.duration_secs, 3 * 3600) + 30) > now();
$$;
grant execute on function public.screen_now_playing(text) to anon, authenticated;

-- What the masjid admin sees playing.
create or replace function public.masjid_now_playing(p_org uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('video_id', v.id, 'title', v.title, 'started_at', ms.now_playing_started_at, 'duration_secs', v.duration_secs)
  from public.masjid_settings ms join public.videos v on v.id = ms.now_playing_video_id
  where ms.org_id = p_org and ms.now_playing_started_at is not null
    and ms.now_playing_started_at + make_interval(secs => coalesce(v.duration_secs, 3 * 3600) + 30) > now();
$$;
grant execute on function public.masjid_now_playing(uuid) to authenticated;

-- Masjid TVs also switch to a watch party tied to the masjid (it has no HLS stream; TVs join the room).
create or replace function public.masjid_live(p_org uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('watch_token', s.watch_token, 'title', s.title, 'playback_url', s.playback_url,
                           'started_at', coalesce(s.live_started_at, s.created_at),
                           'speaker_name', coalesce(sp.display_name, c.speaker_name, s.host_name),
                           'room', (s.camera_channel_id is null and s.meeting_id is not null),
                           'watch_party', (s.watch_video_id is not null))
  from studio.sessions s
  left join studio.camera_channels c on c.id = s.camera_channel_id
  left join public.speakers sp on sp.id = c.speaker_id
  where (c.masjid_org_id = p_org or s.masjid_org_id = p_org)
    and s.status = 'live'
    and (s.playback_url is not null or (s.watch_video_id is not null and s.meeting_id is not null))
    and coalesce(s.live_started_at, s.created_at) > now() - interval '6 hours'
  order by coalesce(s.live_started_at, s.created_at) desc
  limit 1;
$$;
grant execute on function public.masjid_live(uuid) to anon, authenticated;
