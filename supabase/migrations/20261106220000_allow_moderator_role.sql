-- The app already treats 'moderator' as a staff role (Admin page, blocked
-- words), but profiles.role only allowed viewer/speaker/org/admin, so no one
-- could actually be made a moderator.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['viewer', 'speaker', 'org', 'admin', 'moderator']));
