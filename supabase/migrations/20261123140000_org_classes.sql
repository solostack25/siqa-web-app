-- Classes on organization profiles.
-- A Studio class (studio.series) can be listed on one organization's profile.
-- Visitors see the org's classes in a Classes tab and sign up from there:
-- signed-in users enroll (studio_class_enroll), guests register by email (studio_register).

alter table studio.series add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table studio.series add column if not exists schedule_text text;   -- e.g. "Tuesdays, 8 pm CT · 6 weeks"
alter table studio.series add column if not exists sort integer not null default 0;
alter table studio.series add column if not exists teacher_text text;   -- display name, e.g. the org
create index if not exists series_org_id_idx on studio.series (org_id);

-- Public list of an org's classes, with what the viewer needs to sign up.
create or replace function public.org_classes(p_org uuid)
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'share', s.share_token, 'title', s.title, 'description', s.description, 'cover', s.cover_data,
      'members_only', s.members_only, 'price_text', s.price_text, 'payment_link', s.payment_link,
      'schedule_text', s.schedule_text,
      'teacher', coalesce(nullif(trim(s.teacher_text), ''), (select coalesce(sp.display_name, p.full_name) from public.profiles p
                  left join public.speakers sp on sp.profile_id = p.id where p.id = s.owner_id limit 1)),
      'next', (select jsonb_build_object('title', x.title, 'scheduled_at', x.scheduled_at) from studio.sessions x
               where x.series_id = s.id and x.status = 'scheduled' and x.scheduled_at > now() - interval '1 hour'
               order by x.scheduled_at limit 1),
      'upcoming', (select count(*) from studio.sessions x where x.series_id = s.id and x.status = 'scheduled' and x.scheduled_at > now()),
      'live', exists (select 1 from studio.sessions x where x.series_id = s.id and x.status = 'live'),
      'students', (select count(*) from studio.registrations r where r.series_id = s.id and not r.unsubscribed),
      'enrolled', auth.uid() is not null and exists (select 1 from studio.enrollments e where e.series_id = s.id and e.profile_id = auth.uid())
    ) order by s.sort, s.created_at), '[]'::jsonb)
  from studio.series s
  where s.org_id = p_org;
$$;
grant execute on function public.org_classes(uuid) to anon, authenticated;

-- Who may list classes on an org: its owner or Siqa staff.
create or replace function public.org_can_manage(p_org uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select auth.uid() is not null and (
    public.studio_is_staff()
    or exists (select 1 from public.organizations o where o.id = p_org and o.profile_id = auth.uid()));
$$;
grant execute on function public.org_can_manage(uuid) to authenticated;

-- Classes the caller could list on this org: their own Studio classes (staff see all), with whether each is listed.
create or replace function public.org_class_candidates(p_org uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.org_can_manage(p_org) then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'listed', s.org_id = p_org, 'elsewhere', s.org_id is not null and s.org_id <> p_org,
      'schedule_text', s.schedule_text) order by (s.org_id = p_org) desc, s.created_at desc)
    from (select * from studio.series s where s.owner_id = auth.uid() or public.studio_is_staff() limit 200) s), '[]'::jsonb);
end $$;
grant execute on function public.org_class_candidates(uuid) to authenticated;

-- List or unlist a class on an org (p_on = false unlists). Optional schedule line.
create or replace function public.org_class_set(p_org uuid, p_series uuid, p_on boolean, p_schedule text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_owner uuid;
begin
  if not public.org_can_manage(p_org) then raise exception 'Not allowed'; end if;
  select owner_id into v_owner from studio.series where id = p_series;
  if v_owner is null then raise exception 'Class not found'; end if;
  if v_owner <> auth.uid() and not public.studio_is_staff() then raise exception 'Only the teacher can list this class'; end if;
  update studio.series
     set org_id = case when p_on then p_org else null end,
         schedule_text = coalesce(left(nullif(trim(p_schedule), ''), 120), schedule_text)
   where id = p_series and (p_on or org_id = p_org);
end $$;
grant execute on function public.org_class_set(uuid, uuid, boolean, text) to authenticated;

