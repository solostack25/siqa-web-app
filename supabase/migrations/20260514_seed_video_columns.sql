-- Video-first Seeds support for Siqa.
-- Run this in Supabase if Active Seeds show but Seed videos do not play/save.
alter table public.fundraisers
  add column if not exists subtitle text,
  add column if not exists story text,
  add column if not exists cover_image_url text,
  add column if not exists image_url text,
  add column if not exists video_url text,
  add column if not exists bunny_video_url text,
  add column if not exists media_url text,
  add column if not exists media_type text default 'video',
  add column if not exists zakat_eligible boolean default false,
  add column if not exists sadaqah_jariyah boolean default true,
  add column if not exists is_emergency boolean default false,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists submitted_at timestamptz;

create index if not exists fundraisers_status_created_at_idx
  on public.fundraisers(status, created_at desc);

create index if not exists fundraisers_org_id_status_idx
  on public.fundraisers(org_id, status);
