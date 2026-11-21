-- A Siqa admin can already own an organization (one per account), so a masjid they set up
-- isn't owned by their account: they're added to its team as owner instead, and hand it over later.
create or replace function public.masjid_create(p_name text, p_city text, p_state text, p_timezone text default 'America/Chicago')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Only Siqa admins can set up a masjid';
  end if;
  insert into public.organizations (profile_id, org_name, org_type, org_kind, city, state, country, approval_status, is_verified)
  values (null, trim(p_name), 'masjid', 'masjid', p_city, p_state, 'US', 'approved', false)
  returning id into v_id;
  insert into public.masjid_settings (org_id, timezone) values (v_id, coalesce(nullif(p_timezone, ''), 'America/Chicago'));
  insert into public.masjid_admins (org_id, profile_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;
