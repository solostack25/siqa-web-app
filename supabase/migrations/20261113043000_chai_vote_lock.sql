-- Chai: votes can be changed for 30 seconds after they're cast, then they're
-- final. Quizzes keep each person's FIRST result (retakes are for fun and
-- don't overwrite the stats).

-- The server sets the vote time, so a client can't send a later time to
-- stretch the window. 35s on the server covers the 30s shown in the app
-- plus network lag.
create or replace function public.chai_votes_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  if old.created_at < now() - interval '35 seconds' then
    raise exception 'vote_locked' using errcode = 'P0001',
      hint = 'Votes can only be changed in the first 30 seconds.';
  end if;
  new.post_id := old.post_id;
  new.profile_id := old.profile_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists chai_votes_guard on public.chai_votes;
create trigger chai_votes_guard
  before insert or update on public.chai_votes
  for each row execute function public.chai_votes_guard();

-- Quizzes: first result stands.
drop policy if exists chai_plays_own_update on public.chai_plays;
