-- Ties a camera stream to a masjid so that masjid's TV screens switch to it when it goes live.
-- Only someone on the masjid's team (or a Siqa admin) can point a stream at it,
-- so nobody can take over another masjid's screens. p_org null = not tied to a masjid.
-- (Applied to production 2026-11-22.)
create or replace function public.studio_camera_set_masjid(p_id uuid, p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not studio.camera_mine(p_id) then raise exception 'not allowed'; end if;
  if p_org is not null then
    if not public.is_masjid_admin(p_org, 'editor') then
      raise exception 'Only someone on this masjid''s team can send a stream to its screens.';
    end if;
    select o.org_name into v_name from public.organizations o where o.id = p_org and o.org_kind = 'masjid';
    if v_name is null then raise exception 'Masjid not found'; end if;
  end if;
  update studio.camera_channels
     set masjid_org_id = p_org,
         masjid_name = case when p_org is null then masjid_name else v_name end
   where id = p_id;
end $$;
revoke all on function public.studio_camera_set_masjid(uuid, uuid) from public, anon;
grant execute on function public.studio_camera_set_masjid(uuid, uuid) to authenticated;

create or replace function public.studio_camera_masjid(p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.masjid_org_id from studio.camera_channels c where c.id = p_id and studio.camera_mine(p_id);
$$;
revoke all on function public.studio_camera_masjid(uuid) from public, anon;
grant execute on function public.studio_camera_masjid(uuid) to authenticated;
