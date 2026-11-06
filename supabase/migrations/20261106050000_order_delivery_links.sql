-- "Order delivery" links on restaurant / food listings: the owner (or a Siqa
-- admin) pastes the listing's Uber Eats, DoorDash, Grubhub or own ordering
-- page. Each column only accepts that service's own domain, so a listing
-- can't point an "Uber Eats" button somewhere else.

alter table public.business_listings add column if not exists ubereats_url text;
alter table public.business_listings add column if not exists doordash_url text;
alter table public.business_listings add column if not exists grubhub_url text;
alter table public.business_listings add column if not exists order_url text;

alter table public.business_listings drop constraint if exists business_listings_ubereats_url_ok;
alter table public.business_listings add constraint business_listings_ubereats_url_ok
  check (ubereats_url is null or ubereats_url ~* '^https://([a-z0-9-]+\.)?(ubereats\.com|uber\.com)/');
alter table public.business_listings drop constraint if exists business_listings_doordash_url_ok;
alter table public.business_listings add constraint business_listings_doordash_url_ok
  check (doordash_url is null or doordash_url ~* '^https://([a-z0-9-]+\.)?(doordash\.com|drd\.sh)/');
alter table public.business_listings drop constraint if exists business_listings_grubhub_url_ok;
alter table public.business_listings add constraint business_listings_grubhub_url_ok
  check (grubhub_url is null or grubhub_url ~* '^https://([a-z0-9-]+\.)?(grubhub\.com|seamless\.com)/');
alter table public.business_listings drop constraint if exists business_listings_order_url_ok;
alter table public.business_listings add constraint business_listings_order_url_ok
  check (order_url is null or order_url ~* '^https?://[^\s]+$');

-- Click counts, so restaurants (and affiliate applications) can see how many
-- orders Siqa sends. Written only through log_order_click().
create table if not exists public.order_link_clicks (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.business_listings(id) on delete cascade,
  platform text not null check (platform in ('ubereats', 'doordash', 'grubhub', 'direct')),
  profile_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_link_clicks_listing on public.order_link_clicks (listing_id, created_at desc);
alter table public.order_link_clicks enable row level security;

drop policy if exists order_link_clicks_read on public.order_link_clicks;
create policy order_link_clicks_read on public.order_link_clicks for select to authenticated
  using (public.is_siqa_admin()
         or exists (select 1 from public.business_listings b where b.id = listing_id and b.owner_id = auth.uid()));
grant select on public.order_link_clicks to authenticated;

create or replace function public.log_order_click(p_listing uuid, p_platform text)
returns void language sql security definer set search_path = public as $$
  insert into order_link_clicks (listing_id, platform, profile_id)
  select b.id, p_platform, auth.uid()
    from business_listings b
   where b.id = p_listing and b.status = 'published'
     and p_platform in ('ubereats', 'doordash', 'grubhub', 'direct');
$$;
revoke all on function public.log_order_click(uuid, text) from public;
grant execute on function public.log_order_click(uuid, text) to anon, authenticated;
