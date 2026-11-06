-- Language filter: block profanity / vulgar language in public text.
--
-- Enforced in the database (triggers), so it can't be bypassed by calling
-- the API directly. The app already shows the error message, so a blocked
-- post shows: "Please keep it respectful ..." and the text stays in the box.
--
-- Matching works on whole words after normalizing the text, so words that
-- merely contain a bad word ("assistant", "class", "Scunthorpe", "cockpit")
-- are NOT blocked. Normalizing catches common dodges:
--   leetspeak   sh1t, @ss, $hit      -> shit, ass
--   stretching  fuuuuck, shiiiit     -> fuck, shit
--   spacing     f u c k, f.u.c.k     -> fuck
--
-- Admins add/remove words in public.blocked_terms (no code change needed):
--   match = 'word'   the word itself, plus plain plurals (s / es)
--   match = 'prefix' any word starting with it (fuck -> fucking, fucker)
--
-- Deliberately NOT blocked: hell, damn, god, kafir, haram, porn (lectures on
-- avoiding it), cum (summa cum laude) ... these appear
-- constantly in Islamic lectures and normal discussion.

create table if not exists public.blocked_terms (
  term       text primary key check (term ~ '^[a-z]+$'),
  match      text not null default 'word' check (match in ('word', 'prefix')),
  created_at timestamptz not null default now()
);
alter table public.blocked_terms enable row level security;

drop policy if exists blocked_terms_admin on public.blocked_terms;
create policy blocked_terms_admin on public.blocked_terms
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid()
                          and lower(coalesce(p.role, '')) in ('admin', 'owner', 'moderator', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()
                          and lower(coalesce(p.role, '')) in ('admin', 'owner', 'moderator', 'super_admin')));

insert into public.blocked_terms (term, match) values
  -- prefix: every word starting with these
  ('fuck', 'prefix'), ('motherfuck', 'prefix'), ('cunt', 'prefix'), ('bitch', 'prefix'),
  ('whore', 'prefix'), ('slut', 'prefix'), ('nigger', 'word'), ('nigga', 'word'), ('faggot', 'prefix'),
  ('asshole', 'prefix'), ('arsehole', 'prefix'), ('wank', 'prefix'),
  ('cocksuck', 'prefix'), ('dickhead', 'prefix'), ('shithead', 'prefix'), ('bullshit', 'prefix'),
  ('horseshit', 'prefix'), ('jackass', 'prefix'), ('dumbass', 'prefix'), ('dipshit', 'prefix'),
  -- word: the exact word (+ s/es)
  ('fuk', 'word'), ('fuking', 'word'), ('fukin', 'word'), ('fck', 'word'), ('fcking', 'word'),
  ('wtf', 'word'), ('stfu', 'word'), ('mf', 'word'),
  ('shit', 'word'), ('shitty', 'word'), ('shitting', 'word'), ('shite', 'word'),
  ('ass', 'word'), ('arse', 'word'), ('dick', 'word'), ('cock', 'word'), ('pussy', 'word'),
  ('pussies', 'word'), ('bastard', 'word'), ('piss', 'word'), ('pissed', 'word'),
  ('twat', 'word'), ('prick', 'word'), ('tits', 'word'), ('titties', 'word'), ('boobs', 'word'),
  ('fag', 'word'), ('dyke', 'word'), ('retard', 'word'), ('retarded', 'word'),
  ('kike', 'word'), ('spic', 'word'), ('chink', 'word'), ('gook', 'word'), ('wetback', 'word'),
  ('tranny', 'word'), ('raghead', 'word'), ('towelhead', 'word'), ('sandnigger', 'word'),
  ('hoe', 'word'), ('thot', 'word'), ('skank', 'word'), ('douche', 'word'), ('douchebag', 'word'),
  ('blowjob', 'word'), ('handjob', 'word'), ('dildo', 'word'), ('jizz', 'word')
on conflict (term) do nothing;

-- Collapse a run of the same letter to one: "fuuuck" -> "fuck".
create or replace function public.squash_repeats(t text)
returns text language sql immutable as $$
  select regexp_replace(t, '([a-z])\1+', '\1', 'g');
$$;

-- Lowercase, undo leetspeak, turn everything else into spaces, and join
-- spelled-out letters ("f u c k" -> "fuck").
create or replace function public.normalize_for_filter(t text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             translate(lower(coalesce(t, '')), '0134578@$!|', 'oieastbasil'),
             '[^a-z]+', ' ', 'g'),
           '\m([a-z]) (?=[a-z]\M)', '\1', 'g');
$$;

create or replace function public.contains_blocked_language(t text)
returns boolean language sql stable security definer set search_path = public as $$
  with tokens as (
    select tok, public.squash_repeats(tok) as sq
      from unnest(regexp_split_to_array(public.normalize_for_filter(t), ' ')) as tok
     where tok <> ''
  )
  select exists (
    select 1
      from tokens k
      join blocked_terms b on
        case b.match
          when 'word' then
               k.tok in (b.term, b.term || 's', b.term || 'es')
            -- stretched spelling ("assss", "shiiit"), only when it really was stretched
            or (length(k.tok) > length(b.term)
                and k.sq in (public.squash_repeats(b.term), public.squash_repeats(b.term) || 's'))
          else
               k.tok like b.term || '%'
            or k.sq like public.squash_repeats(b.term) || '%'
        end
  );
$$;
grant execute on function public.contains_blocked_language(text) to anon, authenticated;

-- Trigger: TG_ARGV lists the text columns to check on that table.
create or replace function public.block_bad_language()
returns trigger language plpgsql set search_path = public as $$
declare
  col text;
  row_json jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if public.contains_blocked_language(row_json ->> col) then
      raise exception using
        errcode = 'P0001',
        message = 'Please keep it respectful. Your text has language that isn''t allowed on Siqa.',
        hint = 'blocked_language';
    end if;
  end loop;
  return new;
end;
$$;

-- Public text people post. Only new/edited text is checked; existing rows are untouched.
drop trigger if exists block_bad_language on public.comments;
create trigger block_bad_language before insert or update of body on public.comments
  for each row execute function public.block_bad_language('body');

drop trigger if exists block_bad_language on public.donation_reviews;
create trigger block_bad_language before insert or update of body on public.donation_reviews
  for each row execute function public.block_bad_language('body');

drop trigger if exists block_bad_language on public.marketplace_reviews;
create trigger block_bad_language before insert or update of comment on public.marketplace_reviews
  for each row execute function public.block_bad_language('comment');

drop trigger if exists block_bad_language on public.fundraiser_updates;
create trigger block_bad_language before insert or update of body on public.fundraiser_updates
  for each row execute function public.block_bad_language('body');

drop trigger if exists block_bad_language on public.org_endorsements;
create trigger block_bad_language before insert or update of message on public.org_endorsements
  for each row execute function public.block_bad_language('message');

drop trigger if exists block_bad_language on public.seed_endorsements;
create trigger block_bad_language before insert or update of message on public.seed_endorsements
  for each row execute function public.block_bad_language('message');

drop trigger if exists block_bad_language on public.profiles;
create trigger block_bad_language before insert or update of full_name on public.profiles
  for each row execute function public.block_bad_language('full_name');
