-- Siqa for Masjids: the admin center, masjid TV screens and Siqa Home TV boxes.
-- Additive only: new tables, one new nullable column on studio.camera_channels, and functions.
-- A masjid is an organizations row with org_kind = 'masjid'.

-- ── Who can run a masjid ───────────────────────────────────────────────
create table if not exists public.masjid_admins (
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz not null default now(),
  primary key (org_id, profile_id)
);

-- Owner of the org, anyone in masjid_admins, or a Siqa admin.
-- p_min: 'editor' (any team member) or 'owner' (owner-level: team, screens' Wi-Fi).
create or replace function public.is_masjid_admin(p_org uuid, p_min text default 'editor')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      or exists (select 1 from public.organizations o where o.id = p_org and o.profile_id = auth.uid())
      or exists (
        select 1 from public.masjid_admins a
        where a.org_id = p_org and a.profile_id = auth.uid()
          and (p_min = 'editor' or (p_min = 'admin' and a.role in ('owner', 'admin')) or (p_min = 'owner' and a.role = 'owner'))
      );
$$;

-- ── Prayer times, iqamah rules, screen defaults ────────────────────────
create table if not exists public.masjid_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  address text,
  lat double precision,
  lon double precision,
  timezone text not null default 'America/Chicago',
  calc_method text not null default 'NorthAmerica',
  madhab text not null default 'shafi' check (madhab in ('shafi', 'hanafi')),
  -- Per salah: {"mode":"offset","minutes":20} (after athan) or {"mode":"fixed","time":"13:15"}.
  iqamah jsonb not null default '{
    "fajr":{"mode":"offset","minutes":20},
    "dhuhr":{"mode":"offset","minutes":15},
    "asr":{"mode":"offset","minutes":15},
    "maghrib":{"mode":"offset","minutes":5},
    "isha":{"mode":"offset","minutes":15}
  }'::jsonb,
  jummah_times text[] not null default array['13:30'],
  hijri_offset integer not null default 0,
  countdown_minutes integer not null default 30 check (countdown_minutes between 0 and 120),
  ticker text,
  screen_seed_id uuid references public.fundraisers(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── Schedule: halaqas, khatirahs, classes, events ──────────────────────
create table if not exists public.masjid_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'halaqa' check (kind in ('halaqa', 'khatirah', 'class', 'event')),
  title text not null,
  teacher text,
  description text,
  room text,
  -- Local to the masjid's timezone.
  start_date date not null,
  start_time time not null,
  duration_min integer not null default 60 check (duration_min between 5 and 720),
  repeat_days integer[] not null default '{}',   -- 0 = Sunday … 6 = Saturday; empty = one time
  end_date date,
  show_on_screens boolean not null default true,
  countdown_min integer not null default 30 check (countdown_min between 0 and 120),
  live_on_siqa boolean not null default false,
  registration text not null default 'none' check (registration in ('none', 'free', 'paid')),
  price_text text,
  fundraiser_id uuid references public.fundraisers(id) on delete set null,
  cancelled_dates date[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists masjid_events_org_idx on public.masjid_events (org_id, start_date);

-- ── Announcements ──────────────────────────────────────────────────────
create table if not exists public.masjid_announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text,
  image_url text,
  starts_on date not null default current_date,
  ends_on date,
  on_screens boolean not null default true,
  on_page boolean not null default true,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists masjid_announcements_org_idx on public.masjid_announcements (org_id, starts_on);

-- ── Screens and boxes ──────────────────────────────────────────────────
-- One row per device. A device starts unpaired with a 6-digit code; a masjid admin
-- (mode 'masjid') or a signed-in user (mode 'home') claims it with that code.
create table if not exists public.masjid_screens (
  id uuid primary key default gen_random_uuid(),
  device_token text not null unique,
  pair_code text,
  pair_expires_at timestamptz,
  mode text check (mode in ('masjid', 'home')),
  org_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  name text,
  layout text not null default 'standard' check (layout in ('standard', 'portrait', 'times_only')),
  show_live boolean not null default true,
  live_audio boolean not null default false,
  power_on time,
  power_off time,
  paired_at timestamptz,
  last_seen_at timestamptz,
  info jsonb not null default '{}'::jsonb,         -- what the device last reported (version, resolution, ssid, signal…)
  command jsonb,                                    -- one pending command: {"id":…, "type":"reload"|"reboot"|"wifi_sync"}
  wifi_event jsonb,                                 -- last Wi-Fi change the device reported
  created_at timestamptz not null default now()
);
create unique index if not exists masjid_screens_pair_code_idx on public.masjid_screens (pair_code) where pair_code is not null;
create index if not exists masjid_screens_org_idx on public.masjid_screens (org_id);

-- Saved Wi-Fi networks a box should know. Only owner-level masjid admins (or the
-- box's home owner) can read or change them; the box gets them through screen_state.
create table if not exists public.masjid_screen_wifi (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.masjid_screens(id) on delete cascade,
  ssid text not null,
  password text,
  security text not null default 'WPA' check (security in ('WPA', 'WEP', 'OPEN')),
  priority integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'saved', 'failed')),
  created_at timestamptz not null default now(),
  unique (screen_id, ssid)
);

-- Khutbah streams can belong to a masjid so its screens switch to them.
alter table studio.camera_channels add column if not exists masjid_org_id uuid references public.organizations(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.masjid_admins enable row level security;
alter table public.masjid_settings enable row level security;
alter table public.masjid_events enable row level security;
alter table public.masjid_announcements enable row level security;
alter table public.masjid_screens enable row level security;
alter table public.masjid_screen_wifi enable row level security;

create policy masjid_admins_read on public.masjid_admins for select using (public.is_masjid_admin(org_id));
create policy masjid_admins_write on public.masjid_admins for all using (public.is_masjid_admin(org_id, 'owner')) with check (public.is_masjid_admin(org_id, 'owner'));

create policy masjid_settings_read on public.masjid_settings for select using (true);
create policy masjid_settings_write on public.masjid_settings for all using (public.is_masjid_admin(org_id, 'admin')) with check (public.is_masjid_admin(org_id, 'admin'));

create policy masjid_events_read on public.masjid_events for select using (true);
create policy masjid_events_write on public.masjid_events for all using (public.is_masjid_admin(org_id)) with check (public.is_masjid_admin(org_id));

create policy masjid_ann_read on public.masjid_announcements for select using (true);
create policy masjid_ann_write on public.masjid_announcements for all using (public.is_masjid_admin(org_id)) with check (public.is_masjid_admin(org_id));

-- Screens: team members see their masjid's screens; home owners see their own boxes.
-- device_token is never exposed to the browser (column privileges below).
create policy masjid_screens_read on public.masjid_screens for select
  using ((org_id is not null and public.is_masjid_admin(org_id)) or owner_id = auth.uid());
create policy masjid_screens_update on public.masjid_screens for update
  using ((org_id is not null and public.is_masjid_admin(org_id, 'admin')) or owner_id = auth.uid())
  with check ((org_id is not null and public.is_masjid_admin(org_id, 'admin')) or owner_id = auth.uid());
create policy masjid_screens_delete on public.masjid_screens for delete
  using ((org_id is not null and public.is_masjid_admin(org_id, 'admin')) or owner_id = auth.uid());
revoke select on public.masjid_screens from anon, authenticated;
grant select (id, mode, org_id, owner_id, name, layout, show_live, live_audio, power_on, power_off, paired_at, last_seen_at, info, command, wifi_event, created_at)
  on public.masjid_screens to authenticated;
revoke update on public.masjid_screens from anon, authenticated;
grant update (name, layout, show_live, live_audio, power_on, power_off, command) on public.masjid_screens to authenticated;
grant delete on public.masjid_screens to authenticated;
revoke insert on public.masjid_screens from anon, authenticated;

create policy masjid_wifi_all on public.masjid_screen_wifi for all using (
  exists (select 1 from public.masjid_screens s where s.id = screen_id
          and ((s.org_id is not null and public.is_masjid_admin(s.org_id, 'owner')) or s.owner_id = auth.uid()))
) with check (
  exists (select 1 from public.masjid_screens s where s.id = screen_id
          and ((s.org_id is not null and public.is_masjid_admin(s.org_id, 'owner')) or s.owner_id = auth.uid()))
);

-- ── Masjids I can manage ───────────────────────────────────────────────
create or replace function public.my_masjids()
returns table (id uuid, org_name text, city text, state text, logo_url text, my_role text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.org_name, o.city, o.state, o.logo_url,
    case when o.profile_id = auth.uid() then 'owner'
         else coalesce((select a.role from public.masjid_admins a where a.org_id = o.id and a.profile_id = auth.uid()), 'siqa') end
  from public.organizations o
  where o.org_kind = 'masjid'
    and (o.profile_id = auth.uid()
         or exists (select 1 from public.masjid_admins a where a.org_id = o.id and a.profile_id = auth.uid())
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  order by o.org_name;
$$;

-- Siqa admins set up a masjid (manual onboarding) and hand it to its owner later.
create or replace function public.masjid_create(p_name text, p_city text, p_state text, p_timezone text default 'America/Chicago')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Only Siqa admins can set up a masjid';
  end if;
  insert into public.organizations (profile_id, org_name, org_type, org_kind, city, state, country, approval_status, is_verified)
  values (auth.uid(), trim(p_name), 'masjid', 'masjid', p_city, p_state, 'US', 'approved', false)
  returning id into v_id;
  insert into public.masjid_settings (org_id, timezone) values (v_id, coalesce(nullif(p_timezone, ''), 'America/Chicago'));
  return v_id;
end $$;

-- Add a team member by the email they signed up with.
create or replace function public.masjid_add_admin(p_org uuid, p_email text, p_role text default 'admin')
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_masjid_admin(p_org, 'owner') then raise exception 'Only the masjid owner can add people'; end if;
  if p_role not in ('owner', 'admin', 'editor') then raise exception 'Unknown role'; end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_user is null then return 'not_found'; end if;
  insert into public.masjid_admins (org_id, profile_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, profile_id) do update set role = excluded.role;
  return 'added';
end $$;

create or replace function public.masjid_team(p_org uuid)
returns table (profile_id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = '' as $$
  select a.profile_id, p.full_name, u.email::text, a.role
  from public.masjid_admins a
  join public.profiles p on p.id = a.profile_id
  join auth.users u on u.id = a.profile_id
  where a.org_id = p_org and public.is_masjid_admin(p_org)
  order by a.created_at;
$$;

-- ── Devices ────────────────────────────────────────────────────────────
-- A box or browser asks for a pairing code. It keeps the device_token for good.
create or replace function public.screen_register(p_device_token text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v_row public.masjid_screens; v_code text; v_token text;
begin
  -- Tidy up boxes that asked for a code and were never paired.
  delete from public.masjid_screens where paired_at is null and created_at < now() - interval '3 days';

  if p_device_token is not null then
    select * into v_row from public.masjid_screens where device_token = p_device_token;
  end if;

  if v_row.id is not null and v_row.paired_at is not null then
    return json_build_object('device_token', v_row.device_token, 'paired', true, 'mode', v_row.mode);
  end if;

  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.masjid_screens where pair_code = v_code);
  end loop;

  if v_row.id is null then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.masjid_screens (device_token, pair_code, pair_expires_at)
    values (v_token, v_code, now() + interval '30 minutes') returning * into v_row;
  else
    update public.masjid_screens set pair_code = v_code, pair_expires_at = now() + interval '30 minutes'
    where id = v_row.id returning * into v_row;
  end if;

  return json_build_object('device_token', v_row.device_token, 'paired', false, 'pair_code', v_row.pair_code, 'expires_at', v_row.pair_expires_at);
end $$;

-- An admin claims a screen for a masjid with the code shown on the TV.
create or replace function public.screen_claim_masjid(p_code text, p_org uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_masjid_admin(p_org, 'admin') then raise exception 'You can''t add screens to this masjid'; end if;
  update public.masjid_screens
     set mode = 'masjid', org_id = p_org, owner_id = null, name = coalesce(nullif(trim(p_name), ''), 'Screen'),
         paired_at = now(), pair_code = null, pair_expires_at = null
   where pair_code = trim(p_code) and pair_expires_at > now()
  returning id into v_id;
  if v_id is null then raise exception 'That code didn''t match a screen. Check the TV for the current code.'; end if;
  return v_id;
end $$;

-- A signed-in person claims a box for their own home.
create or replace function public.screen_claim_home(p_code text, p_name text default 'Living room TV')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.masjid_screens
     set mode = 'home', owner_id = auth.uid(), org_id = null, name = coalesce(nullif(trim(p_name), ''), 'Living room TV'),
         paired_at = now(), pair_code = null, pair_expires_at = null
   where pair_code = trim(p_code) and pair_expires_at > now()
  returning id into v_id;
  if v_id is null then raise exception 'That code didn''t match a TV. Check the TV for the current code.'; end if;
  return v_id;
end $$;

-- Live khutbah for a masjid: a live camera session whose channel belongs to the masjid.
create or replace function public.masjid_live(p_org uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('watch_token', s.watch_token, 'title', s.title, 'playback_url', s.playback_url,
                           'started_at', coalesce(s.live_started_at, s.created_at),
                           'speaker_name', coalesce(sp.display_name, c.speaker_name, s.host_name))
  from studio.sessions s
  join studio.camera_channels c on c.id = s.camera_channel_id
  left join public.speakers sp on sp.id = c.speaker_id
  where c.masjid_org_id = p_org and s.status = 'live' and s.playback_url is not null
    and coalesce(s.live_started_at, s.created_at) > now() - interval '6 hours'
  order by coalesce(s.live_started_at, s.created_at) desc
  limit 1;
$$;

-- Everything a device needs, in one call. Also its heartbeat.
create or replace function public.screen_state(p_device_token text, p_info jsonb default '{}'::jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare v public.masjid_screens; v_out json; v_cmd jsonb;
begin
  update public.masjid_screens
     set last_seen_at = now(), info = coalesce(p_info, '{}'::jsonb)
   where device_token = p_device_token
  returning * into v;
  if v.id is null then return json_build_object('status', 'unknown'); end if;
  if v.paired_at is null then return json_build_object('status', 'unpaired', 'pair_code', v.pair_code, 'expires_at', v.pair_expires_at); end if;

  v_cmd := v.command;

  if v.mode = 'home' then
    select json_build_object(
      'status', 'paired', 'mode', 'home',
      'screen', json_build_object('id', v.id, 'name', v.name),
      'command', v_cmd,
      'wifi', (select coalesce(json_agg(json_build_object('ssid', w.ssid, 'password', w.password, 'security', w.security) order by w.priority desc), '[]') from public.masjid_screen_wifi w where w.screen_id = v.id),
      'user', (select json_build_object('id', p.id, 'name', p.full_name) from public.profiles p where p.id = v.owner_id),
      'following_speakers', (select coalesce(json_agg(f.speaker_id), '[]') from public.speaker_follows f where f.follower_id = v.owner_id),
      'following_masjids', (select coalesce(json_agg(o.id), '[]') from public.organizations o
          where o.org_kind = 'masjid' and exists (select 1 from public.follows f where f.follower_id = v.owner_id and f.following_id = o.profile_id))
    ) into v_out;
    return v_out;
  end if;

  select json_build_object(
    'status', 'paired', 'mode', 'masjid',
    'screen', json_build_object('id', v.id, 'name', v.name, 'layout', v.layout, 'show_live', v.show_live, 'live_audio', v.live_audio,
                                'power_on', v.power_on, 'power_off', v.power_off),
    'command', v_cmd,
    'wifi', (select coalesce(json_agg(json_build_object('ssid', w.ssid, 'password', w.password, 'security', w.security) order by w.priority desc), '[]') from public.masjid_screen_wifi w where w.screen_id = v.id),
    'masjid', (select json_build_object('id', o.id, 'name', o.org_name, 'city', o.city, 'state', o.state, 'logo_url', o.logo_url) from public.organizations o where o.id = v.org_id),
    'settings', (select row_to_json(ms) from public.masjid_settings ms where ms.org_id = v.org_id),
    'events', (select coalesce(json_agg(row_to_json(e)), '[]') from (
        select id, kind, title, teacher, room, start_date, start_time, duration_min, repeat_days, end_date, countdown_min,
               live_on_siqa, registration, fundraiser_id, cancelled_dates
        from public.masjid_events
        where org_id = v.org_id and show_on_screens
          and (coalesce(array_length(repeat_days, 1), 0) > 0 and (end_date is null or end_date >= current_date - 1)
               or start_date between current_date - 1 and current_date + 14)
      ) e),
    'announcements', (select coalesce(json_agg(row_to_json(a) order by a.pinned desc, a.created_at desc), '[]') from (
        select id, title, body, image_url, pinned, created_at from public.masjid_announcements
        where org_id = v.org_id and on_screens and starts_on <= current_date + 1 and (ends_on is null or ends_on >= current_date - 1)
        limit 12) a),
    'seeds', (select coalesce(json_agg(row_to_json(f)), '[]') from (
        select id, title, goal_amount, raised_amount, donor_count, cover_image_url
        from public.fundraisers
        where org_id = v.org_id and status in ('active', 'approved', 'live')
        order by (id = (select screen_seed_id from public.masjid_settings where org_id = v.org_id)) desc, created_at desc
        limit 3) f),
    'live', case when v.show_live then public.masjid_live(v.org_id) else null end
  ) into v_out;
  return v_out;
end $$;

-- The device confirms it ran a command, and reports Wi-Fi changes made at the TV.
create or replace function public.screen_ack(p_device_token text, p_command_id text default null, p_wifi_event jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.masjid_screens
     set command = case when p_command_id is not null and command->>'id' = p_command_id then null else command end,
         wifi_event = coalesce(p_wifi_event, wifi_event)
   where device_token = p_device_token;
  if p_wifi_event is not null and p_wifi_event ? 'ssid' then
    update public.masjid_screen_wifi w set status = case when coalesce((p_wifi_event->>'ok')::boolean, false) then 'saved' else 'failed' end
      from public.masjid_screens s
     where s.device_token = p_device_token and w.screen_id = s.id and w.ssid = p_wifi_event->>'ssid';
  end if;
end $$;

grant execute on function public.screen_register(text), public.screen_state(text, jsonb), public.screen_ack(text, text, jsonb) to anon, authenticated;
grant execute on function public.my_masjids(), public.masjid_create(text, text, text, text), public.masjid_add_admin(uuid, text, text),
  public.masjid_team(uuid), public.screen_claim_masjid(text, uuid, text), public.screen_claim_home(text, text),
  public.is_masjid_admin(uuid, text) to authenticated;
grant execute on function public.masjid_live(uuid) to anon, authenticated;
revoke execute on function public.masjid_create(text, text, text, text) from anon;

-- Masjids are their own org kind.
alter table public.organizations drop constraint organizations_org_kind_check;
alter table public.organizations add constraint organizations_org_kind_check check (org_kind = any (array['nonprofit','content','masjid']));

-- What kind of account is signed in. Masjid-only accounts open straight into the masjid console.
create or replace function public.my_account_kind()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'role', (select p.role from public.profiles p where p.id = auth.uid()),
    'masjids', (select count(*) from public.organizations o where o.org_kind = 'masjid'
                 and (o.profile_id = auth.uid() or exists (select 1 from public.masjid_admins a where a.org_id = o.id and a.profile_id = auth.uid()))),
    'other_orgs', (select count(*) from public.organizations o where o.org_kind <> 'masjid' and o.profile_id = auth.uid()),
    'is_speaker', exists (select 1 from public.speakers s where s.profile_id = auth.uid()),
    'is_seller', exists (select 1 from public.marketplace_sellers m where m.user_id = auth.uid())
  );
$$;
grant execute on function public.my_account_kind() to authenticated;
