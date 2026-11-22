-- Live rooms (go live from a phone or computer in Siqa Studio) can show on a masjid's TVs,
-- the same way camera streams do. The host picks the masjid when going live; only someone
-- on that masjid's team (or a Siqa admin) can send a live room to its screens.
-- (Applied to production 2026-11-22.)
alter table studio.sessions add column if not exists masjid_org_id uuid references public.organizations(id) on delete set null;
create index if not exists sessions_masjid_live_idx on studio.sessions (masjid_org_id) where status = 'live';

create or replace function public.studio_session_set_masjid(p_session uuid, p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from studio.sessions s where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff())) then
    raise exception 'not allowed';
  end if;
  if p_org is not null then
    if not public.is_masjid_admin(p_org, 'editor') then
      raise exception 'Only someone on this masjid''s team can send a live to its screens.';
    end if;
    if not exists (select 1 from public.organizations o where o.id = p_org and o.org_kind = 'masjid') then
      raise exception 'Masjid not found';
    end if;
  end if;
  update studio.sessions set masjid_org_id = p_org where id = p_session;
end $$;
revoke all on function public.studio_session_set_masjid(uuid, uuid) from public, anon;
grant execute on function public.studio_session_set_masjid(uuid, uuid) to authenticated;

-- What a masjid's TVs switch to: the newest live camera stream or live room tied to the masjid.
create or replace function public.masjid_live(p_org uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('watch_token', s.watch_token, 'title', s.title, 'playback_url', s.playback_url,
                           'started_at', coalesce(s.live_started_at, s.created_at),
                           'speaker_name', coalesce(sp.display_name, c.speaker_name, s.host_name))
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
