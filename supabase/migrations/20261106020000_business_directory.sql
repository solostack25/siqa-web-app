-- Local business directory ("Shop › Local & services").
-- Contact-only listings: no cart, no checkout. Owners list free; Featured
-- placement (featured_until) is set by admins and always shown as Sponsored.
-- Seeded with the crawled Muslim businesses as unclaimed listings.

create table if not exists public.business_listings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete set null,
  name          text not null check (char_length(name) between 2 and 140),
  category      text not null check (category in (
                  'lessons','food_catering','home_services','events','beauty_wellness','professional',
                  'health','childcare','restaurants','grocery','shops','other')),
  tagline       text check (char_length(tagline) <= 160),
  description   text check (char_length(description) <= 4000),
  address       text,
  city          text,
  state         text,
  service_area  text,
  is_online     boolean not null default false,
  is_home_based boolean not null default false,
  women_owned   boolean not null default false,
  sisters_only  boolean not null default false,
  halal_status  text,
  phone         text,
  whatsapp      text,
  website       text,
  booking_url   text,
  price_text    text check (char_length(price_text) <= 80),
  hours_text    text check (char_length(hours_text) <= 400),
  languages     text[] not null default '{}',
  services      jsonb not null default '[]'::jsonb,
  logo_url      text,
  cover_url     text,
  status        text not null default 'published' check (status in ('draft','published','hidden')),
  is_claimed    boolean not null default true,
  is_verified   boolean not null default false,
  featured_until timestamptz,
  source        text not null default 'owner' check (source in ('owner','crawl')),
  crawl_id      uuid unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists business_listings_browse on public.business_listings (status, category, state);
create index if not exists business_listings_owner on public.business_listings (owner_id);
create index if not exists business_listings_featured on public.business_listings (featured_until) where featured_until is not null;

alter table public.business_listings enable row level security;

drop policy if exists business_listings_read on public.business_listings;
create policy business_listings_read on public.business_listings for select
  using (status = 'published' or owner_id = auth.uid() or public.is_siqa_admin());
drop policy if exists business_listings_insert_own on public.business_listings;
create policy business_listings_insert_own on public.business_listings for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists business_listings_update_own on public.business_listings;
create policy business_listings_update_own on public.business_listings for update to authenticated
  using (owner_id = auth.uid() or public.is_siqa_admin());
drop policy if exists business_listings_delete_own on public.business_listings;
create policy business_listings_delete_own on public.business_listings for delete to authenticated
  using (owner_id = auth.uid() or public.is_siqa_admin());

grant select on public.business_listings to anon, authenticated;
grant insert, update, delete on public.business_listings to authenticated;

-- Owners can't verify, feature, or re-assign their own listing.
create or replace function public.guard_business_listings()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.is_claimed := true;
    new.is_verified := false;
    new.featured_until := null;
    new.source := 'owner';
    new.crawl_id := null;
    if new.status = 'hidden' then new.status := 'draft'; end if;
    return new;
  end if;
  new.owner_id := old.owner_id;
  new.is_claimed := old.is_claimed;
  new.is_verified := old.is_verified;
  new.featured_until := old.featured_until;
  new.source := old.source;
  new.crawl_id := old.crawl_id;
  if old.status = 'hidden' then new.status := 'hidden'; end if;   -- hidden by a moderator
  if new.status = 'hidden' and old.status <> 'hidden' then new.status := old.status; end if;
  return new;
end $$;
drop trigger if exists guard_business_listings on public.business_listings;
create trigger guard_business_listings before insert or update on public.business_listings
  for each row execute function public.guard_business_listings();

-- Seed from the crawler as unclaimed listings (public business info only:
-- no contact names or emails).
insert into public.business_listings
  (name, category, tagline, address, city, state, halal_status, phone, website,
   status, is_claimed, is_verified, source, crawl_id, owner_id)
select left(c.entity_name, 140),
       case c.category
         when 'Restaurant' then 'restaurants'
         when 'Café & bakery' then 'restaurants'
         when 'Grocery' then 'grocery'
         when 'Butcher' then 'grocery'
         when 'Islamic goods' then 'shops'
         when 'Shop' then 'shops'
         else 'other' end,
       nullif(left(concat_ws(' ',
         initcap(nullif(c.cuisine, '')),
         case c.category when 'Restaurant' then 'restaurant' when 'Café & bakery' then 'café & bakery'
                         when 'Grocery' then 'grocery' when 'Butcher' then 'butcher' else lower(c.category) end
       ), 160), ''),
       nullif(trim(concat_ws(' ', c.address_line1, c.address_line2)), ''),
       c.city, c.state, c.halal_status,
       c.phones[1], c.url,
       'published', false, false, 'crawl', c.id, null
  from public.crawl_muslim_businesses c
 where c.entity_name is not null and char_length(c.entity_name) >= 2
on conflict (crawl_id) do nothing;

-- ── Inquiries (messages to a business) ───────────────────────────────
create table if not exists public.business_inquiries (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.business_listings(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  sender_name text,
  reply_to    text,
  message     text not null check (char_length(message) between 2 and 2000),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists business_inquiries_listing on public.business_inquiries (listing_id, created_at desc);
create index if not exists business_inquiries_sender on public.business_inquiries (sender_id, created_at desc);

alter table public.business_inquiries enable row level security;
drop policy if exists business_inquiries_insert on public.business_inquiries;
create policy business_inquiries_insert on public.business_inquiries for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from business_listings l where l.id = listing_id and l.status = 'published'
                  and l.owner_id is not null and l.owner_id <> auth.uid())
  );
drop policy if exists business_inquiries_read on public.business_inquiries;
create policy business_inquiries_read on public.business_inquiries for select to authenticated
  using (sender_id = auth.uid()
         or exists (select 1 from business_listings l where l.id = listing_id and l.owner_id = auth.uid())
         or public.is_siqa_admin());
drop policy if exists business_inquiries_mark_read on public.business_inquiries;
create policy business_inquiries_mark_read on public.business_inquiries for update to authenticated
  using (exists (select 1 from business_listings l where l.id = listing_id and l.owner_id = auth.uid()));
grant select, insert, update on public.business_inquiries to authenticated;

-- Owners may only flip read_at; everything else stays as sent.
create or replace function public.guard_business_inquiries()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.listing_id := old.listing_id; new.sender_id := old.sender_id; new.sender_name := old.sender_name;
    new.reply_to := old.reply_to; new.message := old.message; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_business_inquiries on public.business_inquiries;
create trigger guard_business_inquiries before update on public.business_inquiries
  for each row execute function public.guard_business_inquiries();

create or replace function public.notify_business_inquiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_name text;
begin
  select owner_id, name into v_owner, v_name from business_listings where id = new.listing_id;
  if v_owner is not null then
    insert into notifications (profile_id, type, title, body, data)
    values (v_owner, 'business_inquiry', 'New message for ' || v_name,
            left(new.message, 140),
            jsonb_build_object('listing_id', new.listing_id, 'inquiry_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists notify_business_inquiry on public.business_inquiries;
create trigger notify_business_inquiry after insert on public.business_inquiries
  for each row execute function public.notify_business_inquiry();

-- ── Claims: businesses hand over to the claimant ─────────────────────
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
    select name into v_name from business_listings where id = p_entity_id;
    if not found then raise exception 'Business not found.' using errcode = 'P0002'; end if;
    if exists (select 1 from business_listings where id = p_entity_id and is_claimed) then
      raise exception 'This business has already been claimed.' using errcode = '23505';
    end if;
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
    if exists (select 1 from business_listings where id = v_claim.entity_id and is_claimed) then
      raise exception 'This business has already been claimed.' using errcode = '23505';
    end if;
    update business_listings
       set owner_id = v_claim.claimant_id, is_claimed = true, is_verified = true
     where id = v_claim.entity_id;
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

-- Facet counts for the directory (avoids pulling every row to the client).
create or replace function public.business_directory_facets()
returns table (category text, state text, n bigint)
language sql stable security definer set search_path = public as $$
  select category, state, count(*) from business_listings where status = 'published' group by 1, 2;
$$;
revoke all on function public.business_directory_facets() from public;
grant execute on function public.business_directory_facets() to anon, authenticated;
