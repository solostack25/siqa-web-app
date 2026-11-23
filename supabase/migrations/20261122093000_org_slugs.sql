-- Short, readable links for organizations, e.g. siqa.us/org/icnareliefusa — same idea as speaker slugs.
-- Slug = the name without a leading "The" or trailing "Inc"/"LLC"/"Corp", lowercased, letters and digits only.
-- Duplicates get a number suffix. (Applied to production 2026-11-22.)
alter table public.organizations add column if not exists slug text;
create unique index if not exists organizations_slug_key on public.organizations (slug) where slug is not null;

create or replace function public.make_org_slug(p_name text, p_id uuid)
returns text language plpgsql stable set search_path to 'public' as $function$
declare base text; candidate text; n integer := 1;
begin
  base := lower(coalesce(p_name, ''));
  base := regexp_replace(base, '^\s*the\s+', '');
  base := regexp_replace(base, '[,.]?\s+(inc|incorporated|llc|corp|corporation|co)\.?\s*$', '');
  base := regexp_replace(base, '[^a-z0-9]', '', 'g');
  if base = '' then base := 'org'; end if;
  candidate := base;
  while exists (select 1 from public.organizations where slug = candidate and id <> p_id) loop
    n := n + 1;
    candidate := base || n;
  end loop;
  return candidate;
end $function$;

create or replace function public.set_org_slug()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.make_org_slug(new.org_name, new.id);
  else
    new.slug := lower(regexp_replace(new.slug, '[^a-zA-Z0-9]', '', 'g'));
  end if;
  return new;
end $function$;

drop trigger if exists organizations_set_slug on public.organizations;
create trigger organizations_set_slug
  before insert or update of slug, org_name on public.organizations
  for each row when (new.slug is null or btrim(new.slug) = '' or new.slug ~ '[^a-z0-9]')
  execute function public.set_org_slug();

-- Backfill, oldest first so the original keeps the clean slug.
do $$
declare r record;
begin
  for r in select id, org_name from public.organizations where slug is null order by created_at nulls last, id loop
    update public.organizations set slug = public.make_org_slug(r.org_name, r.id) where id = r.id;
  end loop;
end $$;
