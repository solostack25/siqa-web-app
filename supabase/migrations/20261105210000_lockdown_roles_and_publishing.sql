-- ============================================================================
-- Siqa security lockdown (2026-11-05, pre-launch)
--
-- Model: anyone can sign up as a viewer/shopper. Speakers, organizations and
-- sellers APPLY; an admin approves. Approval, verification, Stripe and
-- counter fields can only be changed by an admin, a moderator, or the server
-- (service role / database triggers / dashboard SQL) — never by the user.
-- Publishing is gated in the database, not just the UI:
--   * Gems (videos) publish only for approved + verified speakers
--   * Seeds (fundraisers) go live only for verified orgs / approved speakers
--   * Live events only for approved + verified speakers
--
-- "Privileged" = the request is NOT from the anon/authenticated API roles
-- (i.e. service role, triggers running as owner, dashboard SQL), or the
-- user is a Siqa admin (profiles.role admin/owner/moderator/super_admin) or
-- an active SoloStack moderator. Same rule the existing marketplace guards use.
-- ============================================================================

create or replace function public.siqa_is_privileged()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user not in ('anon', 'authenticated')
      or public.is_siqa_admin()
      or public.is_solostack_moderator();
$$;
-- SECURITY INVOKER on purpose: current_user must be the caller's role.

-- ── 1. Close open policies ───────────────────────────────────────────────

-- Any signed-in user could edit ANY organization (incl. Stripe account).
drop policy if exists organizations_update_own on public.organizations;
-- Any signed-in user could edit ANY org application.
drop policy if exists org_applications_update on public.org_applications;
-- Users could create their own speaker profile and publish immediately.
-- Speaker rows are now created by an admin when approving an application.
drop policy if exists speakers_insert_auth on public.speakers;
-- Anyone (even signed out) could insert donations, inflating Seed totals.
-- Donations are written by the stripe-webhook function (service role) only.
drop policy if exists donations_insert_auth on public.donations;
-- Public read exposed every donor's email. Replaced by own/org/admin read
-- plus the public_donations view below (no emails, anonymous respected).
drop policy if exists donations_public_read on public.donations;
create policy donations_read_own_or_org on public.donations
  for select using (
    donor_profile_id = auth.uid()
    or org_id in (select id from public.organizations where profile_id = auth.uid())
    or public.siqa_is_privileged()
  );
-- Anyone could create a notification addressed to any user.
-- Triggers and functions (which bypass RLS) still create them.
drop policy if exists notifications_service_insert on public.notifications;
-- Command Center leads (names, emails, phones) were readable/writable by anyone.
drop policy if exists "Employees can manage manual leads" on public.manual_leads;
create policy manual_leads_employees on public.manual_leads
  for all using (public.is_solostack_employee()) with check (public.is_solostack_employee());
-- Orders and order donations are created by checkout/webhook functions only.
drop policy if exists "Users can create their own marketplace orders" on public.marketplace_orders;
drop policy if exists "Service can insert donations" on public.marketplace_donations;
-- Looser duplicate that showed products from unapproved shops.
drop policy if exists "Active marketplace products are publicly viewable" on public.marketplace_products;

-- Public donation feed for Seed pages: no emails, no Stripe ids, and
-- anonymous donors shown as "Anonymous".
create or replace view public.public_donations as
  select id, fundraiser_id, org_id, live_event_id,
         case when coalesce(is_anonymous, false) then 'Anonymous' else donor_name end as donor_name,
         amount, currency, is_anonymous, message, created_at, status
  from public.donations
  where status = 'completed';
grant select on public.public_donations to anon, authenticated;

-- Livestream keys were readable by anyone (stream hijacking). Hide the
-- column from the API roles; the server (service role) still reads it.
revoke select on public.live_events from anon, authenticated;
grant select (id, speaker_id, fundraiser_id, title, description, playback_id, status,
              viewer_count, peak_viewer_count, total_raised, scheduled_at, started_at,
              ended_at, recording_url, created_at)
  on public.live_events to anon, authenticated;

-- Moderation status for Gems (admin "Reject" and report removal already
-- write videos.status, but the column didn't exist, so both failed).
alter table public.videos add column if not exists status text;

-- ── 2. Guard triggers ────────────────────────────────────────────────────

-- profiles: role and verification are set by admins only.
create or replace function public.guard_profiles()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.role := 'viewer'; new.is_verified := false; new.verified_at := null;
  else
    new.role := old.role; new.is_verified := old.is_verified; new.verified_at := old.verified_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_admin_role on public.profiles;
drop function if exists public.guard_profile_admin_role();
drop trigger if exists guard_profiles on public.profiles;
create trigger guard_profiles before insert or update on public.profiles
  for each row execute function public.guard_profiles();

-- New accounts are always viewers; the signup role picker no longer grants
-- anything (signup metadata is user-controlled).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', 'viewer');
  return new;
end $$;

-- speakers: approval/verification/counters/name/owner are admin-only.
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
  return new;
end $$;
drop trigger if exists guard_speakers on public.speakers;
create trigger guard_speakers before insert or update on public.speakers
  for each row execute function public.guard_speakers();

-- organizations: verification, approval, Stripe, trust score, owner.
create or replace function public.guard_organizations()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.is_verified := false; new.ein_verified := false; new.approval_status := 'pending';
    new.stripe_account_id := null; new.stripe_onboarded := false; new.trust_score := 60;
    return new;
  end if;
  new.is_verified := old.is_verified;
  new.ein_verified := old.ein_verified;
  new.approval_status := old.approval_status;
  new.stripe_account_id := old.stripe_account_id;
  new.stripe_onboarded := old.stripe_onboarded;
  new.trust_score := old.trust_score;
  new.profile_id := old.profile_id;
  if coalesce(old.is_verified, false) then
    -- A verified org can't rename itself or swap its EIN (impersonation).
    new.org_name := old.org_name;
    new.ein := old.ein;
  end if;
  return new;
end $$;
drop trigger if exists guard_organizations on public.organizations;
create trigger guard_organizations before insert or update on public.organizations
  for each row execute function public.guard_organizations();

-- marketplace_sellers: approval and Stripe status.
create or replace function public.guard_marketplace_sellers()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pending'; new.approved_at := null; new.approved_by := null;
    new.stripe_account_id := null; new.stripe_onboarded := false; new.stripe_charges_enabled := false;
    return new;
  end if;
  new.approval_status := old.approval_status;
  new.approved_at := old.approved_at;
  new.approved_by := old.approved_by;
  new.stripe_account_id := old.stripe_account_id;
  new.stripe_onboarded := old.stripe_onboarded;
  new.stripe_charges_enabled := old.stripe_charges_enabled;
  new.user_id := old.user_id;
  return new;
end $$;
drop trigger if exists guard_marketplace_sellers on public.marketplace_sellers;
create trigger guard_marketplace_sellers before insert or update on public.marketplace_sellers
  for each row execute function public.guard_marketplace_sellers();

-- Legacy freelancer tables (unused, but locked the same way).
create or replace function public.guard_legacy_sellers()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pending'; new.approved_at := null; new.approved_by := null;
    new.rating := 0; new.review_count := 0; new.order_count := 0;
    return new;
  end if;
  new.approval_status := old.approval_status; new.approved_at := old.approved_at; new.approved_by := old.approved_by;
  new.rating := old.rating; new.review_count := old.review_count; new.order_count := old.order_count;
  return new;
end $$;
drop trigger if exists guard_legacy_sellers on public.sellers;
create trigger guard_legacy_sellers before insert or update on public.sellers
  for each row execute function public.guard_legacy_sellers();

create or replace function public.guard_legacy_listings()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'approved' then new.status := 'pending'; end if;
  elsif new.status = 'approved' and old.status is distinct from 'approved' then
    new.status := old.status;
  end if;
  return new;
end $$;
drop trigger if exists guard_legacy_listings on public.listings;
create trigger guard_legacy_listings before insert or update on public.listings
  for each row execute function public.guard_legacy_listings();

-- fundraisers (Seeds): totals come from donations; going live needs a
-- verified org or an approved speaker.
create or replace function public.guard_fundraisers()
returns trigger language plpgsql set search_path = public as $$
declare
  owner_ok boolean;
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.raised_amount := 0; new.donor_count := 0;
  else
    new.raised_amount := old.raised_amount; new.donor_count := old.donor_count;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select (exists (select 1 from public.organizations o
                     where o.id = new.org_id and coalesce(o.is_verified, false)))
        or (exists (select 1 from public.speakers s
                     where s.id = new.speaker_id and coalesce(s.is_verified, false)
                       and s.approval_status = 'approved'))
      into owner_ok;
    if not owner_ok then
      raise exception 'Your organization must be verified before a Seed can go live. Save it as a draft for now.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_fundraisers on public.fundraisers;
create trigger guard_fundraisers before insert or update on public.fundraisers
  for each row execute function public.guard_fundraisers();

-- videos (Gems): counters are server-only; publishing needs an approved,
-- verified speaker; moderators' "rejected" can't be undone by the speaker.
create or replace function public.guard_videos()
returns trigger language plpgsql set search_path = public as $$
declare
  speaker_ok boolean;
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.view_count := 0; new.like_count := 0; new.comment_count := 0; new.status := null;
  else
    new.view_count := old.view_count; new.like_count := old.like_count;
    new.comment_count := old.comment_count; new.status := old.status;
  end if;
  if coalesce(new.is_published, false)
     and (tg_op = 'INSERT' or not coalesce(old.is_published, false)) then
    if tg_op = 'UPDATE' and old.status = 'rejected' then
      raise exception 'This Gem was removed by a moderator and can''t be republished.' using errcode = '42501';
    end if;
    select exists (select 1 from public.speakers s
                    where s.id = new.speaker_id and coalesce(s.is_verified, false)
                      and s.approval_status = 'approved')
      into speaker_ok;
    if not speaker_ok then
      raise exception 'Your speaker account must be approved before you can publish Gems.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_videos on public.videos;
create trigger guard_videos before insert or update on public.videos
  for each row execute function public.guard_videos();

-- live_events: only approved speakers can create/run them.
create or replace function public.guard_live_events()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if not exists (select 1 from public.speakers s
                  where s.id = new.speaker_id and coalesce(s.is_verified, false)
                    and s.approval_status = 'approved') then
    raise exception 'Your speaker account must be approved before you can go live.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.total_raised := old.total_raised;
    new.stream_key := old.stream_key;
  end if;
  return new;
end $$;
drop trigger if exists guard_live_events on public.live_events;
create trigger guard_live_events before insert or update on public.live_events
  for each row execute function public.guard_live_events();

-- org_990s: verification is admin-only.
create or replace function public.guard_org_990s()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.verified_at := null; new.verified_by := null;
  else
    new.status := old.status; new.verified_at := old.verified_at; new.verified_by := old.verified_by;
  end if;
  return new;
end $$;
drop trigger if exists guard_org_990s on public.org_990s;
create trigger guard_org_990s before insert or update on public.org_990s
  for each row execute function public.guard_org_990s();

-- marketplace_orders: sellers may only move status forward
-- (paid → processing/shipped → completed; pending → cancelled).
-- Amounts, buyer, payout and Stripe fields can't be touched.
create or replace function public.guard_marketplace_orders()
returns trigger language plpgsql set search_path = public as $$
declare
  wanted text := new.status;
begin
  if tg_op <> 'UPDATE' or public.siqa_is_privileged() then return new; end if;
  new := jsonb_populate_record(old, jsonb_build_object('status', wanted));
  if wanted is distinct from old.status then
    if not (
      (old.status in ('paid', 'processing', 'shipped') and wanted in ('processing', 'shipped', 'completed'))
      or (old.status = 'pending' and wanted = 'cancelled')
    ) then
      raise exception 'Order status can''t change from % to %.', old.status, wanted using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_marketplace_orders on public.marketplace_orders;
create trigger guard_marketplace_orders before update on public.marketplace_orders
  for each row execute function public.guard_marketplace_orders();

-- ── 3. Function hygiene ──────────────────────────────────────────────────
-- Fixed search_path on SECURITY DEFINER functions (prevents search_path
-- hijacking), and trigger functions are not callable over the REST API.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'notify_followers_on_live','notify_speaker_on_booking','notify_on_follow','handle_new_user',
        'update_follower_count','update_video_like_count','update_fundraiser_totals',
        'update_video_comment_count','update_comment_like_count','update_updated_at',
        'auto_score_booking','update_org_trust_score','sync_video_comment_count',
        'notify_order_paid','update_thread_timestamp','prevent_blocked_messages',
        'guard_profiles','guard_speakers','guard_organizations','guard_marketplace_sellers',
        'guard_legacy_sellers','guard_legacy_listings','guard_fundraisers','guard_videos',
        'guard_live_events','guard_org_990s','guard_marketplace_orders',
        'guard_marketplace_order_cancel','guard_marketplace_product_sponsored')
  loop
    execute format('alter function %s set search_path = public', f.sig);
    if f.is_trigger then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
