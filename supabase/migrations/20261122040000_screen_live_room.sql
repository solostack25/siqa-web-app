-- Real-time khutbah on masjid TVs: a TV joins the live room itself (hidden, watch-only) instead of
-- playing the ~30-second-delayed HLS stream. The TV proves who it is with its device token.
-- (Applied to production 2026-11-22.)

-- The live room (if any) a masjid screen should show right now.
create or replace function public.screen_live_room(p_device_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('session_id', s.id, 'meeting_id', s.meeting_id, 'title', s.title, 'host_id', s.host_id)
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

-- masjid_live also says whether it's a live room (TVs can join it in real time) or a camera stream.
create or replace function public.masjid_live(p_org uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('watch_token', s.watch_token, 'title', s.title, 'playback_url', s.playback_url,
                           'started_at', coalesce(s.live_started_at, s.created_at),
                           'speaker_name', coalesce(sp.display_name, c.speaker_name, s.host_name),
                           'room', (s.camera_channel_id is null and s.meeting_id is not null))
  from studio.sessions s
  left join studio.camera_channels c on c.id = s.camera_channel_id
  left join public.speakers sp on sp.id = c.speaker_id
  where (c.masjid_org_id = p_org or s.masjid_org_id = p_org)
    and s.status = 'live' and s.playback_url is not null
    and coalesce(s.live_started_at, s.created_at) > now() - interval '6 hours'
  order by coalesce(s.live_started_at, s.created_at) desc
  limit 1;
$$;
grant execute on function public.masjid_live(uuid) to anon, authenticated;
