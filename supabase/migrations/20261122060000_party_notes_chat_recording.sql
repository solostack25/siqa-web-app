-- Watch parties: shared discussion notes, saved chat, and recording the discussion with consent.
-- Recording is opt-in per person: anyone who says no (or doesn't answer) is moved to a hidden,
-- watch-and-chat-only seat while recording is on, so nothing of them is captured.
-- Everything lands on the party recap, visible to people with the party link.
-- (Applied to production 2026-11-22.)

alter table studio.sessions
  add column if not exists wp_record_status text not null default 'off' check (wp_record_status in ('off', 'asked', 'recording', 'done')),
  add column if not exists wp_recording_id text,
  add column if not exists wp_recording_bunny text,
  add column if not exists wp_chat jsonb not null default '[]'::jsonb,
  add column if not exists wp_notes jsonb not null default '[]'::jsonb;

create table if not exists studio.party_consent (
  session_id uuid not null references studio.sessions(id) on delete cascade,
  pkey text not null,              -- the participant (their device), so a rejoin keeps their answer
  name text,
  choice text not null check (choice in ('yes', 'no')),
  at timestamptz not null default now(),
  primary key (session_id, pkey)
);
alter table studio.party_consent enable row level security; -- reached only through the functions below

-- The party a token (invite link or watch link) belongs to.
create or replace function studio.party_by_token(p_token text)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from studio.sessions s
  where (s.guest_token = p_token or s.watch_token = p_token) and s.watch_video_id is not null
  limit 1;
$$;

create or replace function studio.party_host_ok(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from studio.sessions s where s.id = p_session and s.watch_video_id is not null
                 and (s.host_id = auth.uid() or public.studio_is_staff()));
$$;

-- Shared state now also carries the recording status and the notes.
create or replace function public.studio_watchparty_state(p_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'session_id', s.id, 'status', s.status, 'title', s.title,
    'playing', s.wp_playing, 'position', s.wp_position, 'at', s.wp_at, 'phase', s.wp_phase,
    'record', s.wp_record_status, 'notes', s.wp_notes,
    'server_now', now(),
    'video', json_build_object('id', v.id, 'title', v.title, 'platform', v.platform, 'platform_video_id', v.platform_video_id,
                               'video_url', v.video_url, 'thumbnail_url', v.thumbnail_url, 'duration_secs', v.duration_secs,
                               'speaker_name', sp.display_name))
  from studio.sessions s
  join public.videos v on v.id = s.watch_video_id
  left join public.speakers sp on sp.id = v.speaker_id
  where (s.watch_token = p_token or s.guest_token = p_token)
  limit 1;
$$;
grant execute on function public.studio_watchparty_state(text) to anon, authenticated;

-- Host: ask everyone / start / stop recording. Asking again clears earlier answers.
create or replace function public.studio_party_record(p_session uuid, p_status text, p_recording_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not studio.party_host_ok(p_session) then raise exception 'not allowed'; end if;
  if p_status not in ('off', 'asked', 'recording', 'done') then raise exception 'bad status'; end if;
  if p_status = 'asked' then delete from studio.party_consent where session_id = p_session; end if;
  update studio.sessions
     set wp_record_status = p_status,
         wp_recording_id = coalesce(p_recording_id, wp_recording_id),
         wp_recording_bunny = case when p_recording_id is not null then null else wp_recording_bunny end
   where id = p_session;
end $$;
revoke all on function public.studio_party_record(uuid, text, text) from public, anon;
grant execute on function public.studio_party_record(uuid, text, text) to authenticated;

-- Anyone in the party answers for themselves.
create or replace function public.studio_party_consent(p_token text, p_key text, p_name text, p_choice text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := studio.party_by_token(p_token);
begin
  if v_id is null then raise exception 'Party not found'; end if;
  if p_choice not in ('yes', 'no') or coalesce(p_key, '') = '' then raise exception 'bad answer'; end if;
  insert into studio.party_consent (session_id, pkey, name, choice) values (v_id, left(p_key, 120), left(p_name, 60), p_choice)
  on conflict (session_id, pkey) do update set choice = excluded.choice, name = excluded.name, at = now();
end $$;
grant execute on function public.studio_party_consent(text, text, text, text) to anon, authenticated;

-- Host sees who said yes / no.
create or replace function public.studio_party_consents(p_session uuid)
returns table (pkey text, name text, choice text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not studio.party_host_ok(p_session) then raise exception 'not allowed'; end if;
  return query select c.pkey, c.name, c.choice from studio.party_consent c where c.session_id = p_session order by c.at;
end $$;
revoke all on function public.studio_party_consents(uuid) from public, anon;
grant execute on function public.studio_party_consents(uuid) to authenticated;

-- One participant's own answer (so a rejoin knows it).
create or replace function public.studio_party_my_consent(p_token text, p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select c.choice from studio.party_consent c where c.session_id = studio.party_by_token(p_token) and c.pkey = p_key;
$$;
grant execute on function public.studio_party_my_consent(text, text) to anon, authenticated;

-- Discussion notes: anyone in the party adds a point; the host can remove one.
create or replace function public.studio_party_note_add(p_token text, p_name text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := studio.party_by_token(p_token);
begin
  if v_id is null then raise exception 'Party not found'; end if;
  if coalesce(trim(p_body), '') = '' then return; end if;
  update studio.sessions
     set wp_notes = wp_notes || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', left(coalesce(nullif(trim(p_name), ''), 'Someone'), 60),
                                                                     'body', left(trim(p_body), 500), 'at', now()))
   where id = v_id and jsonb_array_length(wp_notes) < 300;
end $$;
grant execute on function public.studio_party_note_add(text, text, text) to anon, authenticated;

create or replace function public.studio_party_note_delete(p_session uuid, p_note uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not studio.party_host_ok(p_session) then raise exception 'not allowed'; end if;
  update studio.sessions
     set wp_notes = coalesce((select jsonb_agg(n) from jsonb_array_elements(wp_notes) n where n->>'id' <> p_note::text), '[]'::jsonb)
   where id = p_session;
end $$;
revoke all on function public.studio_party_note_delete(uuid, uuid) from public, anon;
grant execute on function public.studio_party_note_delete(uuid, uuid) to authenticated;

-- Host's device saves the room chat as it goes (it has the whole history).
create or replace function public.studio_party_save_chat(p_session uuid, p_chat jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not studio.party_host_ok(p_session) then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_chat) <> 'array' or jsonb_array_length(p_chat) > 3000 then raise exception 'bad chat'; end if;
  update studio.sessions set wp_chat = p_chat where id = p_session;
end $$;
revoke all on function public.studio_party_save_chat(uuid, jsonb) from public, anon;
grant execute on function public.studio_party_save_chat(uuid, jsonb) to authenticated;

-- Recap for anyone with the party link.
create or replace function public.studio_party_recap(p_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'title', s.title, 'status', s.status, 'started_at', s.live_started_at, 'ended_at', s.ended_at,
    'notes', s.wp_notes, 'chat', s.wp_chat,
    'record', s.wp_record_status, 'recording_id', s.wp_recording_id, 'recording_bunny', s.wp_recording_bunny,
    'video', json_build_object('id', v.id, 'title', v.title, 'thumbnail_url', v.thumbnail_url, 'speaker_name', sp.display_name))
  from studio.sessions s
  join public.videos v on v.id = s.watch_video_id
  left join public.speakers sp on sp.id = v.speaker_id
  where s.id = studio.party_by_token(p_token);
$$;
grant execute on function public.studio_party_recap(text) to anon, authenticated;

-- The server saves where the recorded discussion landed in Bunny (once, and only for that recording).
create or replace function public.studio_party_set_bunny(p_token text, p_recording_id text, p_guid text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update studio.sessions set wp_recording_bunny = p_guid
   where id = studio.party_by_token(p_token) and wp_recording_id = p_recording_id and wp_recording_bunny is null;
end $$;
grant execute on function public.studio_party_set_bunny(text, text, text) to anon, authenticated;

-- Host's view of their party also carries the recording.
create or replace function public.studio_party_get(p_session uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('session_id', s.id, 'meeting_id', s.meeting_id, 'guest_token', s.guest_token, 'watch_token', s.watch_token,
                           'title', s.title, 'status', s.status, 'record', s.wp_record_status, 'recording_id', s.wp_recording_id)
  from studio.sessions s where s.id = p_session and s.host_id = auth.uid() and s.watch_video_id is not null;
$$;
