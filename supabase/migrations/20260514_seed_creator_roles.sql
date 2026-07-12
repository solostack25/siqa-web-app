-- Siqa Seed Creator support columns and role-oriented RLS notes.
-- Review in Supabase before running in production.

alter table public.fundraisers
  add column if not exists subtitle text,
  add column if not exists story text,
  add column if not exists cover_image_url text,
  add column if not exists image_url text,
  add column if not exists zakat_eligible boolean default false,
  add column if not exists sadaqah_jariyah boolean default true,
  add column if not exists is_emergency boolean default false,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists submitted_at timestamptz;

-- Helpful indexes for nonprofit dashboards and public Seeds feed.
create index if not exists fundraisers_org_id_created_at_idx on public.fundraisers(org_id, created_at desc);
create index if not exists fundraisers_status_created_at_idx on public.fundraisers(status, created_at desc);

-- Recommended policy shape:
-- 1. public can read active Seeds.
-- 2. org owners can create/update their own draft Seeds.
-- 3. admins/moderators can approve/publish any Seed.
-- Your existing role/profile functions may differ, so adapt these to your schema.
