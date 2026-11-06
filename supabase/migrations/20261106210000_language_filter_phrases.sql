-- Language filter, part 2: moderators manage the list from the Admin page.
--
-- Adds:
--   * phrases ("kill yourself") — matched as whole words in sequence
--   * any script (Arabic, Urdu, ...) — matched anywhere in the text
--   * who added each entry, and an optional note
--   * terms are normalized on save (lowercase, leetspeak undone, extra
--     spaces removed), so "K!ll   Yourself" is stored as "kill yourself"

alter table public.blocked_terms drop constraint if exists blocked_terms_term_check;
alter table public.blocked_terms drop constraint if exists blocked_terms_match_check;
alter table public.blocked_terms add constraint blocked_terms_match_check check (match in ('word', 'prefix', 'phrase'));
alter table public.blocked_terms add constraint blocked_terms_term_check check (length(term) between 1 and 80);
alter table public.blocked_terms add column if not exists added_by uuid default auth.uid() references auth.users(id) on delete set null;
alter table public.blocked_terms add column if not exists note text check (note is null or length(note) <= 200);

-- Normalize what a moderator types before it's saved.
create or replace function public.blocked_terms_normalize()
returns trigger language plpgsql set search_path = public as $$
declare
  raw text := regexp_replace(trim(lower(new.term)), '\s+', ' ', 'g');
begin
  if raw ~ '[^a-z0-9@$!| .,''_-]' then
    -- Non-Latin script (Arabic, Urdu, ...): keep as typed, match anywhere.
    new.term := raw;
    new.match := 'phrase';
  else
    new.term := trim(public.normalize_for_filter(raw));
    if new.term = '' then raise exception 'Enter a word or phrase'; end if;
    if position(' ' in new.term) > 0 then new.match := 'phrase';
    elsif new.match = 'phrase' then new.match := 'word';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists blocked_terms_normalize on public.blocked_terms;
create trigger blocked_terms_normalize before insert or update on public.blocked_terms
  for each row execute function public.blocked_terms_normalize();

create or replace function public.contains_blocked_language(t text)
returns boolean language sql stable security definer set search_path = public as $$
  with norm as (
    select ' ' || public.normalize_for_filter(t) || ' ' as n,
           lower(coalesce(t, '')) as raw
  ),
  tokens as (
    select tok, public.squash_repeats(tok) as sq
      from norm, unnest(regexp_split_to_array(trim(norm.n), ' ')) as tok
     where tok <> ''
  )
  select
    -- single Latin words / prefixes
    exists (
      select 1
        from tokens k
        join blocked_terms b on b.match in ('word', 'prefix') and b.term ~ '^[a-z]+$' and
          case b.match
            when 'word' then
                 k.tok in (b.term, b.term || 's', b.term || 'es')
              or (length(k.tok) > length(b.term)
                  and k.sq in (public.squash_repeats(b.term), public.squash_repeats(b.term) || 's'))
            else
                 k.tok like b.term || '%'
              or k.sq like public.squash_repeats(b.term) || '%'
          end
    )
    -- Latin phrases: the words in order, as whole words
    or exists (
      select 1 from blocked_terms b, norm
       where b.match = 'phrase' and b.term ~ '^[a-z ]+$'
         and (norm.n like '% ' || b.term || ' %'
              or public.squash_repeats(norm.n) like '% ' || public.squash_repeats(b.term) || ' %')
    )
    -- Other scripts: anywhere in the text
    or exists (
      select 1 from blocked_terms b, norm
       where b.term !~ '^[a-z ]+$' and position(b.term in norm.raw) > 0
    );
$$;
grant execute on function public.contains_blocked_language(text) to anon, authenticated;
