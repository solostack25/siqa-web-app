-- Switch a TV between a masjid screen and a home TV without re-pairing it.
-- The box notices on its next check-in (within ~20 seconds); its saved Wi-Fi networks stay.
-- (Applied to production 2026-11-22.)

-- Masjid screen → my home TV. Masjid admins only (same as adding/removing screens).
create or replace function public.screen_move_home(p_screen uuid, p_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.masjid_screens;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v from public.masjid_screens where id = p_screen;
  if v.id is null or v.mode <> 'masjid' then raise exception 'Screen not found'; end if;
  if not public.is_masjid_admin(v.org_id, 'admin') then raise exception 'Only a masjid admin can move this screen'; end if;
  update public.masjid_screens
     set mode = 'home', owner_id = auth.uid(), org_id = null,
         name = coalesce(nullif(trim(p_name), ''), 'Living room TV'), paired_at = now(), command = null
   where id = p_screen;
end $$;
revoke all on function public.screen_move_home(uuid, text) from public, anon;
grant execute on function public.screen_move_home(uuid, text) to authenticated;

-- My home TV → a masjid screen. Only the TV's owner, and only for a masjid they're an admin of.
create or replace function public.screen_move_masjid(p_screen uuid, p_org uuid, p_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.masjid_screens;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v from public.masjid_screens where id = p_screen;
  if v.id is null or v.mode <> 'home' or v.owner_id is distinct from auth.uid() then raise exception 'TV not found'; end if;
  if not public.is_masjid_admin(p_org, 'admin') then raise exception 'You can''t add screens to this masjid'; end if;
  update public.masjid_screens
     set mode = 'masjid', org_id = p_org, owner_id = null,
         name = coalesce(nullif(trim(p_name), ''), 'Screen'), paired_at = now(), command = null
   where id = p_screen;
end $$;
revoke all on function public.screen_move_masjid(uuid, uuid, text) from public, anon;
grant execute on function public.screen_move_masjid(uuid, uuid, text) to authenticated;
