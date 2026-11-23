-- Links pasted from messages often carry a trailing period, slash or capital letters. Ignore them.
-- (Applied to production 2026-11-22.)
create or replace function public.event_clean_slug(p text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9-]', '', 'g');
$$;
do $$ begin
  execute replace(pg_get_functiondef('public.event_public(text)'::regprocedure), 'where e.slug = p_slug', 'where e.slug = public.event_clean_slug(p_slug)');
  execute replace(pg_get_functiondef('public.event_live_public(text)'::regprocedure), 'where e.slug = p_slug', 'where e.slug = public.event_clean_slug(p_slug)');
end $$;
