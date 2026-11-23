-- Step 5: masjid camera autopilot.
-- A masjid owns its camera. When it starts streaming, Siqa looks at the masjid's schedule for the live program on now
-- (Friday's khutbah first): titles the live from it, credits its imam, switches the masjid's TVs, and when it ends
-- posts it to the imam's page and the masjid's page.

-- 1. Masjid admins manage their masjid's camera
create or replace function studio.camera_mine(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.studio_is_staff() or exists (
    select 1 from studio.camera_channels c left join public.speakers s on s.id = c.speaker_id
    where c.id = p_channel
      and (c.owner_id = auth.uid() or s.profile_id = auth.uid()
           or (c.masjid_org_id is not null and public.is_masjid_admin(c.masjid_org_id, 'admin'))));
$$;

-- 2. Create a camera for a masjid (speakers keep using studio_camera_create, unchanged)
create or replace function public.studio_camera_create_masjid(p_masjid uuid, p_title text, p_uid text, p_rtmps text, p_rtmp text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_masjid text;
begin
  if not public.is_masjid_admin(p_masjid, 'admin') then raise exception 'Only the masjid''s owner or admins can set up its camera.'; end if;
  select org_name into v_masjid from public.organizations where id = p_masjid and org_kind = 'masjid';
  if v_masjid is null then raise exception 'Masjid not found'; end if;
  if exists (select 1 from studio.camera_channels where masjid_org_id = p_masjid and speaker_id is null) then
    raise exception 'This masjid already has a camera.';
  end if;
  insert into studio.camera_channels (owner_id, title, speaker_name, cf_input_uid, rtmps_url, rtmp_url, stream_key, masjid_org_id, masjid_name, auto_post)
  values (auth.uid(), coalesce(nullif(trim(p_title),''), 'Jumu''ah khutbah'), null, p_uid, p_rtmps, p_rtmp, p_key, p_masjid, v_masjid, true)
  returning id into v_id;
  return v_id;
end $$;

-- 3. The masjid's live program on right now (from 30 min before to 30 min after its end). Khutbahs first.
create or replace function public.masjid_program_now(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.masjid_events e
  cross join lateral (select public.masjid_event_next(e.id) as at) n
  where e.org_id = p_org and e.live_on_siqa and n.at is not null and n.at <= now() + interval '30 minutes'
  order by (e.kind = 'khutbah') desc, abs(extract(epoch from (n.at - now()))) limit 1;
$$;

-- 4. Camera went live: a masjid camera takes its title and imam from the schedule
create or replace function public.studio_camera_live(p_secret text, p_channel uuid, p_live boolean, p_status text, p_playback_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c studio.camera_channels; v_s studio.sessions; v_started boolean := false; e public.masjid_events; v_sp uuid; v_name text; v_tz text; v_title text;
begin
  if not studio.camera_ok(p_secret) then raise exception 'not allowed'; end if;
  update studio.camera_channels set cf_status = p_status, checked_at = now() where id = p_channel returning * into c;
  if c.id is null then return null; end if;
  select * into v_s from studio.sessions where camera_channel_id = c.id and status = 'live' order by live_started_at desc limit 1;
  if p_live then
    if v_s.id is null then
      update studio.sessions set status = 'live', ended_at = null
        where id = (select id from studio.sessions where camera_channel_id = c.id and status = 'ended'
                    and ended_at > now() - interval '10 minutes' order by ended_at desc limit 1)
        returning * into v_s;
    end if;
    if v_s.id is null then
      v_tz := coalesce((select timezone from public.masjid_settings where org_id = c.masjid_org_id), 'America/Chicago');
      if c.masjid_org_id is not null then
        select * into e from public.masjid_events where id = public.masjid_program_now(c.masjid_org_id);
      end if;
      v_sp := coalesce(e.speaker_id, c.speaker_id);
      select display_name into v_name from public.speakers where id = v_sp;
      v_title := coalesce(c.next_title, coalesce(e.title, c.title) || ' · ' || to_char(now() at time zone v_tz, 'Mon FMDD, YYYY'));
      insert into studio.sessions (host_id, title, scheduled_at, guest_count, audience_on, status, live_started_at,
                                   playback_url, host_name, series_id, source, camera_channel_id, masjid_org_id, speaker_id, masjid_event_id)
      values (c.owner_id, v_title, now(), 0, true, 'live', now(), p_playback_url, coalesce(v_name, c.speaker_name, c.masjid_name),
              c.series_id, 'camera', c.id, c.masjid_org_id, v_sp, e.id)
      returning * into v_s;
      v_started := true;
    elsif p_playback_url is not null and v_s.playback_url is distinct from p_playback_url then
      update studio.sessions set playback_url = p_playback_url where id = v_s.id returning * into v_s;
    end if;
  elsif v_s.id is not null then
    update studio.sessions set status = 'ended', ended_at = now() where id = v_s.id returning * into v_s;
  end if;
  return jsonb_build_object('session_id', v_s.id, 'watch_token', v_s.watch_token, 'title', v_s.title,
    'host_name', v_s.host_name, 'status', v_s.status, 'started', v_started);
end $$;

-- 5. Ready to post: a speaker on the camera, or an imam from the schedule
create or replace function public.studio_camera_to_post(p_secret text)
returns table(recording_id uuid, bunny_video_id text, duration_seconds integer, speaker_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not studio.camera_ok(p_secret) then raise exception 'not allowed'; end if;
  return query select r.id, r.bunny_video_id, r.duration_seconds, coalesce(sp.display_name, c.speaker_name)
    from studio.camera_imports i join studio.recordings r on r.id = i.recording_id join studio.camera_channels c on c.id = i.channel_id
    left join studio.sessions s on s.id = i.session_id
    left join public.speakers sp on sp.id = coalesce(s.speaker_id, c.speaker_id)
    where i.video_id is null and r.status = 'ready' and coalesce(s.speaker_id, c.speaker_id) is not null;
end $$;

-- 6. Post: as the imam from the schedule (or the camera's speaker), titled from the live, to both pages
create or replace function public.studio_camera_post(p_secret text, p_recording uuid, p_video_url text, p_thumbnail text, p_platform_id text, p_seconds integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i studio.camera_imports; c studio.camera_channels; r studio.recordings; s studio.sessions; sp public.speakers; o public.organizations;
        v_id uuid; v_pub boolean; v_desc text; v_kind text;
begin
  if not studio.camera_ok(p_secret) then raise exception 'not allowed'; end if;
  select * into i from studio.camera_imports where recording_id = p_recording;
  if i.video_id is not null then return i.video_id; end if;
  select * into c from studio.camera_channels where id = i.channel_id;
  select * into r from studio.recordings where id = p_recording;
  select * into s from studio.sessions where id = i.session_id;
  select * into sp from public.speakers where id = coalesce(s.speaker_id, c.speaker_id);
  if sp.id is null then return null; end if;
  select * into o from public.organizations where id = coalesce(s.masjid_org_id, c.masjid_org_id);
  select kind into v_kind from public.masjid_events where id = s.masjid_event_id;
  v_pub := c.auto_post and sp.approval_status = 'approved' and coalesce(sp.is_verified, false);
  v_desc := coalesce(c.next_description, coalesce(c.next_title, s.title, r.title));
  if o.id is not null then
    v_desc := v_desc || E'\n\nRecorded at ' || o.org_name || coalesce(', ' || nullif(o.city, ''), '') || coalesce(', ' || nullif(o.state, ''), '') || '.';
  end if;
  insert into public.videos (speaker_id, org_id, title, description, video_url, thumbnail_url, duration_secs, category, topics,
                             is_published, published_at, platform, platform_video_id, format, status, show_watermark)
  values (sp.id, o.id, coalesce(c.next_title, s.title, r.title), v_desc,
          p_video_url, coalesce(c.next_cover_url, p_thumbnail), coalesce(p_seconds, r.duration_seconds),
          case when v_kind is null or v_kind = 'khutbah' then 'Khutbah' else 'Islamic Education' end,
          case when v_kind is null or v_kind = 'khutbah' then array['Khutbah'] else array[initcap(v_kind)] end,
          v_pub, case when v_pub then now() end, 'bunny', p_platform_id, 'long', case when v_pub then 'published' end,
          coalesce(sp.watermark_on, true))
  returning id into v_id;
  update studio.camera_imports set video_id = v_id, state = 'posted', updated_at = now() where recording_id = p_recording;
  update studio.recordings set published_video_id = v_id, speaker_id = sp.id, updated_at = now() where id = p_recording;
  update studio.camera_channels set next_title = null, next_description = null, next_cover_url = null where id = c.id;
  return v_id;
end $$;

-- 7. The masjid's camera, for its dashboard
create or replace function public.masjid_camera(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_masjid_admin(p_org, 'editor') then raise exception 'not allowed'; end if;
  select jsonb_build_object('id', c.id, 'title', c.title, 'rtmps_url', c.rtmps_url, 'rtmp_url', c.rtmp_url,
      'stream_key', case when public.is_masjid_admin(p_org, 'admin') then c.stream_key end,
      'cf_status', c.cf_status, 'checked_at', c.checked_at, 'auto_post', c.auto_post,
      'live', (select jsonb_build_object('title', s.title, 'speaker', s.host_name, 'watch_token', s.watch_token, 'started_at', s.live_started_at)
               from studio.sessions s where s.camera_channel_id = c.id and s.status = 'live' order by s.live_started_at desc limit 1),
      'last', (select jsonb_build_object('title', v.title, 'id', v.id, 'published', v.is_published, 'at', i.updated_at)
               from studio.camera_imports i join public.videos v on v.id = i.video_id where i.channel_id = c.id order by i.updated_at desc limit 1),
      'now_program', (select jsonb_build_object('title', e.title, 'speaker', sp.display_name)
               from public.masjid_events e left join public.speakers sp on sp.id = e.speaker_id where e.id = public.masjid_program_now(p_org)))
    into v
  from studio.camera_channels c where c.masjid_org_id = p_org and c.speaker_id is null order by c.created_at limit 1;
  return v;
end $$;

revoke all on function public.masjid_program_now(uuid), public.masjid_camera(uuid), public.studio_camera_create_masjid(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.masjid_program_now(uuid), public.masjid_camera(uuid), public.studio_camera_create_masjid(uuid, text, text, text, text, text) to authenticated;
