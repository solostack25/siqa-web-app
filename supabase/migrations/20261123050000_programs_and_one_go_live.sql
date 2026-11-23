-- Step 2: programs + one Go live.
-- A program at a masjid is a masjid schedule item (masjid_events) with an imam attached and "Live on Siqa" on.
-- Imams a masjid adds to "Our imams" can send lives to its TVs without being on its team.
-- A masjid's team can start the live for the imam (the live is credited to the imam).

-- 1. Our imams
create table if not exists public.masjid_imams (
  org_id uuid not null references public.organizations(id) on delete cascade,
  speaker_id uuid not null references public.speakers(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, speaker_id)
);
alter table public.masjid_imams enable row level security;
-- No direct policies: read and change through the functions below.

-- 2. Programs: schedule items get an imam, and "khutbah" is a schedule type
alter table public.masjid_events add column if not exists speaker_id uuid references public.speakers(id) on delete set null;
alter table public.masjid_events drop constraint if exists masjid_events_kind_check;
alter table public.masjid_events add constraint masjid_events_kind_check check (kind = any (array['khutbah','halaqa','khatirah','class','event']));

create or replace function public.masjid_events_check_imam() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.speaker_id is not null and (tg_op = 'INSERT' or new.speaker_id is distinct from old.speaker_id)
     and not exists (select 1 from public.masjid_imams i where i.org_id = new.org_id and i.speaker_id = new.speaker_id) then
    raise exception 'Add this speaker to your imams first.';
  end if;
  return new;
end $$;
drop trigger if exists masjid_events_check_imam on public.masjid_events;
create trigger masjid_events_check_imam before insert or update on public.masjid_events
  for each row execute function public.masjid_events_check_imam();

-- 3. Sessions remember who is speaking and which program they belong to
alter table studio.sessions add column if not exists speaker_id uuid references public.speakers(id) on delete set null;
alter table studio.sessions add column if not exists masjid_event_id uuid references public.masjid_events(id) on delete set null;

-- 4. Who can send a live to a masjid's TVs: its team, or one of its imams
create or replace function public.can_live_to_masjid(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_masjid_admin(p_org, 'editor')
      or exists (select 1 from public.masjid_imams i join public.speakers s on s.id = i.speaker_id
                 where i.org_id = p_org and s.profile_id = auth.uid());
$$;

-- Masjid teams can use Studio to go live (for their imams).
create or replace function public.studio_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.studio_is_staff()
      or exists (select 1 from public.speakers s where s.profile_id = auth.uid() and s.approval_status = 'approved')
      or exists (select 1 from public.masjid_admins a where a.profile_id = auth.uid())
      or exists (select 1 from public.organizations o where o.profile_id = auth.uid() and o.org_kind = 'masjid');
$$;

create or replace function public.studio_session_set_masjid(p_session uuid, p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from studio.sessions s where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff())) then
    raise exception 'not allowed';
  end if;
  if p_org is not null then
    if not exists (select 1 from public.organizations o where o.id = p_org and o.org_kind = 'masjid') then raise exception 'Masjid not found'; end if;
    if not public.can_live_to_masjid(p_org) then
      raise exception 'This masjid hasn''t added you as one of its imams yet.';
    end if;
  end if;
  update studio.sessions set masjid_org_id = p_org where id = p_session;
end $$;

create or replace function public.studio_camera_set_masjid(p_id uuid, p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not studio.camera_mine(p_id) then raise exception 'not allowed'; end if;
  if p_org is not null then
    select o.org_name into v_name from public.organizations o where o.id = p_org and o.org_kind = 'masjid';
    if v_name is null then raise exception 'Masjid not found'; end if;
    if not public.can_live_to_masjid(p_org) then
      raise exception 'This masjid hasn''t added you as one of its imams yet.';
    end if;
  end if;
  update studio.camera_channels
     set masjid_org_id = p_org, masjid_name = case when p_org is null then masjid_name else v_name end
   where id = p_id;
end $$;

-- 5. When a schedule item happens next (or is happening now), in the masjid's time zone
create or replace function public.masjid_event_next(p_event uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select min(x.at) from (
    select ((d::date + e.start_time) at time zone coalesce(ms.timezone, 'America/Chicago')) as at, e.duration_min
    from public.masjid_events e
    left join public.masjid_settings ms on ms.org_id = e.org_id
    cross join lateral generate_series((now() at time zone coalesce(ms.timezone, 'America/Chicago'))::date - 1,
                                       (now() at time zone coalesce(ms.timezone, 'America/Chicago'))::date + 14, interval '1 day') d
    where e.id = p_event
      and d::date >= e.start_date and (e.end_date is null or d::date <= e.end_date)
      and not (d::date = any (coalesce(e.cancelled_dates, '{}')))
      and (case when coalesce(array_length(e.repeat_days, 1), 0) > 0 then extract(dow from d)::int = any (e.repeat_days) else d::date = e.start_date end)
  ) x where x.at + make_interval(mins => x.duration_min + 30) > now();
$$;

-- 6. Everything the Go live screen needs, in one call
create or replace function public.studio_live_options() returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (select s.id, s.display_name from public.speakers s where s.profile_id = auth.uid() and s.approval_status = 'approved' limit 1),
  team as (select o.id from public.organizations o where o.org_kind = 'masjid'
             and (o.profile_id = auth.uid() or exists (select 1 from public.masjid_admins a where a.org_id = o.id and a.profile_id = auth.uid()))),
  imam_of as (select i.org_id as id from public.masjid_imams i join me on me.id = i.speaker_id),
  allowed as (select id, 'team' as via from team union select id, 'imam' from imam_of where id not in (select id from team)),
  progs as (
    select e.id, e.title, e.kind, e.org_id, o.org_name, e.speaker_id, sp.display_name as speaker_name,
           public.masjid_event_next(e.id) as next_at, e.duration_min,
           (e.speaker_id is not null and e.speaker_id = (select id from me)) as mine
    from public.masjid_events e
    join public.organizations o on o.id = e.org_id
    left join public.speakers sp on sp.id = e.speaker_id
    where e.live_on_siqa
      and (e.org_id in (select id from team) or (e.speaker_id is not null and e.speaker_id = (select id from me)))
  )
  select jsonb_build_object(
    'speaker', (select jsonb_build_object('id', id, 'name', display_name) from me),
    'masjids', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.org_name, 'via', a.via,
        'imams', case when a.via = 'team' then coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.display_name) order by s.display_name)
                   from public.masjid_imams i join public.speakers s on s.id = i.speaker_id where i.org_id = o.id), '[]'::jsonb) else '[]'::jsonb end)
        order by o.org_name)
      from allowed a join public.organizations o on o.id = a.id), '[]'::jsonb),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'kind', p.kind, 'masjid_id', p.org_id, 'masjid_name', p.org_name,
        'speaker_id', p.speaker_id, 'speaker_name', p.speaker_name, 'next_at', p.next_at, 'duration_min', p.duration_min, 'mine', p.mine) order by p.next_at nulls last)
      from progs p where p.next_at is not null), '[]'::jsonb)
  );
$$;

-- 7. Set who/where for a live you're hosting: from a program, or a masjid + speaker you picked
create or replace function public.studio_session_setup(p_session uuid, p_event uuid, p_masjid uuid, p_speaker uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_my uuid; e public.masjid_events; v_org uuid := p_masjid; v_sp uuid := p_speaker;
begin
  if not exists (select 1 from studio.sessions s where s.id = p_session and (s.host_id = auth.uid() or public.studio_is_staff())) then
    raise exception 'not allowed';
  end if;
  select s.id into v_my from public.speakers s where s.profile_id = auth.uid() and s.approval_status = 'approved' limit 1;

  if p_event is not null then
    select * into e from public.masjid_events where id = p_event;
    if e.id is null then raise exception 'Program not found'; end if;
    if not (public.is_masjid_admin(e.org_id, 'editor') or (e.speaker_id is not null and e.speaker_id = v_my) or public.studio_is_staff()) then
      raise exception 'not allowed';
    end if;
    v_org := e.org_id; v_sp := coalesce(e.speaker_id, v_my);
  else
    if v_org is not null then
      if not exists (select 1 from public.organizations o where o.id = v_org and o.org_kind = 'masjid') then raise exception 'Masjid not found'; end if;
      if not public.can_live_to_masjid(v_org) then raise exception 'This masjid hasn''t added you as one of its imams yet.'; end if;
    end if;
    if v_sp is null then v_sp := v_my;
    elsif v_sp is distinct from v_my and not public.studio_is_staff() then
      -- Someone else is speaking: only a masjid's team, for one of that masjid's imams.
      if v_org is null or not public.is_masjid_admin(v_org, 'editor')
         or not exists (select 1 from public.masjid_imams i where i.org_id = v_org and i.speaker_id = v_sp) then
        raise exception 'You can only go live for one of your masjid''s imams.';
      end if;
    end if;
  end if;

  update studio.sessions set masjid_org_id = v_org, speaker_id = v_sp, masjid_event_id = p_event,
         host_name = coalesce((select display_name from public.speakers where id = v_sp), host_name)
   where id = p_session;
  return jsonb_build_object('masjid_id', v_org, 'speaker_id', v_sp,
    'speaker_name', (select display_name from public.speakers where id = v_sp),
    'title', case when p_event is not null then e.title else null end);
end $$;

-- 8. Our imams: list, add, remove, find
create or replace function public.masjid_imam_list(p_org uuid) returns table(id uuid, display_name text, avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org, 'editor') then raise exception 'not allowed'; end if;
  return query select s.id, s.display_name, s.avatar_url from public.masjid_imams i join public.speakers s on s.id = i.speaker_id
    where i.org_id = p_org order by s.display_name;
end $$;

create or replace function public.masjid_imam_candidates(p_org uuid, p_q text) returns table(id uuid, display_name text, avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org, 'editor') then raise exception 'not allowed'; end if;
  return query select s.id, s.display_name, s.avatar_url from public.speakers s
    where s.approval_status = 'approved' and length(trim(coalesce(p_q, ''))) >= 2 and s.display_name ilike '%' || trim(p_q) || '%'
      and not exists (select 1 from public.masjid_imams i where i.org_id = p_org and i.speaker_id = s.id)
    order by (s.profile_id is not null) desc, s.display_name limit 10;
end $$;

create or replace function public.masjid_imam_add(p_org uuid, p_speaker uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org, 'admin') then raise exception 'Only the masjid''s owner or admins can add imams.'; end if;
  insert into public.masjid_imams (org_id, speaker_id, added_by) values (p_org, p_speaker, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.masjid_imam_remove(p_org uuid, p_speaker uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org, 'admin') then raise exception 'Only the masjid''s owner or admins can remove imams.'; end if;
  update public.masjid_events set speaker_id = null where org_id = p_org and speaker_id = p_speaker;
  delete from public.masjid_imams where org_id = p_org and speaker_id = p_speaker;
end $$;

-- 9. TVs: credit the imam who is speaking
create or replace function public.masjid_live(p_org uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('watch_token', s.watch_token, 'title', s.title, 'playback_url', s.playback_url,
                           'started_at', coalesce(s.live_started_at, s.created_at),
                           'speaker_name', coalesce(sp2.display_name, sp.display_name, c.speaker_name, s.host_name),
                           'room', (s.camera_channel_id is null and s.meeting_id is not null),
                           'watch_party', (s.watch_video_id is not null))
  from studio.sessions s
  left join studio.camera_channels c on c.id = s.camera_channel_id
  left join public.speakers sp on sp.id = c.speaker_id
  left join public.speakers sp2 on sp2.id = s.speaker_id
  where (c.masjid_org_id = p_org or s.masjid_org_id = p_org)
    and s.status = 'live'
    and (s.playback_url is not null or (s.watch_video_id is not null and s.meeting_id is not null))
    and coalesce(s.live_started_at, s.created_at) > now() - interval '6 hours'
  order by coalesce(s.live_started_at, s.created_at) desc
  limit 1;
$$;

revoke all on function public.masjid_imam_list(uuid), public.masjid_imam_candidates(uuid, text), public.masjid_imam_add(uuid, uuid),
  public.masjid_imam_remove(uuid, uuid), public.studio_live_options(), public.studio_session_setup(uuid, uuid, uuid, uuid),
  public.can_live_to_masjid(uuid), public.masjid_event_next(uuid) from public, anon;
grant execute on function public.masjid_imam_list(uuid), public.masjid_imam_candidates(uuid, text), public.masjid_imam_add(uuid, uuid),
  public.masjid_imam_remove(uuid, uuid), public.studio_live_options(), public.studio_session_setup(uuid, uuid, uuid, uuid),
  public.can_live_to_masjid(uuid), public.masjid_event_next(uuid) to authenticated;
