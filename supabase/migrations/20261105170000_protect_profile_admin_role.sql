-- Applied to production on 2026-11-05 via Supabase MCP. Kept here for history.
-- See the function comment: users could make themselves admin.
create or replace function public.guard_profile_admin_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  caller_is_admin boolean := false;
begin
  if new.role is distinct from 'admin' then return new; end if;
  if tg_op = 'UPDATE' and old.role = 'admin' then return new; end if;
  if claims ->> 'role' = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then new.role := 'viewer'; return new; end if;
  if claims is null then return new; end if;
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into caller_is_admin;
  if caller_is_admin then return new; end if;
  raise exception 'Only an admin can grant the admin role' using errcode = '42501';
end; $$;

drop trigger if exists guard_profile_admin_role on public.profiles;
create trigger guard_profile_admin_role
  before insert or update of role on public.profiles
  for each row execute function public.guard_profile_admin_role();
