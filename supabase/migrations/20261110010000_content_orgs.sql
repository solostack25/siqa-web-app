-- Content organizations (Yaqeen / AlMaghrib / Bayyinah-style publishers).
--
-- Two kinds of organization now:
--   nonprofit (default) — Seeds, services, projects. Profile videos live in
--                          public.org_videos and never reach Gems.
--   content             — publishes lectures by the scholars who teach there.
--                          Its videos are ordinary public.videos rows (so they
--                          show in Gems) with videos.org_id pointing at it.
--
-- Ownership vs. who's in it:
--   videos.speaker_id  = the scholar in the video (unchanged)
--   videos.org_id      = NULL  → the speaker's own channel
--                        set   → owned by that content org
--
-- speaker_affiliations records who teaches where. An org adds a scholar as
-- 'pending'; only the scholar (or a Siqa admin, for unclaimed profiles)
-- can confirm it.

-- ── Organization kind ───────────────────────────────────────────────
alter table public.organizations
  add column if not exists org_kind text not null default 'nonprofit';

alter table public.organizations drop constraint if exists organizations_org_kind_check;
alter table public.organizations
  add constraint organizations_org_kind_check check (org_kind in ('nonprofit', 'content'));

-- An approved org can't switch itself into a content publisher: that skips
-- the review content orgs get. Owners may set it while still pending.
create or replace function public.organizations_guard_kind()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.org_kind is distinct from old.org_kind
     and coalesce(old.approval_status, 'pending') <> 'pending'
     and not public.is_siqa_admin()
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Only the Siqa team can change an approved organization''s type';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_kind on public.organizations;
create trigger organizations_guard_kind
  before update on public.organizations
  for each row execute function public.organizations_guard_kind();

-- ── Affiliations ────────────────────────────────────────────────────
create table if not exists public.speaker_affiliations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  speaker_id    uuid references public.speakers(id) on delete cascade,
  -- For scholars not on Siqa yet; the Siqa team reaches out.
  invite_name   text check (invite_name is null or length(trim(invite_name)) between 1 and 120),
  invite_email  text check (invite_email is null or invite_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  title         text check (title is null or length(title) <= 80),
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'declined', 'ended')),
  sort_order    integer not null default 0,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  updated_at    timestamptz not null default now(),
  constraint speaker_affiliations_who check (speaker_id is not null or invite_name is not null)
);

create unique index if not exists speaker_affiliations_org_speaker
  on public.speaker_affiliations (org_id, speaker_id) where speaker_id is not null;
create index if not exists speaker_affiliations_speaker on public.speaker_affiliations (speaker_id, status);
create index if not exists speaker_affiliations_org on public.speaker_affiliations (org_id, status, sort_order);

comment on table public.speaker_affiliations is 'Which scholars teach with which content organization. Org adds (pending); scholar or Siqa admin confirms.';

create or replace function public.owns_speaker(p_speaker_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from speakers s
    where s.id = p_speaker_id and s.profile_id = auth.uid() and coalesce(s.is_claimed, true)
  );
$$;
revoke all on function public.owns_speaker(uuid) from public;
grant execute on function public.owns_speaker(uuid) to anon, authenticated;

create or replace function public.speaker_affiliations_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  privileged boolean := public.is_siqa_admin()
    or current_user in ('postgres', 'service_role', 'supabase_admin');
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not exists (select 1 from organizations o where o.id = new.org_id and o.org_kind = 'content') then
      raise exception 'Only content organizations can add scholars';
    end if;
    if new.status <> 'pending' and not privileged then
      new.status := 'pending';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Confirming or declining is the scholar's call (or Siqa's, for
    -- profiles nobody has claimed yet). The org can only end it.
    if new.status in ('confirmed', 'declined')
       and not (privileged or public.owns_speaker(new.speaker_id)) then
      raise exception 'Only the scholar can confirm or decline this';
    end if;
    if new.status in ('confirmed', 'declined') then
      new.responded_at := now();
    end if;
  end if;
  if (new.org_id is distinct from old.org_id or new.speaker_id is distinct from old.speaker_id)
     and not privileged then
    raise exception 'Remove this scholar and add them again instead';
  end if;
  return new;
end;
$$;

drop trigger if exists speaker_affiliations_guard on public.speaker_affiliations;
create trigger speaker_affiliations_guard
  before insert or update on public.speaker_affiliations
  for each row execute function public.speaker_affiliations_guard();

alter table public.speaker_affiliations enable row level security;

drop policy if exists speaker_affiliations_read on public.speaker_affiliations;
create policy speaker_affiliations_read on public.speaker_affiliations
  for select using (
    status = 'confirmed'
    or public.can_manage_org(org_id)
    or public.owns_speaker(speaker_id)
  );

drop policy if exists speaker_affiliations_org_insert on public.speaker_affiliations;
create policy speaker_affiliations_org_insert on public.speaker_affiliations
  for insert with check (public.can_manage_org(org_id));

drop policy if exists speaker_affiliations_update on public.speaker_affiliations;
create policy speaker_affiliations_update on public.speaker_affiliations
  for update using (public.can_manage_org(org_id) or public.owns_speaker(speaker_id))
  with check (public.can_manage_org(org_id) or public.owns_speaker(speaker_id));

drop policy if exists speaker_affiliations_delete on public.speaker_affiliations;
create policy speaker_affiliations_delete on public.speaker_affiliations
  for delete using (public.can_manage_org(org_id) or public.owns_speaker(speaker_id));

-- ── Video ownership ─────────────────────────────────────────────────
alter table public.videos
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists videos_org on public.videos (org_id, is_published, published_at desc)
  where org_id is not null;

comment on column public.videos.org_id is 'Owning content organization. NULL = the speaker''s own channel.';

-- A video can only be put under an org that is an approved content org
-- the speaker is confirmed with. Siqa admins and the sync job may set any.
create or replace function public.videos_guard_org()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.org_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.org_id is not distinct from old.org_id
     and new.speaker_id is not distinct from old.speaker_id then
    return new;
  end if;
  if public.is_siqa_admin() or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if not exists (
    select 1 from organizations o
    join speaker_affiliations a on a.org_id = o.id
    where o.id = new.org_id
      and o.org_kind = 'content'
      and o.approval_status = 'approved'
      and a.speaker_id = new.speaker_id
      and a.status = 'confirmed'
  ) then
    raise exception 'This speaker isn''t a confirmed scholar of that organization';
  end if;
  return new;
end;
$$;

drop trigger if exists videos_guard_org on public.videos;
create trigger videos_guard_org
  before insert or update of org_id, speaker_id on public.videos
  for each row execute function public.videos_guard_org();
