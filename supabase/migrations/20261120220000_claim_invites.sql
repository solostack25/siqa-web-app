-- Invite-to-claim links: Siqa reaches a speaker/org/business through an
-- official contact Siqa found itself, then sends a private one-time link.
-- Whoever opens it and signs in takes over the profile — no codes or forms.
--   create_claim_invite()  admin only, returns the link token (7 days, single use)
--   peek_claim_invite()    shows whose page the link is for (before sign-in)
--   redeem_claim_invite()  signed-in user accepts; approved like any claim
-- Only a SHA-256 of each token is stored.

create table if not exists public.claim_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  entity_type text not null check (entity_type in ('speaker', 'business', 'organization')),
  entity_id uuid not null,
  entity_name text,
  sent_to text,                      -- the official contact it was sent to (for your records)
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid,
  claim_id uuid,
  revoked boolean not null default false
);
alter table public.claim_invites enable row level security;
create policy claim_invites_admin_read on public.claim_invites for select using (public.is_siqa_admin());

-- Approval logic moved here unchanged so both the admin Approve button and an
-- accepted invite apply a claim the same way. Not callable by users directly.
create or replace function public.apply_profile_claim(p_claim_id uuid, p_reviewer uuid)
returns public.profile_claims
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_claim public.profile_claims;
  v_old_owner uuid;
  v_crawl public.crawl_islamic_orgs;
  v_org uuid;
begin
  select * into v_claim from profile_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found.' using errcode = 'P0002'; end if;
  if v_claim.status <> 'pending' then raise exception 'This claim was already %.', v_claim.status using errcode = '22023'; end if;
  if v_claim.entity_type = 'speaker' then
    if exists (select 1 from speakers where profile_id = v_claim.claimant_id and id <> v_claim.entity_id) then
      raise exception 'That account already runs another speaker profile.' using errcode = '23505';
    end if;
    select profile_id into v_old_owner from speakers where id = v_claim.entity_id;
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
       set profile_id = v_claim.claimant_id, is_claimed = true, claimed_at = now(), is_verified = true,
           approval_status = 'approved', approved_at = coalesce(approved_at, now()), approved_by = p_reviewer
     where id = v_claim.entity_id;
    update speakers
       set follower_count = (select count(*) from follows where following_id = v_claim.claimant_id)
     where id = v_claim.entity_id;
    update profiles set role = 'speaker' where id = v_claim.claimant_id and coalesce(role, 'viewer') = 'viewer';
  elsif v_claim.entity_type = 'organization' then
    select * into v_crawl from crawl_islamic_orgs where id = v_claim.entity_id for update;
    if not found then raise exception 'Organization not found.' using errcode = 'P0002'; end if;
    if v_crawl.claimed_org_id is not null then
      raise exception 'This organization has already been claimed.' using errcode = '23505';
    end if;
    if exists (select 1 from organizations where profile_id = v_claim.claimant_id) then
      raise exception 'That account already runs an organization on Siqa.' using errcode = '23505';
    end if;
    insert into organizations (profile_id, org_name, org_type, city, state, country, website, ein,
                               is_verified, ein_verified, approval_status, trust_score)
    values (v_claim.claimant_id, v_crawl.entity_name,
            case public.org_category(v_crawl.ntee_code) when 'masjid' then 'masjid' when 'education' then 'school' else 'nonprofit' end,
            v_crawl.city, v_crawl.state, 'US', v_crawl.url, v_crawl.ein,
            true, v_crawl.ein is not null, 'approved', 60)
    returning id into v_org;
    update crawl_islamic_orgs set claimed_org_id = v_org where id = v_crawl.id;
    update profiles set role = 'org' where id = v_claim.claimant_id and coalesce(role, 'viewer') = 'viewer';
  elsif v_claim.entity_type = 'business' then
    if exists (select 1 from business_listings where id = v_claim.entity_id and is_claimed) then
      raise exception 'This business has already been claimed.' using errcode = '23505';
    end if;
    update business_listings
       set owner_id = v_claim.claimant_id, is_claimed = true, is_verified = true
     where id = v_claim.entity_id;
  end if;
  update profile_claims
     set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now(), updated_at = now()
   where id = p_claim_id
  returning * into v_claim;
  update profile_claims
     set status = 'rejected', rejection_reason = 'Another claim for this profile was approved.',
         reviewed_by = p_reviewer, reviewed_at = now(), updated_at = now()
   where entity_type = v_claim.entity_type and entity_id = v_claim.entity_id
     and status = 'pending' and id <> p_claim_id;
  insert into notifications (profile_id, type, title, body, data)
  values (v_claim.claimant_id, 'profile_claim_approved', 'Your claim was approved',
          'You now manage ' || coalesce(v_claim.entity_name, 'this profile') || ' on Siqa.',
          jsonb_build_object('claim_id', v_claim.id, 'entity_type', v_claim.entity_type, 'entity_id', v_claim.entity_id,
                             'org_id', v_org));
  return v_claim;
end $function$;
revoke all on function public.apply_profile_claim(uuid, uuid) from public, anon, authenticated;

-- Admin Approve button: same behavior as before.
create or replace function public.approve_profile_claim(p_claim_id uuid)
returns public.profile_claims
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_siqa_admin() then
    raise exception 'Only Siqa admins can approve claims.' using errcode = '42501';
  end if;
  return public.apply_profile_claim(p_claim_id, auth.uid());
end $function$;

-- Name of the entity, or null if it doesn't exist / is already claimed.
create or replace function public.claimable_entity_name(p_entity_type text, p_entity_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_entity_type
    when 'speaker' then (select display_name from speakers where id = p_entity_id and not coalesce(is_claimed, false))
    when 'business' then (select name from business_listings where id = p_entity_id and not coalesce(is_claimed, false))
    when 'organization' then (select entity_name from crawl_islamic_orgs where id = p_entity_id and claimed_org_id is null)
  end
$$;
revoke all on function public.claimable_entity_name(text, uuid) from public, anon, authenticated;

create or replace function public.create_claim_invite(p_entity_type text, p_entity_id uuid, p_sent_to text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_siqa_admin() then
    raise exception 'Only Siqa admins can create invite links.' using errcode = '42501';
  end if;
  v_name := public.claimable_entity_name(p_entity_type, p_entity_id);
  if v_name is null then
    raise exception 'That profile doesn''t exist or is already claimed.' using errcode = 'P0002';
  end if;
  insert into claim_invites (token_hash, entity_type, entity_id, entity_name, sent_to, created_by)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_entity_type, p_entity_id, v_name,
          nullif(left(trim(coalesce(p_sent_to, '')), 320), ''), auth.uid());
  return v_token;
end $function$;
revoke all on function public.create_claim_invite(text, uuid, text) from public, anon;
grant execute on function public.create_claim_invite(text, uuid, text) to authenticated;

-- What the invite page shows before sign-in. Reveals only the public name.
create or replace function public.peek_claim_invite(p_token text)
returns table (entity_type text, entity_id uuid, entity_name text, status text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.entity_type, i.entity_id, i.entity_name,
         case when i.revoked then 'revoked'
              when i.used_at is not null then 'used'
              when i.expires_at < now() then 'expired'
              when public.claimable_entity_name(i.entity_type, i.entity_id) is null then 'claimed'
              else 'ok' end
  from claim_invites i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;
grant execute on function public.peek_claim_invite(text) to anon, authenticated;

create or replace function public.redeem_claim_invite(p_token text)
returns table (entity_type text, entity_id uuid, entity_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.claim_invites;
  v_email text;
  v_name text;
  v_claim public.profile_claims;
begin
  if v_uid is null then raise exception 'Sign in to accept this invite.' using errcode = '42501'; end if;
  select * into v_inv from claim_invites
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then raise exception 'This invite link isn''t valid.' using errcode = 'P0002'; end if;
  if v_inv.revoked then raise exception 'This invite link was cancelled. Contact claims@siqa.us.' using errcode = '22023'; end if;
  if v_inv.used_at is not null then raise exception 'This invite link was already used.' using errcode = '22023'; end if;
  if v_inv.expires_at < now() then raise exception 'This invite link expired. Ask Siqa for a new one.' using errcode = '22023'; end if;
  if public.claimable_entity_name(v_inv.entity_type, v_inv.entity_id) is null then
    raise exception 'This profile has already been claimed.' using errcode = '23505';
  end if;

  select email into v_email from auth.users where id = v_uid;
  select coalesce(nullif(full_name, ''), nullif(username, '')) into v_name from profiles where id = v_uid;

  insert into profile_claims (entity_type, entity_id, entity_name, claimant_id, relationship, full_name,
                              contact_email, official_link, verification_method, verification_code, notes)
  values (v_inv.entity_type, v_inv.entity_id, v_inv.entity_name, v_uid, 'representative',
          coalesce(v_name, split_part(coalesce(v_email, ''), '@', 1), 'Invited user'),
          coalesce(v_email, 'unknown'), null, 'other', 'INVITE',
          'Accepted a Siqa invite link' || coalesce(' sent to ' || v_inv.sent_to, '') || '.')
  returning * into v_claim;

  perform public.apply_profile_claim(v_claim.id, v_inv.created_by);
  update claim_invites set used_at = now(), used_by = v_uid, claim_id = v_claim.id where id = v_inv.id;

  return query select v_inv.entity_type, v_inv.entity_id, v_inv.entity_name;
end $function$;
revoke all on function public.redeem_claim_invite(text) from public, anon;
grant execute on function public.redeem_claim_invite(text) to authenticated;
