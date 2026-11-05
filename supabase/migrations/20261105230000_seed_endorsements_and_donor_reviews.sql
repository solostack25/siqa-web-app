-- ============================================================================
-- Seeds: speaker endorsements, donor reviews ("why I gave"), and updates.
--
--  * seed_endorsements — an org asks a verified speaker to vouch for a Seed;
--    the speaker writes the endorsement (the org can never write or edit it).
--    A verified speaker can also endorse a Seed unprompted.
--  * donation_reviews — after paying, a donor can say why they gave. A review
--    is only shown once it matches a completed donation (by Stripe payment
--    intent), so every public review comes from a real donor.
--  * fundraiser_updates — progress posts from the Seed's organizer.
--  * fundraisers gets per-Seed review settings.
--  * org_endorsements now requires an approved, verified speaker (it only
--    checked that the speaker row was yours).
-- ============================================================================

-- ── Helpers ───────────────────────────────────────────────────────────────

create or replace function public.siqa_owns_fundraiser(fid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.fundraisers f
    left join public.organizations o on o.id = f.org_id
    left join public.speakers s on s.id = f.speaker_id
    where f.id = fid
      and (o.profile_id = auth.uid() or s.profile_id = auth.uid())
  );
$$;

create or replace function public.siqa_my_speaker_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.speakers where profile_id = auth.uid();
$$;

create or replace function public.siqa_speaker_is_verified(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.speakers
    where id = sid and coalesce(is_verified, false) and approval_status = 'approved'
  );
$$;

-- ── Seed review settings ─────────────────────────────────────────────────

alter table public.fundraisers
  add column if not exists allow_reviews boolean not null default true,
  add column if not exists allow_anonymous_reviews boolean not null default true,
  add column if not exists review_prompt text,
  add column if not exists show_endorsements_on_donate boolean not null default true;

-- ── seed_endorsements ────────────────────────────────────────────────────

create table if not exists public.seed_endorsements (
  id uuid primary key default gen_random_uuid(),
  fundraiser_id uuid not null references public.fundraisers(id) on delete cascade,
  speaker_id uuid not null references public.speakers(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'endorsed', 'declined')),
  message text check (char_length(message) <= 200),
  connections text[] not null default '{}',
  video_url text,
  request_note text check (char_length(request_note) <= 500),
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (fundraiser_id, speaker_id)
);
create index if not exists seed_endorsements_speaker_status on public.seed_endorsements (speaker_id, status);
create index if not exists seed_endorsements_fundraiser_status on public.seed_endorsements (fundraiser_id, status);
alter table public.seed_endorsements enable row level security;

drop policy if exists seed_endorsements_read on public.seed_endorsements;
create policy seed_endorsements_read on public.seed_endorsements
  for select using (
    status = 'endorsed'
    or speaker_id in (select public.siqa_my_speaker_ids())
    or public.siqa_owns_fundraiser(fundraiser_id)
    or public.siqa_is_privileged()
  );

drop policy if exists seed_endorsements_insert on public.seed_endorsements;
create policy seed_endorsements_insert on public.seed_endorsements
  for insert with check (
    (status = 'requested' and public.siqa_owns_fundraiser(fundraiser_id))
    or (status = 'endorsed' and speaker_id in (select public.siqa_my_speaker_ids()))
    or public.siqa_is_privileged()
  );

drop policy if exists seed_endorsements_update on public.seed_endorsements;
create policy seed_endorsements_update on public.seed_endorsements
  for update using (
    speaker_id in (select public.siqa_my_speaker_ids()) or public.siqa_is_privileged()
  );

drop policy if exists seed_endorsements_delete on public.seed_endorsements;
create policy seed_endorsements_delete on public.seed_endorsements
  for delete using (
    speaker_id in (select public.siqa_my_speaker_ids())
    or (status = 'requested' and public.siqa_owns_fundraiser(fundraiser_id))
    or public.siqa_is_privileged()
  );

create or replace function public.guard_seed_endorsements()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;

  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    if new.status = 'requested' then
      -- The organizer only asks; the words belong to the speaker.
      new.message := null; new.connections := '{}'; new.video_url := null; new.responded_at := null;
    end if;
  else
    new.fundraiser_id := old.fundraiser_id;
    new.speaker_id := old.speaker_id;
    new.request_note := old.request_note;
    new.requested_by := old.requested_by;
    new.created_at := old.created_at;
  end if;

  if new.status = 'endorsed' then
    if not public.siqa_speaker_is_verified(new.speaker_id) then
      raise exception 'Only approved, verified speakers can endorse a Seed.' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'endorsed' then
      new.responded_at := now();
    end if;
  elsif new.status = 'declined' then
    new.message := null; new.video_url := null;
    new.responded_at := now();
  elsif tg_op = 'UPDATE' and old.status <> 'requested' then
    raise exception 'An endorsement can''t go back to a pending request.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_seed_endorsements on public.seed_endorsements;
create trigger guard_seed_endorsements before insert or update on public.seed_endorsements
  for each row execute function public.guard_seed_endorsements();

-- Tell the speaker they've been asked.
create or replace function public.notify_seed_endorsement_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  spk_profile uuid;
  seed_title text;
  org_name text;
begin
  if new.status <> 'requested' then return new; end if;
  select profile_id into spk_profile from public.speakers where id = new.speaker_id;
  select f.title, o.org_name into seed_title, org_name
    from public.fundraisers f left join public.organizations o on o.id = f.org_id
    where f.id = new.fundraiser_id;
  if spk_profile is not null then
    insert into public.notifications (profile_id, type, title, body, data)
    values (spk_profile, 'seed_endorsement_request',
            coalesce(org_name, 'An organization') || ' asked you to endorse a Seed',
            seed_title,
            jsonb_build_object('fundraiser_id', new.fundraiser_id, 'endorsement_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists notify_seed_endorsement_request on public.seed_endorsements;
create trigger notify_seed_endorsement_request after insert on public.seed_endorsements
  for each row execute function public.notify_seed_endorsement_request();

-- ── donation_reviews ─────────────────────────────────────────────────────

create table if not exists public.donation_reviews (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id text not null unique,
  fundraiser_id uuid not null references public.fundraisers(id) on delete cascade,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  reason text check (char_length(reason) <= 40),
  visibility text not null default 'full' check (visibility in ('full', 'name', 'anonymous')),
  via_speaker_id uuid references public.speakers(id) on delete set null,
  helpful_count integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists donation_reviews_fundraiser on public.donation_reviews (fundraiser_id, created_at desc);
alter table public.donation_reviews enable row level security;

-- Reads go through public_donation_reviews; the table itself is private.
drop policy if exists donation_reviews_read on public.donation_reviews;
create policy donation_reviews_read on public.donation_reviews
  for select using (
    reviewer_profile_id = auth.uid()
    or public.siqa_owns_fundraiser(fundraiser_id)
    or public.siqa_is_privileged()
  );

-- Guests can review too (Stripe checkout doesn't require an account); the
-- view only shows a review once its payment intent is a completed donation.
drop policy if exists donation_reviews_insert on public.donation_reviews;
create policy donation_reviews_insert on public.donation_reviews
  for insert with check (reviewer_profile_id is null or reviewer_profile_id = auth.uid());

drop policy if exists donation_reviews_update_admin on public.donation_reviews;
create policy donation_reviews_update_admin on public.donation_reviews
  for update using (public.siqa_is_privileged());

drop policy if exists donation_reviews_delete on public.donation_reviews;
create policy donation_reviews_delete on public.donation_reviews
  for delete using (reviewer_profile_id = auth.uid() or public.siqa_is_privileged());

create or replace function public.guard_donation_reviews()
returns trigger language plpgsql set search_path = public as $$
declare
  seed record;
  donation_seed uuid;
begin
  if public.siqa_is_privileged() then return new; end if;
  -- Only inserts reach here for non-privileged users (no update policy).
  new.reviewer_profile_id := auth.uid();
  new.helpful_count := 0;
  new.is_hidden := false;
  new.created_at := now();
  new.body := btrim(new.body);

  select allow_reviews, allow_anonymous_reviews into seed
    from public.fundraisers where id = new.fundraiser_id;
  if not found or not coalesce(seed.allow_reviews, true) then
    raise exception 'Reviews are turned off for this Seed.' using errcode = '42501';
  end if;
  if new.visibility = 'anonymous' and not coalesce(seed.allow_anonymous_reviews, true) then
    new.visibility := 'name';
  end if;

  select fundraiser_id into donation_seed
    from public.donations where stripe_payment_intent_id = new.payment_intent_id;
  if donation_seed is not null and donation_seed is distinct from new.fundraiser_id then
    raise exception 'This donation was for a different Seed.' using errcode = '42501';
  end if;

  -- "Came via" credit only for a speaker who actually endorsed this Seed.
  if new.via_speaker_id is not null and not exists (
    select 1 from public.seed_endorsements
    where fundraiser_id = new.fundraiser_id and speaker_id = new.via_speaker_id and status = 'endorsed'
  ) then
    new.via_speaker_id := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_donation_reviews on public.donation_reviews;
create trigger guard_donation_reviews before insert on public.donation_reviews
  for each row execute function public.guard_donation_reviews();

-- Public feed: only reviews tied to a completed donation for the same Seed.
-- Donor names follow the donation's own anonymity plus the review's choice;
-- the amount shows only when the donor chose "name and amount".
create or replace view public.public_donation_reviews as
  select r.id, r.fundraiser_id, f.org_id, f.title as fundraiser_title,
         r.body, r.reason, r.visibility,
         case when r.visibility = 'anonymous' or coalesce(d.is_anonymous, false) then 'Anonymous'
              else coalesce(nullif(btrim(d.donor_name), ''), 'A donor') end as display_name,
         case when r.visibility = 'full' and not coalesce(d.is_anonymous, false) then d.amount end as amount,
         r.via_speaker_id, s.display_name as via_speaker_name,
         r.helpful_count, r.created_at
  from public.donation_reviews r
  join public.donations d
    on d.stripe_payment_intent_id = r.payment_intent_id
   and d.status = 'completed'
   and d.fundraiser_id = r.fundraiser_id
  join public.fundraisers f on f.id = r.fundraiser_id
  left join public.speakers s on s.id = r.via_speaker_id
  where not r.is_hidden;
grant select on public.public_donation_reviews to anon, authenticated;

-- "Helpful" votes, one per person per review.
create table if not exists public.donation_review_votes (
  review_id uuid not null references public.donation_reviews(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, profile_id)
);
alter table public.donation_review_votes enable row level security;
drop policy if exists donation_review_votes_own on public.donation_review_votes;
create policy donation_review_votes_own on public.donation_review_votes
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.sync_review_helpful_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.donation_reviews
     set helpful_count = (select count(*) from public.donation_review_votes
                           where review_id = coalesce(new.review_id, old.review_id))
   where id = coalesce(new.review_id, old.review_id);
  return null;
end $$;
drop trigger if exists sync_review_helpful_count on public.donation_review_votes;
create trigger sync_review_helpful_count after insert or delete on public.donation_review_votes
  for each row execute function public.sync_review_helpful_count();

-- ── fundraiser_updates ───────────────────────────────────────────────────

create table if not exists public.fundraiser_updates (
  id uuid primary key default gen_random_uuid(),
  fundraiser_id uuid not null references public.fundraisers(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fundraiser_updates_fundraiser on public.fundraiser_updates (fundraiser_id, created_at desc);
alter table public.fundraiser_updates enable row level security;

drop policy if exists fundraiser_updates_read on public.fundraiser_updates;
create policy fundraiser_updates_read on public.fundraiser_updates for select using (true);
drop policy if exists fundraiser_updates_write on public.fundraiser_updates;
create policy fundraiser_updates_write on public.fundraiser_updates
  for insert with check (public.siqa_owns_fundraiser(fundraiser_id) or public.siqa_is_privileged());
drop policy if exists fundraiser_updates_delete on public.fundraiser_updates;
create policy fundraiser_updates_delete on public.fundraiser_updates
  for delete using (public.siqa_owns_fundraiser(fundraiser_id) or public.siqa_is_privileged());

create or replace function public.guard_fundraiser_updates()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
drop trigger if exists guard_fundraiser_updates on public.fundraiser_updates;
create trigger guard_fundraiser_updates before insert on public.fundraiser_updates
  for each row execute function public.guard_fundraiser_updates();

-- ── org_endorsements: verified speakers only ─────────────────────────────

drop policy if exists org_endorsements_insert_own on public.org_endorsements;
create policy org_endorsements_insert_own on public.org_endorsements
  for insert with check (
    speaker_id in (select public.siqa_my_speaker_ids())
    and public.siqa_speaker_is_verified(speaker_id)
  );
