-- Platform-wide switches, flipped from the SoloStack Command Center.
-- Anyone can read them (the app shows "checkout opens soon"); only the
-- service role (Command Center, edge functions) can change them.

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists "platform settings are public" on public.platform_settings;
create policy "platform settings are public"
  on public.platform_settings for select
  using (true);

-- Marketplace checkout is off until Stripe is switched to live.
insert into public.platform_settings (key, value)
values ('marketplace_checkout_enabled', 'false'::jsonb)
on conflict (key) do nothing;
