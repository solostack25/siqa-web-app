-- Step 4: the Siqa signature (Siqa + masjid + imam marks) and posting masjid lives to both pages.

-- 1. A masjid's watermark (uploaded at onboarding or in its dashboard)
alter table public.organizations add column if not exists watermark_url text;

create or replace function public.masjid_set_watermark(p_org uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org, 'admin') then raise exception 'Only the masjid''s owner or admins can change its watermark.'; end if;
  if p_url is not null and p_url !~ '^https://eixlmylbqqrfazjlgxcz\.supabase\.co/storage/v1/object/public/' then
    raise exception 'Upload the image through Siqa.';
  end if;
  update public.organizations set watermark_url = p_url, updated_at = now() where id = p_org;
end $$;

-- 2. What goes in a live's signature: the imam's watermark (if on) and the masjid's
create or replace function public.studio_signature_context(p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'speaker_id', s.speaker_id,
    'speaker_wm', case when coalesce(sp.watermark_on, true) then sp.watermark_url end,
    'masjid_id', s.masjid_org_id,
    'masjid_name', o.org_name,
    'masjid_wm', o.watermark_url)
  from studio.sessions s
  left join public.speakers sp on sp.id = coalesce(s.speaker_id, (select x.id from public.speakers x where x.profile_id = s.host_id and x.approval_status = 'approved' limit 1))
  left join public.organizations o on o.id = s.masjid_org_id
  where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff());
$$;

-- 3. Publish a Studio recording. Posts as the imam the live was for (set and checked when it went live),
--    tags the masjid so it shows on the masjid's page too, and adds where it was recorded to the description.
create or replace function public.studio_publish_recording(p_recording uuid, p_payload jsonb, p_speaker uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r studio.recordings; s studio.sessions; v_staff boolean := public.studio_is_staff(); v_my uuid; v_sp uuid; v_org uuid;
        o public.organizations; v_desc text; v_id uuid;
begin
  select * into r from studio.recordings where id = p_recording;
  if r.id is null then raise exception 'Recording not found'; end if;
  if not (v_staff or r.owner_id = auth.uid()) then raise exception 'not allowed'; end if;
  select * into s from studio.sessions where imported_recording_id = p_recording order by created_at desc limit 1;
  select id into v_my from public.speakers where profile_id = auth.uid() and approval_status = 'approved' limit 1;

  v_sp := case when v_staff and p_speaker is not null then p_speaker else coalesce(s.speaker_id, v_my) end;
  if v_sp is null then raise exception 'Choose which speaker this posts as.'; end if;
  if v_sp is distinct from v_my and not v_staff and not (s.id is not null and s.host_id = auth.uid() and s.speaker_id = v_sp) then
    raise exception 'not allowed';
  end if;

  v_org := s.masjid_org_id;
  v_desc := coalesce(nullif(trim(p_payload->>'description'), ''), r.title);
  if v_org is not null then
    select * into o from public.organizations where id = v_org;
    v_desc := v_desc || E'\n\nRecorded at ' || o.org_name || coalesce(', ' || nullif(o.city, ''), '') || coalesce(', ' || nullif(o.state, ''), '') || '.';
  end if;

  insert into public.videos (speaker_id, org_id, title, description, video_url, thumbnail_url, platform, platform_video_id, category, topics,
                             format, duration_secs, is_published, status, published_at, show_watermark)
  values (v_sp, v_org, coalesce(nullif(p_payload->>'title', ''), r.title), v_desc, p_payload->>'video_url', p_payload->>'thumbnail_url',
          coalesce(p_payload->>'platform', 'bunny'), p_payload->>'platform_video_id',
          case when s.masjid_event_id is not null and (select kind from public.masjid_events where id = s.masjid_event_id) = 'khutbah' then 'Khutbah'
               else coalesce(p_payload->>'category', 'Islamic Education') end,
          coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload->'topics') x), '{}'),
          coalesce(p_payload->>'format', 'long'), (p_payload->>'duration_secs')::int, true, 'published', now(),
          coalesce((p_payload->>'show_watermark')::boolean, true))
  returning id into v_id;
  update studio.recordings set published_video_id = v_id, speaker_id = v_sp, updated_at = now() where id = p_recording;
  return v_id;
end $$;

-- 4. DJI camera posts: tag the masjid the camera belongs to, and say where it was recorded
create or replace function public.studio_camera_post(p_secret text, p_recording uuid, p_video_url text, p_thumbnail text, p_platform_id text, p_seconds integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i studio.camera_imports; c studio.camera_channels; r studio.recordings; sp public.speakers; o public.organizations; v_id uuid; v_pub boolean; v_desc text;
begin
  if not studio.camera_ok(p_secret) then raise exception 'not allowed'; end if;
  select * into i from studio.camera_imports where recording_id = p_recording;
  if i.video_id is not null then return i.video_id; end if;
  select * into c from studio.camera_channels where id = i.channel_id;
  select * into r from studio.recordings where id = p_recording;
  if c.speaker_id is null then return null; end if;
  select * into sp from public.speakers where id = c.speaker_id;
  select * into o from public.organizations where id = c.masjid_org_id;
  v_pub := c.auto_post and sp.approval_status = 'approved' and coalesce(sp.is_verified, false);
  v_desc := coalesce(c.next_description, coalesce(c.next_title, r.title));
  if o.id is not null then
    v_desc := v_desc || E'\n\nRecorded at ' || o.org_name || coalesce(', ' || nullif(o.city, ''), '') || coalesce(', ' || nullif(o.state, ''), '') || '.';
  end if;
  insert into public.videos (speaker_id, org_id, title, description, video_url, thumbnail_url, duration_secs, category, topics,
                             is_published, published_at, platform, platform_video_id, format, status, show_watermark)
  values (c.speaker_id, o.id, coalesce(c.next_title, r.title), v_desc,
          p_video_url, coalesce(c.next_cover_url, p_thumbnail), coalesce(p_seconds, r.duration_seconds), 'Khutbah', array['Khutbah'],
          v_pub, case when v_pub then now() end, 'bunny', p_platform_id, 'long', case when v_pub then 'published' end,
          coalesce(sp.watermark_on, true))
  returning id into v_id;
  update studio.camera_imports set video_id = v_id, state = 'posted', updated_at = now() where recording_id = p_recording;
  update studio.recordings set published_video_id = v_id, speaker_id = c.speaker_id, updated_at = now() where id = p_recording;
  update studio.camera_channels set next_title = null, next_description = null, next_cover_url = null where id = c.id;
  return v_id;
end $$;

revoke all on function public.masjid_set_watermark(uuid, text), public.studio_signature_context(uuid),
  public.studio_publish_recording(uuid, jsonb, uuid) from public, anon;
grant execute on function public.masjid_set_watermark(uuid, text), public.studio_signature_context(uuid),
  public.studio_publish_recording(uuid, jsonb, uuid) to authenticated;

-- (applied separately as signature_stamped_flag) Room recordings with the signature stamped in.
alter table studio.sessions add column if not exists signature_url text;
alter table public.videos add column if not exists signature_burned boolean not null default false;
create or replace function public.studio_session_set_signature(p_session uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update studio.sessions set signature_url = p_url where id = p_session and (host_id = auth.uid() or public.studio_is_staff());
end $$;
revoke all on function public.studio_session_set_signature(uuid, text) from public, anon;
grant execute on function public.studio_session_set_signature(uuid, text) to authenticated;
-- studio_publish_recording was then re-created to also set videos.signature_burned = (session.signature_url is not null).
