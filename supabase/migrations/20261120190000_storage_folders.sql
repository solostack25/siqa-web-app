-- One readable, permanent Bunny folder per user (e.g. shamikh-sahadat-3f9a2c).
-- Written only by the bunny-upload-url Edge Function (service role); users
-- can't read or change it, so nobody can point their uploads at someone else's folder.
create table if not exists public.storage_folders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  folder text not null unique,
  created_at timestamptz not null default now()
);
alter table public.storage_folders enable row level security;
