-- Short, readable links for speakers, e.g. siqa.us/claim/omarsuleiman.
-- Slug = the display name without honorifics (Sh., Shaykh, Sheikh, Imam,
-- Dr., Ustadh), lowercased, letters and digits only. "Mufti" is kept since
-- it's part of how Mufti Menk is known. Duplicates get a number suffix.
alter table public.speakers add column if not exists slug text;
create unique index if not exists speakers_slug_key on public.speakers (slug) where slug is not null;

create or replace function public.make_speaker_slug(p_name text, p_id uuid)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  base := lower(coalesce(p_name, ''));
  base := regexp_replace(base, '^\s*((sh|shk|shaykh|sheikh|shaikh|shaik|imam|dr|ustadh|ustad|ustadha)\.?\s+)+', '');
  base := regexp_replace(base, '[^a-z0-9]', '', 'g');
  if base = '' then base := 'speaker'; end if;
  candidate := base;
  while exists (select 1 from public.speakers where slug = candidate and id <> p_id) loop
    n := n + 1;
    candidate := base || n;
  end loop;
  return candidate;
end $function$;

create or replace function public.set_speaker_slug()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.make_speaker_slug(new.display_name, new.id);
  else
    new.slug := lower(regexp_replace(new.slug, '[^a-zA-Z0-9]', '', 'g'));
  end if;
  return new;
end $function$;

drop trigger if exists speakers_set_slug on public.speakers;
create trigger speakers_set_slug
  before insert or update of slug, display_name on public.speakers
  for each row when (new.slug is null or btrim(new.slug) = '' or new.slug ~ '[^a-z0-9]')
  execute function public.set_speaker_slug();

-- Backfill existing speakers, oldest first so the original keeps the clean slug.
do $$
declare r record;
begin
  for r in select id, display_name from public.speakers where slug is null order by created_at nulls last, id loop
    update public.speakers set slug = public.make_speaker_slug(r.display_name, r.id) where id = r.id;
  end loop;
end $$;
