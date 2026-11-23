-- Step 6: classes students join with their Siqa account.
-- Join = one tap while signed in. Your account email gets the reminders (day before, hour before, when it's live).
-- Recordings and handouts are for enrolled students only (plus the teacher and Siqa staff). Invite-only classes:
-- the teacher adds your email and you join with one tap; no access codes. The old email + code unlock still works.

create table if not exists studio.enrollments (
  series_id uuid not null references studio.series(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, profile_id)
);
alter table studio.enrollments enable row level security;

create or replace function public.studio_class_enroll(p_share text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s studio.series; v_email text; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to join this class.'; end if;
  select * into v_s from studio.series where share_token = p_share and length(p_share) >= 16;
  if v_s.id is null then raise exception 'This class isn''t available.'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select nullif(trim(full_name), '') into v_name from public.profiles where id = auth.uid();
  if v_s.members_only and v_s.owner_id <> auth.uid() and not public.studio_is_staff()
     and not exists (select 1 from studio.members m where m.series_id = v_s.id and m.email = v_email) then
    raise exception 'This class is invite-only. Ask the teacher to add %.', v_email;
  end if;
  insert into studio.enrollments (series_id, profile_id) values (v_s.id, auth.uid()) on conflict do nothing;
  if v_email is not null then
    insert into studio.registrations (series_id, email, name)
    values (v_s.id, v_email, left(v_name, 80))
    on conflict (series_id, email) do update set unsubscribed = false, name = coalesce(excluded.name, studio.registrations.name);
  end if;
  return jsonb_build_object('enrolled', true, 'email', v_email);
end $$;

create or replace function public.studio_class_leave(p_share text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text;
begin
  select id into v_id from studio.series where share_token = p_share and length(p_share) >= 16;
  if v_id is null or auth.uid() is null then return; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  delete from studio.enrollments where series_id = v_id and profile_id = auth.uid();
  update studio.registrations set unsubscribed = true where series_id = v_id and email = v_email;
end $$;

-- The class page: who can see what
create or replace function public.studio_series_public(p_share text, p_email text default null, p_code text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_s studio.series; v_member boolean; v_enrolled boolean; v_open boolean; v_full boolean; v_teacher text;
begin
  select * into v_s from studio.series where share_token = p_share and length(p_share) >= 16;
  if v_s.id is null then return null; end if;
  v_member := exists (select 1 from studio.members m where m.series_id = v_s.id
               and m.email = lower(trim(coalesce(p_email,''))) and m.code = upper(trim(coalesce(p_code,''))));
  v_enrolled := auth.uid() is not null and (
      exists (select 1 from studio.enrollments e where e.series_id = v_s.id and e.profile_id = auth.uid())
      or v_s.owner_id = auth.uid() or public.studio_is_staff());
  v_full := v_enrolled or v_member;                 -- recordings and handouts
  v_open := not v_s.members_only or v_full;         -- live sessions
  select coalesce(sp.display_name, p.full_name) into v_teacher
    from public.profiles p left join public.speakers sp on sp.profile_id = p.id where p.id = v_s.owner_id limit 1;
  return jsonb_build_object(
    'title', v_s.title, 'description', v_s.description, 'cover', v_s.cover_data, 'members_only', v_s.members_only,
    'price_text', v_s.price_text, 'payment_link', v_s.payment_link, 'unlocked', v_full, 'teacher', v_teacher,
    'signed_in', auth.uid() is not null, 'enrolled', v_enrolled, 'is_teacher', auth.uid() is not null and v_s.owner_id = auth.uid(),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'scheduled_at', x.scheduled_at, 'status', x.status,
        'episode_number', x.episode_number, 'watch_token', case when v_open and x.audience_on then x.watch_token end) order by x.scheduled_at)
        from studio.sessions x where x.series_id = v_s.id and (x.status <> 'ended')), '[]'::jsonb),
    'episodes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'kind', r.kind, 'episode_number', r.episode_number,
        'duration_seconds', r.duration_seconds, 'cover', r.cover_data, 'video', case when v_full then r.bunny_video_id end) order by r.episode_number nulls last, r.created_at)
        from studio.recordings r where r.series_id = v_s.id and r.status = 'ready'), '[]'::jsonb),
    'handouts', case when v_full then coalesce((select jsonb_agg(jsonb_build_object('title', h.title, 'url', h.url) order by h.created_at)
        from studio.handouts h where h.series_id = v_s.id), '[]'::jsonb) else '[]'::jsonb end,
    'handout_count', (select count(*) from studio.handouts h where h.series_id = v_s.id)
  );
end $$;

-- My classes: everything a student needs, one call
create or replace function public.studio_my_classes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'share', s.share_token, 'title', s.title, 'cover', s.cover_data, 'members_only', s.members_only,
      'teacher', (select coalesce(sp.display_name, p.full_name) from public.profiles p left join public.speakers sp on sp.profile_id = p.id where p.id = s.owner_id limit 1),
      'live', (select jsonb_build_object('title', x.title, 'watch_token', x.watch_token) from studio.sessions x
               where x.series_id = s.id and x.status = 'live' and x.audience_on order by x.live_started_at desc limit 1),
      'next', (select jsonb_build_object('title', x.title, 'scheduled_at', x.scheduled_at) from studio.sessions x
               where x.series_id = s.id and x.status = 'scheduled' and x.scheduled_at > now() - interval '1 hour' order by x.scheduled_at limit 1),
      'recordings', (select count(*) from studio.recordings r where r.series_id = s.id and r.status = 'ready'),
      'latest', (select jsonb_build_object('title', r.title, 'at', r.created_at) from studio.recordings r where r.series_id = s.id and r.status = 'ready' order by r.created_at desc limit 1),
      'handouts', (select count(*) from studio.handouts h where h.series_id = s.id),
      'joined_at', e.created_at
    ) order by e.created_at desc), '[]'::jsonb)
  from studio.enrollments e join studio.series s on s.id = e.series_id
  where e.profile_id = auth.uid();
$$;

-- Teacher view: the class's students
create or replace function public.studio_series_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.studio_is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from studio.series where id = p_id and (owner_id = auth.uid() or public.studio_is_staff())) then raise exception 'not allowed'; end if;
  return (select jsonb_build_object(
    'series', to_jsonb(s) - 'owner_id',
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'scheduled_at', x.scheduled_at, 'status', x.status,
        'episode_number', x.episode_number, 'watch_token', x.watch_token, 'imported_recording_id', x.imported_recording_id) order by x.scheduled_at)
        from studio.sessions x where x.series_id = s.id), '[]'::jsonb),
    'recordings', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'kind', r.kind, 'status', r.status,
        'episode_number', r.episode_number, 'duration_seconds', r.duration_seconds, 'created_at', r.created_at) order by r.episode_number nulls last, r.created_at)
        from studio.recordings r where r.series_id = s.id), '[]'::jsonb),
    'handouts', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'url', h.url) order by h.created_at) from studio.handouts h where h.series_id = s.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'code', m.code, 'created_at', m.created_at) order by m.created_at desc) from studio.members m where m.series_id = s.id), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1)), 'email', u.email, 'joined_at', e.created_at) order by e.created_at desc)
        from studio.enrollments e join auth.users u on u.id = e.profile_id left join public.profiles p on p.id = e.profile_id where e.series_id = s.id), '[]'::jsonb)
  ) from studio.series s where s.id = p_id);
end $$;

revoke all on function public.studio_class_enroll(text), public.studio_class_leave(text), public.studio_my_classes() from public, anon;
grant execute on function public.studio_class_enroll(text), public.studio_class_leave(text), public.studio_my_classes() to authenticated;
