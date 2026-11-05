-- Location search for Local & services: ZIP + coordinates on listings and a
-- search function that filters by distance (miles) when given a point, or by
-- city / state / ZIP text otherwise. Online listings always show up.

alter table public.business_listings add column if not exists zip text;
alter table public.business_listings add column if not exists lat double precision;
alter table public.business_listings add column if not exists lon double precision;
create index if not exists business_listings_zip on public.business_listings (zip);
create index if not exists business_listings_latlon on public.business_listings (lat, lon) where lat is not null;

update public.business_listings b
   set zip = coalesce(b.zip, left(c.zip, 5)), lat = coalesce(b.lat, c.lat), lon = coalesce(b.lon, c.lon)
  from public.crawl_muslim_businesses c
 where c.id = b.crawl_id;

create or replace function public.business_directory_search(
  p_lat double precision default null,
  p_lon double precision default null,
  p_radius_miles double precision default 30,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_query text default null,
  p_category text default null,
  p_women_owned boolean default false,
  p_sisters_only boolean default false,
  p_online boolean default false,
  p_home_based boolean default false,
  p_featured_only boolean default false,
  p_limit int default 24,
  p_offset int default 0
) returns table (
  id uuid, owner_id uuid, name text, category text, tagline text, city text, state text, zip text,
  service_area text, is_online boolean, is_home_based boolean, women_owned boolean, sisters_only boolean,
  halal_status text, phone text, price_text text, logo_url text, cover_url text, status text,
  is_claimed boolean, is_verified boolean, featured_until timestamptz, source text,
  distance_miles double precision, total_count bigint
)
language sql stable set search_path = public as $$
  with base as (
    select b.*,
           case when p_lat is not null and p_lon is not null and b.lat is not null then
             3958.8 * acos(least(1, greatest(-1,
               cos(radians(p_lat)) * cos(radians(b.lat)) * cos(radians(b.lon) - radians(p_lon))
               + sin(radians(p_lat)) * sin(radians(b.lat)))))
           end as dist
      from business_listings b
     where b.status = 'published'
       and (p_category is null or p_category = '' or b.category = p_category)
       and (not p_women_owned or b.women_owned)
       and (not p_sisters_only or b.sisters_only)
       and (not p_online or b.is_online)
       and (not p_home_based or b.is_home_based)
       and (not p_featured_only or b.featured_until > now())
       and (
         p_query is null or trim(p_query) = ''
         or b.name ilike '%' || trim(p_query) || '%'
         or b.tagline ilike '%' || trim(p_query) || '%'
         or b.description ilike '%' || trim(p_query) || '%'
       )
  ), located as (
    select * from base
     where
       -- A point: within the radius (rough box first), or online.
       (p_lat is not null and p_lon is not null and (
          is_online
          or (lat between p_lat - p_radius_miles / 69.0 and p_lat + p_radius_miles / 69.0
              and dist <= p_radius_miles)))
       -- No point: match ZIP / city / state text, or online.
       or (p_lat is null and (
          (coalesce(p_zip, '') = '' and coalesce(p_city, '') = '' and coalesce(p_state, '') = '')
          or is_online
          or ((coalesce(p_zip, '') = '' or zip = left(p_zip, 5))
              and (coalesce(p_city, '') = '' or city ilike p_city or service_area ilike '%' || p_city || '%')
              and (coalesce(p_state, '') = '' or state = upper(p_state)))))
  )
  select id, owner_id, name, category, tagline, city, state, zip, service_area, is_online, is_home_based,
         women_owned, sisters_only, halal_status, phone, price_text, logo_url, cover_url, status,
         is_claimed, is_verified, featured_until, source, dist, count(*) over ()
    from located
   order by
     (dist is null) asc,                          -- local before online-only when searching near a point
     case when p_lat is not null then dist end asc nulls last,
     is_claimed desc, is_verified desc, created_at desc
   limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.business_directory_search(
  double precision, double precision, double precision, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, int, int) to anon, authenticated;
