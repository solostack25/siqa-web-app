-- Siqa Events: banquets, conferences and classes for nonprofits and masjids.
-- Setup (tickets, program, giving, devices) lives in the dashboard; on the night, paired devices
-- (big screen, podium, MC, registration, volunteers) and guests' phones all follow one event.
-- Team = whoever can manage the organization (is_masjid_admin covers owner, team and Siqa admins).
-- Devices pair with a 6-digit code like TV screens and act through the event_device_* functions.
-- (Applied to production 2026-11-22.)

-- ── Tables ──────────────────────────────────────────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique default lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10)),
  title text not null default 'New event',
  kind text not null default 'banquet' check (kind in ('banquet', 'conference', 'class', 'dinner', 'other')),
  starts_at timestamptz,
  doors_at timestamptz,
  venue text,
  address text,
  about text,
  cover_url text,
  in_person boolean not null default true,
  online boolean not null default false,
  fundraiser_id uuid references public.fundraisers(id) on delete set null,
  goal_cents bigint not null default 0,
  pre_raised_cents bigint not null default 0,
  match_cents bigint not null default 0,
  match_by text,
  ladder jsonb not null default '[]'::jsonb,       -- [{"amount_cents":2500000,"label":"Founders"}, …]
  ladder_index int,                                 -- the level the fundraiser is calling now
  ask_names boolean not null default true,
  ask_diet boolean not null default false,
  checkout_gift boolean not null default true,
  door_sales boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'live', 'ended')),
  current_segment_id uuid,
  segment_started_at timestamptz,
  segment_extra_min int not null default 0,
  slide_index int not null default 0,
  stage_mode text not null default 'auto' check (stage_mode in ('auto', 'welcome', 'program', 'appeal', 'slides', 'speaker', 'video', 'thanks')),
  online_watch_token text,                          -- a Siqa live (Studio) linked for online seats and remote speakers
  live_started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_org_idx on public.events (org_id);

create table if not exists public.event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price_cents bigint not null default 0 check (price_cents >= 0),
  quantity int check (quantity is null or quantity >= 0),   -- null = no limit
  kind text not null default 'in_person' check (kind in ('in_person', 'online')),
  seats int not null default 1 check (seats between 1 and 20),  -- a table ticket seats several guests
  deductible_cents bigint not null default 0 check (deductible_cents >= 0),
  sort int not null default 0,
  active boolean not null default true
);
create index if not exists event_ticket_types_event_idx on public.event_ticket_types (event_id);

create table if not exists public.event_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  buyer_profile_id uuid references public.profiles(id) on delete set null,
  items jsonb not null default '[]'::jsonb,         -- [{"ticket_type_id","qty","price_cents"}]
  total_cents bigint not null default 0,
  gift_cents bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  source text not null default 'online' check (source in ('online', 'door')),
  stripe_payment_intent_id text,
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists event_orders_event_idx on public.event_orders (event_id);

create table if not exists public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  order_id uuid references public.event_orders(id) on delete cascade,
  ticket_type_id uuid references public.event_ticket_types(id) on delete set null,
  name text,
  email text,
  table_label text,
  diet text,
  kind text not null default 'in_person' check (kind in ('in_person', 'online')),
  code text not null unique default upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8)),
  checked_in_at timestamptz,
  checked_in_by text,
  created_at timestamptz not null default now()
);
create index if not exists event_attendees_event_idx on public.event_attendees (event_id);

create table if not exists public.event_segments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sort int not null default 0,
  title text not null default 'Segment',
  speaker text,
  kind text not null default 'talk' check (kind in ('welcome', 'talk', 'recitation', 'video', 'appeal', 'meal', 'other')),
  minutes int not null default 10 check (minutes between 1 and 600),
  remote boolean not null default false,
  script text,
  slides jsonb not null default '[]'::jsonb,        -- slide image URLs, in order
  video_url text,
  created_at timestamptz not null default now()
);
create index if not exists event_segments_event_idx on public.event_segments (event_id, sort);

create table if not exists public.event_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  device_token text not null unique,
  pair_code text,
  pair_expires_at timestamptz,
  role text check (role in ('stage', 'podium', 'mc', 'registration', 'volunteer')),
  name text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists event_devices_code_idx on public.event_devices (pair_code) where pair_code is not null;

create table if not exists public.event_gifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('card', 'cash', 'check', 'pledge', 'tap', 'other')),
  donor_name text,
  donor_email text,
  anonymous boolean not null default false,
  show_name boolean not null default true,
  table_label text,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'unconfirmed', 'pledged', 'void')),
  pledge_plan text,                                 -- e.g. "12 monthly payments"
  stripe_payment_intent_id text unique,
  test_mode boolean not null default false,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists event_gifts_event_idx on public.event_gifts (event_id, created_at desc);

create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  from_label text not null,
  from_role text,
  to_role text not null default 'mc' check (to_role in ('mc', 'podium', 'team', 'all')),
  body text not null,
  urgent boolean not null default false,
  kind text not null default 'message' check (kind in ('message', 'change_request')),
  change jsonb,                                     -- change requests: {"type":"extend","minutes":5} …
  status text not null default 'new' check (status in ('new', 'ack', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  acted_at timestamptz
);
create index if not exists event_messages_event_idx on public.event_messages (event_id, created_at desc);

-- ── Who can manage an event ─────────────────────────────────────────────
create or replace function public.event_team_ok(p_event uuid, p_min text default 'editor')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and public.is_masjid_admin(e.org_id, p_min));
$$;

alter table public.events enable row level security;
alter table public.event_ticket_types enable row level security;
alter table public.event_orders enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_segments enable row level security;
alter table public.event_devices enable row level security;
alter table public.event_gifts enable row level security;
alter table public.event_messages enable row level security;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (status in ('published', 'live', 'ended') or public.is_masjid_admin(org_id));
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert with check (public.is_masjid_admin(org_id));
drop policy if exists events_update on public.events;
create policy events_update on public.events for update using (public.is_masjid_admin(org_id)) with check (public.is_masjid_admin(org_id));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete using (public.is_masjid_admin(org_id, 'admin'));

drop policy if exists ett_read on public.event_ticket_types;
create policy ett_read on public.event_ticket_types for select using (
  exists (select 1 from public.events e where e.id = event_id and (e.status in ('published', 'live', 'ended') or public.is_masjid_admin(e.org_id))));
drop policy if exists ett_write on public.event_ticket_types;
create policy ett_write on public.event_ticket_types for all using (public.event_team_ok(event_id)) with check (public.event_team_ok(event_id));

-- Team only below (guests and devices go through the functions).
do $$ declare t text; begin
  foreach t in array array['event_orders', 'event_attendees', 'event_segments', 'event_gifts', 'event_messages'] loop
    execute format('drop policy if exists %1$s_team on public.%1$s', t);
    execute format('create policy %1$s_team on public.%1$s for all using (public.event_team_ok(event_id)) with check (public.event_team_ok(event_id))', t);
  end loop;
end $$;
drop policy if exists event_devices_team on public.event_devices;
create policy event_devices_team on public.event_devices for select using (event_id is not null and public.event_team_ok(event_id));
drop policy if exists event_devices_team_del on public.event_devices;
create policy event_devices_team_del on public.event_devices for delete using (event_id is not null and public.event_team_ok(event_id));
revoke select on public.event_devices from anon, authenticated;
grant select (id, event_id, role, name, paired_at, last_seen_at, created_at) on public.event_devices to authenticated;
grant delete on public.event_devices to authenticated;

create or replace function public.events_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events for each row execute function public.events_touch();

-- Event media (cover photos, slides): anyone signed in uploads into their own folder.
insert into storage.buckets (id, name, public) values ('event-media', 'event-media', true) on conflict (id) do nothing;
drop policy if exists event_media_insert on storage.objects;
create policy event_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists event_media_read on storage.objects;
create policy event_media_read on storage.objects for select using (bucket_id = 'event-media');

-- ── Totals ──────────────────────────────────────────────────────────────
create or replace function public.event_totals(p_event uuid)
returns json language sql stable security definer set search_path = '' as $$
  with g as (select * from public.event_gifts where event_id = p_event and status <> 'void' and status <> 'pending'),
       e as (select * from public.events where id = p_event)
  select json_build_object(
    'raised_cents', (select pre_raised_cents from e) + coalesce((select sum(amount_cents) from g), 0),
    'tonight_cents', coalesce((select sum(amount_cents) from g), 0),
    'goal_cents', (select goal_cents from e),
    'donors', (select count(*) from g),
    'match_cents', (select match_cents from e),
    'match_used_cents', least((select match_cents from e), coalesce((select sum(amount_cents) from g), 0)),
    'by_method', coalesce((select json_object_agg(method, s) from (select method, sum(amount_cents) s from g group by method) x), '{}'::json),
    'pledged_cents', coalesce((select sum(amount_cents) from g where status = 'pledged'), 0),
    'unconfirmed_cents', coalesce((select sum(amount_cents) from g where status = 'unconfirmed'), 0),
    'checked_in', (select count(*) from public.event_attendees a where a.event_id = p_event and a.checked_in_at is not null and a.kind = 'in_person'),
    'attendees', (select count(*) from public.event_attendees a where a.event_id = p_event and a.kind = 'in_person'),
    'online_attendees', (select count(*) from public.event_attendees a where a.event_id = p_event and a.kind = 'online'),
    'feed', coalesce((select json_agg(json_build_object('name', case when anonymous or not show_name or coalesce(donor_name, '') = '' then 'Anonymous' else donor_name end,
                                                         'amount_cents', amount_cents, 'method', method, 'at', created_at) order by created_at desc)
                      from (select * from g order by created_at desc limit 8) f), '[]'::json)
  );
$$;

-- Everything a screen or device needs, in one call. p_role decides what's included.
create or replace function public.event_state_json(p_event uuid, p_role text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare e public.events; v_out json; v_cur uuid;
begin
  select * into e from public.events where id = p_event;
  if e.id is null then return null; end if;
  v_cur := coalesce(e.current_segment_id, (select s.id from public.event_segments s where s.event_id = e.id order by s.sort, s.created_at limit 1));
  select json_build_object(
    'event', json_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'kind', e.kind, 'status', e.status, 'starts_at', e.starts_at,
                               'venue', e.venue, 'goal_cents', e.goal_cents, 'match_cents', e.match_cents, 'match_by', e.match_by,
                               'ladder', e.ladder, 'ladder_index', e.ladder_index, 'stage_mode', e.stage_mode, 'slide_index', e.slide_index,
                               'current_segment_id', v_cur, 'segment_started_at', e.segment_started_at, 'segment_extra_min', e.segment_extra_min,
                               'online_watch_token', e.online_watch_token, 'fundraiser_id', e.fundraiser_id,
                               'org_name', (select o.org_name from public.organizations o where o.id = e.org_id),
                               'org_logo', (select o.logo_url from public.organizations o where o.id = e.org_id)),
    'segments', coalesce((select json_agg(json_build_object('id', s.id, 'title', s.title, 'speaker', s.speaker, 'kind', s.kind, 'minutes', s.minutes,
                                                            'remote', s.remote, 'video_url', s.video_url, 'slides', s.slides,
                                                            'script', case when p_role in ('podium', 'mc', 'team') then s.script else null end)
                                         order by s.sort, s.created_at) from public.event_segments s where s.event_id = e.id), '[]'::json),
    'totals', public.event_totals(e.id),
    'messages', case when p_role in ('mc', 'podium', 'team') then coalesce((select json_agg(m order by m.created_at desc) from (
        select id, from_label, from_role, to_role, body, urgent, kind, change, status, created_at from public.event_messages
        where event_id = e.id and created_at > now() - interval '12 hours'
          and (p_role = 'team' or to_role = p_role or to_role = 'all' or (p_role = 'mc' and to_role = 'team'))
        order by created_at desc limit 30) m), '[]'::json) else '[]'::json end,
    'server_now', now()
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.event_state_json(uuid, text) from public, anon, authenticated;

-- ── Actions (shared by devices and the dashboard's live control) ────────
create or replace function public.event_apply(p_event uuid, p_role text, p_actor text, p_action text, p_payload jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare e public.events; v_next uuid; v_id uuid; v_amount bigint; m public.event_messages;
  can_run boolean := p_role in ('team', 'mc', 'podium');
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null then raise exception 'Event not found'; end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_action in ('next_segment', 'prev_segment', 'goto_segment') then
    if not can_run then raise exception 'not allowed'; end if;
    v_id := coalesce(e.current_segment_id, (select s.id from public.event_segments s where s.event_id = e.id order by s.sort, s.created_at limit 1));
    if p_action = 'goto_segment' then
      select s.id into v_next from public.event_segments s where s.id = (p_payload->>'segment_id')::uuid and s.event_id = e.id;
    elsif p_action = 'next_segment' then
      select s.id into v_next from public.event_segments s, public.event_segments c
       where c.id = v_id and s.event_id = e.id and (s.sort, s.created_at) > (c.sort, c.created_at) order by s.sort, s.created_at limit 1;
    else
      select s.id into v_next from public.event_segments s, public.event_segments c
       where c.id = v_id and s.event_id = e.id and (s.sort, s.created_at) < (c.sort, c.created_at) order by s.sort desc, s.created_at desc limit 1;
    end if;
    if v_next is null then return json_build_object('ok', false, 'reason', 'no_more'); end if;
    update public.events set current_segment_id = v_next, segment_started_at = now(), segment_extra_min = 0, slide_index = 0,
      ladder_index = case when (select kind from public.event_segments where id = v_next) = 'appeal' then coalesce(ladder_index, 0) else ladder_index end
     where id = e.id;
  elsif p_action = 'start_event' then
    if p_role <> 'team' and p_role <> 'mc' then raise exception 'not allowed'; end if;
    update public.events set status = 'live', live_started_at = coalesce(live_started_at, now()),
      current_segment_id = coalesce(current_segment_id, (select s.id from public.event_segments s where s.event_id = e.id order by s.sort, s.created_at limit 1)),
      segment_started_at = coalesce(segment_started_at, now())
     where id = e.id;
  elsif p_action = 'end_event' then
    if p_role <> 'team' then raise exception 'not allowed'; end if;
    update public.events set status = 'ended', ended_at = now(), stage_mode = 'thanks' where id = e.id;
  elsif p_action = 'extend' then
    if not can_run then raise exception 'not allowed'; end if;
    update public.events set segment_extra_min = segment_extra_min + greatest(-30, least(30, coalesce((p_payload->>'minutes')::int, 5))) where id = e.id;
  elsif p_action = 'stage_mode' then
    if p_role not in ('team', 'mc') then raise exception 'not allowed'; end if;
    update public.events set stage_mode = p_payload->>'mode' where id = e.id;
  elsif p_action in ('slide_next', 'slide_prev', 'slide_goto') then
    if not can_run then raise exception 'not allowed'; end if;
    update public.events set slide_index = greatest(0,
      case p_action when 'slide_next' then slide_index + 1 when 'slide_prev' then slide_index - 1 else coalesce((p_payload->>'index')::int, 0) end)
     where id = e.id;
  elsif p_action = 'ladder' then
    if p_role not in ('team', 'mc', 'podium') then raise exception 'not allowed'; end if;
    update public.events set ladder_index = case when p_payload ? 'index' and p_payload->>'index' is not null then greatest(0, (p_payload->>'index')::int) else null end where id = e.id;
  elsif p_action = 'log_gift' then
    if p_role not in ('team', 'volunteer', 'registration', 'mc') then raise exception 'not allowed'; end if;
    v_amount := (p_payload->>'amount_cents')::bigint;
    if v_amount is null or v_amount <= 0 or v_amount > 100000000 then raise exception 'Enter an amount'; end if;
    insert into public.event_gifts (event_id, amount_cents, method, donor_name, donor_email, anonymous, show_name, table_label, status, pledge_plan, logged_by)
    values (e.id, v_amount, coalesce(p_payload->>'method', 'cash'), nullif(trim(p_payload->>'donor_name'), ''), nullif(trim(p_payload->>'donor_email'), ''),
            coalesce((p_payload->>'anonymous')::boolean, false), coalesce((p_payload->>'show_name')::boolean, false),
            nullif(trim(p_payload->>'table_label'), ''),
            case when p_payload->>'method' = 'pledge' then 'pledged' when coalesce(p_payload->>'method', 'cash') in ('cash', 'check') and p_role <> 'team' then 'unconfirmed' else 'confirmed' end,
            nullif(trim(p_payload->>'pledge_plan'), ''), p_actor)
    returning id into v_id;
    if coalesce((p_payload->>'tell_mc')::boolean, false) then
      insert into public.event_messages (event_id, from_label, from_role, to_role, body, urgent)
      values (e.id, p_actor, p_role, 'mc',
              case when coalesce((p_payload->>'anonymous')::boolean, false) or coalesce(trim(p_payload->>'donor_name'), '') = '' then 'Anonymous' else trim(p_payload->>'donor_name') end
              || ' gave $' || to_char(v_amount / 100.0, 'FM999,999,990') || ' ' || coalesce(p_payload->>'method', 'cash')
              || coalesce(' at table ' || nullif(trim(p_payload->>'table_label'), ''), ''), false);
    end if;
    return json_build_object('ok', true, 'gift_id', v_id);
  elsif p_action = 'confirm_gift' or p_action = 'void_gift' then
    if p_role <> 'team' then raise exception 'not allowed'; end if;
    update public.event_gifts set status = case when p_action = 'void_gift' then 'void' else 'confirmed' end
     where id = (p_payload->>'gift_id')::uuid and event_id = e.id;
  elsif p_action = 'message' then
    if coalesce(trim(p_payload->>'body'), '') = '' then raise exception 'Write a message'; end if;
    insert into public.event_messages (event_id, from_label, from_role, to_role, body, urgent, kind, change)
    values (e.id, p_actor, p_role, coalesce(p_payload->>'to', 'mc'), left(trim(p_payload->>'body'), 500),
            coalesce((p_payload->>'urgent')::boolean, false),
            case when p_payload ? 'change' then 'change_request' else 'message' end, p_payload->'change')
    returning * into m;
    return json_build_object('ok', true, 'message_id', m.id);
  elsif p_action in ('ack', 'approve', 'decline') then
    if p_role not in ('team', 'mc', 'podium') then raise exception 'not allowed'; end if;
    select * into m from public.event_messages where id = (p_payload->>'message_id')::uuid and event_id = e.id;
    if m.id is null then raise exception 'Message not found'; end if;
    update public.event_messages set status = case p_action when 'ack' then 'ack' when 'approve' then 'approved' else 'declined' end, acted_at = now() where id = m.id;
    if p_action = 'approve' and m.change is not null and m.change->>'type' = 'extend' then
      update public.events set segment_extra_min = segment_extra_min + coalesce((m.change->>'minutes')::int, 5) where id = e.id;
    end if;
  elsif p_action = 'check_in' or p_action = 'undo_check_in' then
    if p_role not in ('team', 'registration') then raise exception 'not allowed'; end if;
    update public.event_attendees set checked_in_at = case when p_action = 'check_in' then now() else null end,
      checked_in_by = case when p_action = 'check_in' then p_actor else null end
     where event_id = e.id and (id::text = p_payload->>'attendee_id' or code = upper(trim(p_payload->>'code')));
    if not found then raise exception 'Ticket not found for this event'; end if;
  elsif p_action = 'add_guest' then
    if p_role not in ('team', 'registration') then raise exception 'not allowed'; end if;
    if coalesce(trim(p_payload->>'name'), '') = '' then raise exception 'Enter the guest''s name'; end if;
    insert into public.event_attendees (event_id, name, email, table_label, diet, ticket_type_id, checked_in_at, checked_in_by)
    values (e.id, trim(p_payload->>'name'), nullif(trim(p_payload->>'email'), ''), nullif(trim(p_payload->>'table_label'), ''),
            nullif(trim(p_payload->>'diet'), ''), nullif(p_payload->>'ticket_type_id', '')::uuid,
            case when coalesce((p_payload->>'check_in')::boolean, true) then now() end, p_actor)
    returning id into v_id;
    return json_build_object('ok', true, 'attendee_id', v_id);
  else
    raise exception 'Unknown action';
  end if;
  return json_build_object('ok', true);
end $$;
revoke all on function public.event_apply(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.event_totals(uuid) from public, anon;
grant execute on function public.event_totals(uuid) to authenticated;

-- ── Devices ─────────────────────────────────────────────────────────────
create or replace function public.event_device_register(p_device_token text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v public.event_devices; v_code text;
begin
  delete from public.event_devices where paired_at is null and created_at < now() - interval '2 days';
  if p_device_token is not null then select * into v from public.event_devices where device_token = p_device_token; end if;
  if v.id is not null and v.paired_at is not null then
    return json_build_object('device_token', v.device_token, 'paired', true, 'role', v.role);
  end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.event_devices where pair_code = v_code);
  end loop;
  if v.id is null then
    insert into public.event_devices (device_token, pair_code, pair_expires_at)
    values (encode(extensions.gen_random_bytes(24), 'hex'), v_code, now() + interval '30 minutes') returning * into v;
  else
    update public.event_devices set pair_code = v_code, pair_expires_at = now() + interval '30 minutes' where id = v.id returning * into v;
  end if;
  return json_build_object('device_token', v.device_token, 'paired', false, 'pair_code', v.pair_code);
end $$;
grant execute on function public.event_device_register(text) to anon, authenticated;

create or replace function public.event_device_claim(p_code text, p_event uuid, p_role text, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.event_team_ok(p_event) then raise exception 'You can''t add devices to this event'; end if;
  if p_role not in ('stage', 'podium', 'mc', 'registration', 'volunteer') then raise exception 'Pick a role'; end if;
  update public.event_devices
     set event_id = p_event, role = p_role, name = coalesce(nullif(trim(p_name), ''), initcap(p_role)),
         paired_at = now(), pair_code = null, pair_expires_at = null
   where pair_code = trim(p_code) and pair_expires_at > now()
  returning id into v_id;
  if v_id is null then raise exception 'That code didn''t match a device. Check the screen for the current code.'; end if;
  return v_id;
end $$;
revoke all on function public.event_device_claim(text, uuid, text, text) from public, anon;
grant execute on function public.event_device_claim(text, uuid, text, text) to authenticated;

-- Change a linked device's role or name from the dashboard.
create or replace function public.event_device_update(p_device uuid, p_role text, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_devices where id = p_device;
  if v_event is null or not public.event_team_ok(v_event) then raise exception 'not allowed'; end if;
  if p_role not in ('stage', 'podium', 'mc', 'registration', 'volunteer') then raise exception 'Pick a role'; end if;
  update public.event_devices set role = p_role, name = coalesce(nullif(trim(p_name), ''), initcap(p_role)) where id = p_device;
end $$;
revoke all on function public.event_device_update(uuid, text, text) from public, anon;
grant execute on function public.event_device_update(uuid, text, text) to authenticated;

create or replace function public.event_device_state(p_device_token text)
returns json language plpgsql security definer set search_path = '' as $$
declare v public.event_devices;
begin
  update public.event_devices set last_seen_at = now() where device_token = p_device_token returning * into v;
  if v.id is null then return json_build_object('status', 'unknown'); end if;
  if v.paired_at is null then return json_build_object('status', 'unpaired', 'pair_code', v.pair_code); end if;
  return (jsonb_build_object('status', 'paired', 'role', v.role, 'name', v.name) || public.event_state_json(v.event_id, v.role)::jsonb)::json;
end $$;
grant execute on function public.event_device_state(text) to anon, authenticated;

create or replace function public.event_device_act(p_device_token text, p_action text, p_payload jsonb default '{}'::jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare v public.event_devices;
begin
  select * into v from public.event_devices where device_token = p_device_token and paired_at is not null;
  if v.id is null then raise exception 'This device isn''t linked to an event'; end if;
  return public.event_apply(v.event_id, v.role, coalesce(v.name, initcap(v.role)), p_action, p_payload);
end $$;
grant execute on function public.event_device_act(text, text, jsonb) to anon, authenticated;

-- Registration desk: find a guest.
create or replace function public.event_device_attendees(p_device_token text, p_query text)
returns table (id uuid, name text, email text, table_label text, diet text, code text, kind text, checked_in_at timestamptz, ticket text, order_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v public.event_devices;
begin
  select * into v from public.event_devices d where d.device_token = p_device_token and d.paired_at is not null and d.role = 'registration';
  if v.id is null then raise exception 'not allowed'; end if;
  return query select a.id, a.name, a.email, a.table_label, a.diet, a.code, a.kind, a.checked_in_at, t.name, a.order_id
    from public.event_attendees a left join public.event_ticket_types t on t.id = a.ticket_type_id
   where a.event_id = v.event_id
     and (coalesce(trim(p_query), '') = '' or a.name ilike '%' || trim(p_query) || '%' or a.email ilike '%' || trim(p_query) || '%' or a.code = upper(trim(p_query)))
   order by a.checked_in_at nulls first, a.name limit 50;
end $$;
grant execute on function public.event_device_attendees(text, text) to anon, authenticated;

-- ── Team (dashboard live control) ───────────────────────────────────────
create or replace function public.event_team_state(p_event uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.event_team_ok(p_event) then raise exception 'not allowed'; end if;
  return (public.event_state_json(p_event, 'team')::jsonb || jsonb_build_object('devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'role', d.role, 'name', d.name, 'last_seen_at', d.last_seen_at) order by d.role, d.name)
    from public.event_devices d where d.event_id = p_event and d.paired_at is not null), '[]'::jsonb)))::json;
end $$;
revoke all on function public.event_team_state(uuid) from public, anon;
grant execute on function public.event_team_state(uuid) to authenticated;

create or replace function public.event_team_act(p_event uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.event_team_ok(p_event) then raise exception 'not allowed'; end if;
  select coalesce(nullif(p.full_name, ''), 'Team') into v_name from public.profiles p where p.id = auth.uid();
  return public.event_apply(p_event, 'team', coalesce(v_name, 'Team'), p_action, p_payload);
end $$;
revoke all on function public.event_team_act(uuid, text, jsonb) from public, anon;
grant execute on function public.event_team_act(uuid, text, jsonb) to authenticated;

-- ── Public (guests) ─────────────────────────────────────────────────────
create or replace function public.event_public(p_slug text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', e.id, 'slug', e.slug, 'title', e.title, 'kind', e.kind, 'status', e.status, 'starts_at', e.starts_at, 'doors_at', e.doors_at,
    'venue', e.venue, 'address', e.address, 'about', e.about, 'cover_url', e.cover_url, 'in_person', e.in_person, 'online', e.online,
    'ask_names', e.ask_names, 'ask_diet', e.ask_diet, 'checkout_gift', e.checkout_gift, 'fundraiser_id', e.fundraiser_id,
    'org', json_build_object('id', o.id, 'name', o.org_name, 'logo_url', o.logo_url),
    'tickets', coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents,
                          'kind', t.kind, 'seats', t.seats, 'deductible_cents', t.deductible_cents,
                          'remaining', case when t.quantity is null then null else greatest(0, t.quantity - coalesce((
                              select sum((i->>'qty')::int) from public.event_orders eo, jsonb_array_elements(eo.items) i
                              where eo.event_id = e.id and (eo.status = 'paid' or (eo.status = 'pending' and eo.created_at > now() - interval '20 minutes'))
                                and (i->>'ticket_type_id')::uuid = t.id), 0)) end)
                        order by t.sort, t.price_cents desc) from public.event_ticket_types t where t.event_id = e.id and t.active), '[]'::json),
    'program', coalesce((select json_agg(json_build_object('title', s.title, 'speaker', s.speaker, 'kind', s.kind, 'minutes', s.minutes, 'remote', s.remote) order by s.sort, s.created_at)
                         from public.event_segments s where s.event_id = e.id), '[]'::json))
  from public.events e join public.organizations o on o.id = e.org_id
  where e.slug = p_slug and e.status in ('published', 'live', 'ended');
$$;
grant execute on function public.event_public(text) to anon, authenticated;

-- Give page and online seats: where the night stands.
create or replace function public.event_live_public(p_slug text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'status', e.status, 'ladder', e.ladder, 'ladder_index', e.ladder_index,
    'match_by', e.match_by, 'online_watch_token', case when e.online then e.online_watch_token end,
    'org_name', (select org_name from public.organizations where id = e.org_id),
    'current', (select json_build_object('title', s.title, 'speaker', s.speaker, 'kind', s.kind) from public.event_segments s where s.id = e.current_segment_id),
    'totals', (select (public.event_totals(e.id)::jsonb - 'by_method' - 'unconfirmed_cents' - 'checked_in' - 'attendees' - 'online_attendees')::json))
  from public.events e where e.slug = p_slug and e.status in ('published', 'live', 'ended');
$$;
grant execute on function public.event_live_public(text) to anon, authenticated;

-- A buyer's tickets (by the private link in their confirmation).
create or replace function public.event_order_public(p_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('order', json_build_object('id', o.id, 'status', o.status, 'buyer_name', o.buyer_name, 'total_cents', o.total_cents,
                                                      'gift_cents', o.gift_cents, 'test_mode', o.test_mode, 'paid_at', o.paid_at),
    'event', json_build_object('slug', e.slug, 'title', e.title, 'starts_at', e.starts_at, 'doors_at', e.doors_at, 'venue', e.venue, 'address', e.address,
                               'online', e.online, 'org_name', (select org_name from public.organizations where id = e.org_id)),
    'attendees', coalesce((select json_agg(json_build_object('name', a.name, 'code', a.code, 'kind', a.kind, 'table_label', a.table_label, 'diet', a.diet,
                                                             'ticket', t.name, 'checked_in', a.checked_in_at is not null) order by a.created_at)
                           from public.event_attendees a left join public.event_ticket_types t on t.id = a.ticket_type_id where a.order_id = o.id), '[]'::json))
  from public.event_orders o join public.events e on e.id = o.event_id where o.token = p_token;
$$;
grant execute on function public.event_order_public(text) to anon, authenticated;

-- My events (dashboard list) for an organization.
create or replace function public.org_events(p_org uuid)
returns table (id uuid, slug text, title text, kind text, status text, starts_at timestamptz, venue text, goal_cents bigint, sold bigint, raised_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org) then raise exception 'not allowed'; end if;
  return query select e.id, e.slug, e.title, e.kind, e.status, e.starts_at, e.venue, e.goal_cents,
    (select count(*) from public.event_attendees a where a.event_id = e.id),
    e.pre_raised_cents + coalesce((select sum(g.amount_cents) from public.event_gifts g where g.event_id = e.id and g.status not in ('void', 'pending')), 0)
    from public.events e where e.org_id = p_org order by coalesce(e.starts_at, e.created_at) desc;
end $$;
revoke all on function public.org_events(uuid) from public, anon;
grant execute on function public.org_events(uuid) to authenticated;
