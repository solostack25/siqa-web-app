-- Any signed-in Siqa user can host a watch party (speakers keep the full live room).
-- One active party per person: starting a new one ends the old one.
-- (Applied to production 2026-11-22.)
create or replace function public.studio_party_create(p_video uuid, p_title text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_title text; r studio.sessions;
begin
  if auth.uid() is null then raise exception 'Sign in to start a watch party'; end if;
  select coalesce(nullif(trim(p_title), ''), 'Watch party · ' || v.title) into v_title
    from public.videos v where v.id = p_video and v.is_published;
  if v_title is null then raise exception 'Video not found'; end if;
  update studio.sessions set status = 'ended', ended_at = now()
   where host_id = auth.uid() and watch_video_id is not null and status <> 'ended';
  insert into studio.sessions (host_id, title, scheduled_at, guest_count, audience_on, watch_video_id, wp_playing, wp_position, wp_at, wp_phase)
  values (auth.uid(), left(v_title, 200), now(), 3, false, p_video, false, 0, now(), 'watching')
  returning * into r;
  return json_build_object('session_id', r.id, 'guest_token', r.guest_token, 'watch_token', r.watch_token, 'title', r.title);
end $$;
revoke all on function public.studio_party_create(uuid, text) from public, anon;
grant execute on function public.studio_party_create(uuid, text) to authenticated;

create or replace function public.studio_party_get(p_session uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('session_id', s.id, 'meeting_id', s.meeting_id, 'guest_token', s.guest_token, 'watch_token', s.watch_token,
                           'title', s.title, 'status', s.status)
  from studio.sessions s where s.id = p_session and s.host_id = auth.uid() and s.watch_video_id is not null;
$$;
revoke all on function public.studio_party_get(uuid) from public, anon;
grant execute on function public.studio_party_get(uuid) to authenticated;

create or replace function public.studio_party_live(p_session uuid, p_meeting text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update studio.sessions set meeting_id = coalesce(meeting_id, p_meeting), status = 'live', live_started_at = coalesce(live_started_at, now())
   where id = p_session and host_id = auth.uid() and watch_video_id is not null;
  if not found then raise exception 'not allowed'; end if;
end $$;
revoke all on function public.studio_party_live(uuid, text) from public, anon;
grant execute on function public.studio_party_live(uuid, text) to authenticated;

create or replace function public.studio_party_end(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update studio.sessions set status = 'ended', ended_at = now(), wp_playing = false
   where id = p_session and host_id = auth.uid() and watch_video_id is not null;
end $$;
revoke all on function public.studio_party_end(uuid) from public, anon;
grant execute on function public.studio_party_end(uuid) to authenticated;

-- Masjid TVs joining a watch party also need its watch token (for the synced video).
create or replace function public.screen_live_room(p_device_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('session_id', s.id, 'meeting_id', s.meeting_id, 'title', s.title, 'host_id', s.host_id,
                           'watch_token', s.watch_token, 'watch_party', (s.watch_video_id is not null))
  from public.masjid_screens v
  join studio.sessions s on s.masjid_org_id = v.org_id
  where v.device_token = p_device_token and v.mode = 'masjid' and v.paired_at is not null and v.show_live
    and s.status = 'live' and s.meeting_id is not null and s.camera_channel_id is null
    and coalesce(s.live_started_at, s.created_at) > now() - interval '6 hours'
  order by coalesce(s.live_started_at, s.created_at) desc
  limit 1;
$$;
revoke all on function public.screen_live_room(text) from public;
grant execute on function public.screen_live_room(text) to anon, authenticated;

-- Switching phase without a position keeps the video where it actually is.
create or replace function public.studio_watchparty_control(p_session uuid, p_playing boolean, p_position double precision, p_phase text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from studio.sessions s where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff())) then
    raise exception 'not allowed';
  end if;
  update studio.sessions
     set wp_position = greatest(coalesce(p_position,
           wp_position + case when wp_playing and wp_at is not null then extract(epoch from now() - wp_at) else 0 end), 0),
         wp_playing = coalesce(p_playing, wp_playing),
         wp_at = now(),
         wp_phase = coalesce(p_phase, wp_phase)
   where id = p_session;
end $$;
