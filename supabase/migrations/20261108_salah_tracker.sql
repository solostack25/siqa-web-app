-- Salah Tracker + prayer settings.
-- Private by design: only the owner can read or write their own rows.
-- Never joined into profiles, feeds, Insights or ads.

create table if not exists public.salah_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The prayer day (yyyy-mm-dd, user's local). Isha prayed after midnight
  -- belongs to the previous day until the next Fajr.
  day date not null,
  prayer text not null check (prayer in ('fajr','dhuhr','asr','maghrib','isha')),
  status text not null check (status in ('on_time','late','missed','excused')),
  jamaah boolean not null default false,
  prayed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, prayer)
);

create table if not exists public.salah_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.salah_log enable row level security;
alter table public.salah_settings enable row level security;

drop policy if exists "salah_log owner" on public.salah_log;
create policy "salah_log owner" on public.salah_log
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "salah_settings owner" on public.salah_settings;
create policy "salah_settings owner" on public.salah_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.salah_log from anon;
revoke all on public.salah_settings from anon;
