-- Profile claims: speakers (and soon businesses) whose profiles Siqa curated
-- from public material are marked "unclaimed" until the real person or an
-- authorized representative claims them and an admin approves.
--
--  * speakers.is_claimed  — false = curated by Siqa, not run by the speaker
--  * profile_claims       — one row per claim request, any entity type
--  * submit_profile_claim / approve_profile_claim / reject_profile_claim
--
-- Businesses: entity_type 'business' is accepted and reviewed the same way.
-- Approving one marks the claim approved and notifies the claimant; handing
-- over ownership is wired up once the business table is final (see the
-- 'business' branch in approve_profile_claim).

-- ── speakers.is_claimed ──────────────────────────────────────────────
alter table public.speakers add column if not exists is_claimed boolean not null default true;
alter table public.speakers add column if not exists claimed_at timestamptz;

-- Everything Siqa seeded (no account, or a placeholder *.seeded account) is unclaimed.
update public.speakers s
   set is_claimed = false
 where s.profile_id is null
    or exists (select 1 from auth.users u where u.id = s.profile_id and u.email like '%.seeded');

-- Keep is_claimed/claimed_at server-controlled, like the other guarded columns.
create or replace function public.guard_speakers()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    raise exception 'Speaker profiles are created when an application is approved.' using errcode = '42501';
  end if;
  new.is_verified := old.is_verified;
  new.approval_status := old.approval_status;
  new.approved_at := old.approved_at;
  new.approved_by := old.approved_by;
  new.follower_count := old.follower_count;
  new.total_raised := old.total_raised;
  new.events_count := old.events_count;
  new.display_name := old.display_name;   -- renames go through an admin (impersonation)
  new.profile_id := old.profile_id;
  new.is_claimed := old.is_claimed;
  new.claimed_at := old.claimed_at;
  return new;
end $$;

-- ── profile_claims ───────────────────────────────────────────────────
create table if not exists public.profile_claims (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null check (entity_type in ('speaker', 'business')),
  entity_id         uuid not null,
  entity_name       text,
  claimant_id       uuid not null references auth.users(id) on delete cascade,
  relationship      text not null check (relationship in ('self', 'representative')),
  full_name         text not null,
  title             text,
  contact_email     text not null,
  contact_phone     text,
  official_link     text,
  verification_method text check (verification_method in ('official_email', 'social_post', 'other')),
  verification_code text not null,
  notes             text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  rejection_reason  text,
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists profile_claims_entity on public.profile_claims (entity_type, entity_id, status);
create index if not exists profile_claims_claimant on public.profile_claims (claimant_id, created_at desc);
create unique index if not exists profile_claims_one_open_per_person
  on public.profile_claims (entity_type, entity_id, claimant_id) where status = 'pending';

alter table public.profile_claims enable row level security;

drop policy if exists profile_claims_own_read on public.profile_claims;
create policy profile_claims_own_read on public.profile_claims
  for select using (claimant_id = auth.uid() or public.is_siqa_admin());

-- Writes only through the functions below.
revoke insert, update, delete on public.profile_claims from anon, authenticated;
grant select on public.profile_claims to authenticated;

-- ── submit ───────────────────────────────────────────────────────────
create or replace function public.submit_profile_claim(
  p_entity_type text,
  p_entity_id uuid,
  p_relationship text,
  p_full_name text,
  p_title text,
  p_contact_email text,
  p_contact_phone text,
  p_official_link text,
  p_verification_method text,
  p_notes text
) returns public.profile_claims
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_row  public.profile_claims;
  v_code text := 'SIQA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  if v_uid is null then
    raise exception 'Sign in to claim a profile.' using errcode = '42501';
  end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_contact_email), '') = '' then
    raise exception 'Name and contact email are required.' using errcode = '22023';
  end if;

  if p_entity_type = 'speaker' then
    select display_name into v_name from speakers where id = p_entity_id and approval_status = 'approved';
    if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;
    if exists (select 1 from speakers where id = p_entity_id and is_claimed) then
      raise exception 'This profile has already been claimed.' using errcode = '23505';
    end if;
    if exists (select 1 from speakers where profile_id = v_uid) then
      raise exception 'Your account already runs a speaker profile. Contact Siqa if you manage more than one.' using errcode = '23505';
    end if;
  elsif p_entity_type = 'business' then
    v_name := null;  -- filled in by the business pages once the table is final
  else
    raise exception 'Unknown profile type.' using errcode = '22023';
  end if;

  if exists (select 1 from profile_claims where entity_type = p_entity_type and entity_id = p_entity_id
                and claimant_id = v_uid and status = 'pending') then
    raise exception 'You already have a claim waiting for review on this profile.' using errcode = '23505';
  end if;

  insert into profile_claims (entity_type, entity_id, entity_name, claimant_id, relationship, full_name, title,
                              contact_email, contact_phone, official_link, verification_method, verification_code, notes)
  values (p_entity_type, p_entity_id, v_name, v_uid,
          case when p_relationship = 'representative' then 'representative' else 'self' end,
          left(trim(p_full_name), 200), nullif(left(trim(coalesce(p_title, '')), 200), ''),
          left(trim(p_contact_email), 320), nullif(left(trim(coalesce(p_contact_phone, '')), 40), ''),
          nullif(left(trim(coalesce(p_official_link, '')), 500), ''),
          case when p_verification_method in ('official_email', 'social_post', 'other') then p_verification_method else 'other' end,
          v_code, nullif(left(trim(coalesce(p_notes, '')), 2000), ''))
  returning * into v_row;

  -- Let admins know there's something to review.
  insert into notifications (profile_id, type, title, body, data)
  select p.id, 'profile_claim', 'New profile claim',
         v_row.full_name || ' wants to claim ' || coalesce(v_name, 'a ' || p_entity_type || ' profile') || '.',
         jsonb_build_object('claim_id', v_row.id, 'entity_type', p_entity_type, 'entity_id', p_entity_id)
    from profiles p where p.role = 'admin';

  return v_row;
end $$;

-- ── approve ──────────────────────────────────────────────────────────
create or replace function public.approve_profile_claim(p_claim_id uuid)
returns public.profile_claims
language plpgsql security definer set search_path = public as $$
declare
  v_claim public.profile_claims;
  v_old_owner uuid;
begin
  if not public.is_siqa_admin() then
    raise exception 'Only Siqa admins can approve claims.' using errcode = '42501';
  end if;

  select * into v_claim from profile_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found.' using errcode = 'P0002'; end if;
  if v_claim.status <> 'pending' then raise exception 'This claim was already %.', v_claim.status using errcode = '22023'; end if;

  if v_claim.entity_type = 'speaker' then
    if exists (select 1 from speakers where profile_id = v_claim.claimant_id and id <> v_claim.entity_id) then
      raise exception 'That account already runs another speaker profile.' using errcode = '23505';
    end if;
    select profile_id into v_old_owner from speakers where id = v_claim.entity_id;

    -- Followers point at the speaker's account; move them from the
    -- placeholder account to the real one (skipping duplicates).
    if v_old_owner is not null and v_old_owner <> v_claim.claimant_id then
      insert into follows (follower_id, following_id, created_at)
      select f.follower_id, v_claim.claimant_id, f.created_at
        from follows f
       where f.following_id = v_old_owner
         and f.follower_id <> v_claim.claimant_id
         and not exists (select 1 from follows x where x.follower_id = f.follower_id and x.following_id = v_claim.claimant_id);
      delete from follows where following_id = v_old_owner;
    end if;

    update speakers
       set profile_id = v_claim.claimant_id,
           is_claimed = true,
           claimed_at = now(),
           is_verified = true,
           approval_status = 'approved',
           approved_at = coalesce(approved_at, now()),
           approved_by = auth.uid()
     where id = v_claim.entity_id;
    -- Once claimed, show the real follower count (seeded profiles carried placeholder numbers).
    update speakers
       set follower_count = (select count(*) from follows where following_id = v_claim.claimant_id)
     where id = v_claim.entity_id;
    update profiles set role = 'speaker' where id = v_claim.claimant_id and coalesce(role, 'viewer') = 'viewer';
  elsif v_claim.entity_type = 'business' then
    -- Ownership hand-off for businesses goes here once the business table is final.
    null;
  end if;

  update profile_claims
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_claim_id
  returning * into v_claim;

  -- Anyone else waiting on the same profile is turned down.
  update profile_claims
     set status = 'rejected', rejection_reason = 'Another claim for this profile was approved.',
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where entity_type = v_claim.entity_type and entity_id = v_claim.entity_id
     and status = 'pending' and id <> p_claim_id;

  insert into notifications (profile_id, type, title, body, data)
  values (v_claim.claimant_id, 'profile_claim_approved', 'Your claim was approved',
          'You now manage ' || coalesce(v_claim.entity_name, 'this profile') || ' on Siqa.',
          jsonb_build_object('claim_id', v_claim.id, 'entity_type', v_claim.entity_type, 'entity_id', v_claim.entity_id));

  return v_claim;
end $$;

-- ── reject ───────────────────────────────────────────────────────────
create or replace function public.reject_profile_claim(p_claim_id uuid, p_reason text default null)
returns public.profile_claims
language plpgsql security definer set search_path = public as $$
declare
  v_claim public.profile_claims;
begin
  if not public.is_siqa_admin() then
    raise exception 'Only Siqa admins can review claims.' using errcode = '42501';
  end if;
  update profile_claims
     set status = 'rejected', rejection_reason = nullif(left(trim(coalesce(p_reason, '')), 1000), ''),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_claim_id and status = 'pending'
  returning * into v_claim;
  if not found then raise exception 'Claim not found or already reviewed.' using errcode = 'P0002'; end if;

  insert into notifications (profile_id, type, title, body, data)
  values (v_claim.claimant_id, 'profile_claim_rejected', 'Your claim wasn''t approved',
          coalesce(v_claim.rejection_reason, 'We couldn''t verify this claim. Reply to Siqa support with more proof to try again.'),
          jsonb_build_object('claim_id', v_claim.id, 'entity_type', v_claim.entity_type, 'entity_id', v_claim.entity_id));
  return v_claim;
end $$;

revoke all on function public.submit_profile_claim(text, uuid, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.approve_profile_claim(uuid) from public, anon;
revoke all on function public.reject_profile_claim(uuid, text) from public, anon;
grant execute on function public.submit_profile_claim(text, uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.approve_profile_claim(uuid) to authenticated;
grant execute on function public.reject_profile_claim(uuid, text) to authenticated;
