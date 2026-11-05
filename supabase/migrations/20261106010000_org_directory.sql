-- Organizations directory: list the crawled US Islamic organizations
-- (crawl_islamic_orgs) next to the ones on Siqa, and let them be claimed.
--
-- crawl_islamic_orgs keeps RLS on with no client policies: it holds contact
-- names, emails and phones. The directory reads it only through the
-- functions below, which return public-record fields.

-- ── Link crawled rows to Siqa organizations ──────────────────────────
alter table public.crawl_islamic_orgs
  add column if not exists claimed_org_id uuid references public.organizations(id) on delete set null;
create index if not exists crawl_islamic_orgs_claimed on public.crawl_islamic_orgs (claimed_org_id);
create index if not exists crawl_islamic_orgs_state on public.crawl_islamic_orgs (state);

-- Organizations already on Siqa appear once: link them to their record by EIN.
update public.crawl_islamic_orgs c
   set claimed_org_id = o.id
  from public.organizations o
 where o.ein is not null
   and regexp_replace(c.ein, '\D', '', 'g') = regexp_replace(o.ein, '\D', '', 'g')
   and c.claimed_org_id is null;

-- ── NTEE code → directory category ───────────────────────────────────
create or replace function public.org_category(p_ntee text)
returns text language sql immutable as $$
  select case upper(left(coalesce(p_ntee, ''), 1))
    when 'X' then 'masjid'
    when 'B' then 'education'
    when 'Q' then 'relief'
    when 'M' then 'relief'
    when 'K' then 'food_housing'
    when 'L' then 'food_housing'
    when 'O' then 'youth_family'
    when 'P' then 'youth_family'
    when 'E' then 'health'
    when 'F' then 'health'
    when 'S' then 'community'
    when 'R' then 'community'
    when 'A' then 'arts_culture'
    when '' then 'other'
    else 'other'
  end;
$$;

-- ── Public directory reads ───────────────────────────────────────────
create or replace function public.directory_listed_orgs(
  p_query text default null,
  p_state text default null,
  p_category text default null,
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid, name text, city text, state text, ein text, category text, website text, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with q as (
    select c.id, c.entity_name, c.city, c.state, c.ein, public.org_category(c.ntee_code) as category, c.url
      from crawl_islamic_orgs c
     where c.claimed_org_id is null
       and c.entity_name is not null
       and (p_state is null or p_state = '' or c.state = upper(p_state))
       and (p_category is null or p_category = '' or public.org_category(c.ntee_code) = p_category)
       and (
         p_query is null or trim(p_query) = ''
         or c.entity_name ilike '%' || trim(p_query) || '%'
         or c.city ilike '%' || trim(p_query) || '%'
         or (length(regexp_replace(p_query, '\D', '', 'g')) >= 4
             and regexp_replace(coalesce(c.ein, ''), '\D', '', 'g') like regexp_replace(p_query, '\D', '', 'g') || '%')
       )
  )
  select q.id, q.entity_name, q.city, q.state,
         case when q.ein is null then null
              else substr(regexp_replace(q.ein, '\D', '', 'g'), 1, 2) || '-' || substr(regexp_replace(q.ein, '\D', '', 'g'), 3) end,
         q.category, q.url, count(*) over ()
    from q
   order by q.entity_name
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.directory_listed_org(p_id uuid)
returns table (
  id uuid, name text, address text, city text, state text, zip text, ein text, category text,
  ntee_code text, website text, claimed_org_id uuid
)
language sql stable security definer set search_path = public as $$
  select c.id, c.entity_name,
         nullif(trim(concat_ws(' ', c.address_line1, c.address_line2)), ''),
         c.city, c.state, c.zip,
         case when c.ein is null then null
              else substr(regexp_replace(c.ein, '\D', '', 'g'), 1, 2) || '-' || substr(regexp_replace(c.ein, '\D', '', 'g'), 3) end,
         public.org_category(c.ntee_code), c.ntee_code, c.url, c.claimed_org_id
    from crawl_islamic_orgs c
   where c.id = p_id;
$$;

create or replace function public.directory_listed_stats()
returns table (category text, state text, n bigint)
language sql stable security definer set search_path = public as $$
  select public.org_category(ntee_code), state, count(*)
    from crawl_islamic_orgs
   where claimed_org_id is null and entity_name is not null
   group by 1, 2;
$$;

revoke all on function public.directory_listed_orgs(text, text, text, int, int) from public;
revoke all on function public.directory_listed_org(uuid) from public;
revoke all on function public.directory_listed_stats() from public;
grant execute on function public.directory_listed_orgs(text, text, text, int, int) to anon, authenticated;
grant execute on function public.directory_listed_org(uuid) to anon, authenticated;
grant execute on function public.directory_listed_stats() to anon, authenticated;

-- ── Claims: add 'organization' ───────────────────────────────────────
alter table public.profile_claims drop constraint if exists profile_claims_entity_type_check;
alter table public.profile_claims add constraint profile_claims_entity_type_check
  check (entity_type in ('speaker', 'business', 'organization'));

create or replace function public.submit_profile_claim(
  p_entity_type text, p_entity_id uuid, p_relationship text, p_full_name text, p_title text,
  p_contact_email text, p_contact_phone text, p_official_link text, p_verification_method text, p_notes text
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
  elsif p_entity_type = 'organization' then
    select entity_name into v_name from crawl_islamic_orgs where id = p_entity_id;
    if not found then raise exception 'Organization not found.' using errcode = 'P0002'; end if;
    if exists (select 1 from crawl_islamic_orgs where id = p_entity_id and claimed_org_id is not null) then
      raise exception 'This organization has already been claimed.' using errcode = '23505';
    end if;
    if exists (select 1 from organizations where profile_id = v_uid) then
      raise exception 'Your account already runs an organization on Siqa. Contact Siqa if you manage more than one.' using errcode = '23505';
    end if;
  elsif p_entity_type = 'business' then
    v_name := null;
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

  insert into notifications (profile_id, type, title, body, data)
  select p.id, 'profile_claim', 'New profile claim',
         v_row.full_name || ' wants to claim ' || coalesce(v_name, 'a ' || p_entity_type || ' profile') || '.',
         jsonb_build_object('claim_id', v_row.id, 'entity_type', p_entity_type, 'entity_id', p_entity_id)
    from profiles p where p.role = 'admin';

  return v_row;
end $$;

create or replace function public.approve_profile_claim(p_claim_id uuid)
returns public.profile_claims
language plpgsql security definer set search_path = public as $$
declare
  v_claim public.profile_claims;
  v_old_owner uuid;
  v_crawl public.crawl_islamic_orgs;
  v_org uuid;
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
           approval_status = 'approved', approved_at = coalesce(approved_at, now()), approved_by = auth.uid()
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
    null;  -- ownership hand-off for businesses goes here once the business table is final
  end if;

  update profile_claims
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_claim_id
  returning * into v_claim;

  update profile_claims
     set status = 'rejected', rejection_reason = 'Another claim for this profile was approved.',
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where entity_type = v_claim.entity_type and entity_id = v_claim.entity_id
     and status = 'pending' and id <> p_claim_id;

  insert into notifications (profile_id, type, title, body, data)
  values (v_claim.claimant_id, 'profile_claim_approved', 'Your claim was approved',
          'You now manage ' || coalesce(v_claim.entity_name, 'this profile') || ' on Siqa.',
          jsonb_build_object('claim_id', v_claim.id, 'entity_type', v_claim.entity_type, 'entity_id', v_claim.entity_id,
                             'org_id', v_org));
  return v_claim;
end $$;
