-- Chai: polls, personality quizzes and trivia quizzes, with discussion.
-- Admins (siqa_is_privileged) create and publish; everyone reads what's
-- live; signed-in people vote, play and comment. Individual votes and
-- quiz results stay private: the app reads totals and the badges shown on
-- commenters through the security-definer functions below.

create table if not exists public.chai_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('poll', 'personality', 'trivia')),
  title text not null check (char_length(title) between 1 and 200),
  intro text,
  cover_color text not null default 'saffron',
  -- poll:        {"options":[{"id","label"}]}
  -- personality: {"results":[{"id","name","description"}],
  --               "questions":[{"id","text","answers":[{"id","text","result"}]}]}
  -- trivia:      {"questions":[{"id","text","answers":[{"id","text"}],"correct"}],
  --               "tiers":[{"min","name","description"}]}
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  publish_at timestamptz,          -- live + future publish_at = scheduled
  ends_at timestamptz,             -- polls close here; null = open
  comments_enabled boolean not null default true,
  show_on_home boolean not null default true,
  show_breakdown boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chai_posts_feed_idx on public.chai_posts (status, publish_at desc);

create or replace function public.chai_post_visible(p public.chai_posts)
returns boolean language sql stable as $$
  select p.status in ('live', 'ended') and (p.publish_at is null or p.publish_at <= now())
$$;

create or replace function public.chai_post_open(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chai_posts p
    where p.id = p_id and p.status = 'live'
      and (p.publish_at is null or p.publish_at <= now())
      and (p.ends_at is null or p.ends_at > now())
  )
$$;

alter table public.chai_posts enable row level security;
drop policy if exists chai_posts_read on public.chai_posts;
create policy chai_posts_read on public.chai_posts for select
  using (public.chai_post_visible(chai_posts) or public.siqa_is_privileged());
drop policy if exists chai_posts_admin_write on public.chai_posts;
create policy chai_posts_admin_write on public.chai_posts for all
  using (public.siqa_is_privileged()) with check (public.siqa_is_privileged());

create or replace function public.chai_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists chai_posts_touch on public.chai_posts;
create trigger chai_posts_touch before update on public.chai_posts
  for each row execute function public.chai_touch_updated_at();

-- Poll votes: one per person per poll, changeable while the poll is open.
create table if not exists public.chai_votes (
  post_id uuid not null references public.chai_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  option_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
alter table public.chai_votes enable row level security;
drop policy if exists chai_votes_own_read on public.chai_votes;
create policy chai_votes_own_read on public.chai_votes for select using (profile_id = auth.uid() or public.siqa_is_privileged());
drop policy if exists chai_votes_own_insert on public.chai_votes;
create policy chai_votes_own_insert on public.chai_votes for insert
  with check (profile_id = auth.uid() and public.chai_post_open(post_id));
drop policy if exists chai_votes_own_update on public.chai_votes;
create policy chai_votes_own_update on public.chai_votes for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.chai_post_open(post_id));

-- Quiz plays: latest result per person (retakes overwrite).
create table if not exists public.chai_plays (
  post_id uuid not null references public.chai_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  result_id text not null,          -- personality result id, or trivia tier name
  score int,
  total int,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
alter table public.chai_plays enable row level security;
drop policy if exists chai_plays_own_read on public.chai_plays;
create policy chai_plays_own_read on public.chai_plays for select using (profile_id = auth.uid() or public.siqa_is_privileged());
drop policy if exists chai_plays_own_insert on public.chai_plays;
create policy chai_plays_own_insert on public.chai_plays for insert
  with check (profile_id = auth.uid() and exists (select 1 from public.chai_posts p where p.id = post_id and public.chai_post_visible(p)));
drop policy if exists chai_plays_own_update on public.chai_plays;
create policy chai_plays_own_update on public.chai_plays for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Discussion.
create table if not exists public.chai_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.chai_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  parent_id uuid references public.chai_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  like_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chai_comments_post_idx on public.chai_comments (post_id, created_at desc);
alter table public.chai_comments enable row level security;
drop policy if exists chai_comments_read on public.chai_comments;
create policy chai_comments_read on public.chai_comments for select
  using (exists (select 1 from public.chai_posts p where p.id = post_id and (public.chai_post_visible(p) or public.siqa_is_privileged())));
drop policy if exists chai_comments_insert on public.chai_comments;
create policy chai_comments_insert on public.chai_comments for insert
  with check (profile_id = auth.uid() and exists (
    select 1 from public.chai_posts p where p.id = post_id and p.comments_enabled and public.chai_post_visible(p)));
drop policy if exists chai_comments_delete on public.chai_comments;
create policy chai_comments_delete on public.chai_comments for delete
  using (profile_id = auth.uid() or public.siqa_is_privileged());

create or replace function public.chai_comments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.like_count := 0; end if;
  return new;
end $$;
drop trigger if exists chai_comments_guard on public.chai_comments;
create trigger chai_comments_guard before insert on public.chai_comments
  for each row execute function public.chai_comments_guard();

create table if not exists public.chai_comment_likes (
  comment_id uuid not null references public.chai_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);
alter table public.chai_comment_likes enable row level security;
drop policy if exists chai_likes_own_read on public.chai_comment_likes;
create policy chai_likes_own_read on public.chai_comment_likes for select using (profile_id = auth.uid());
drop policy if exists chai_likes_own_insert on public.chai_comment_likes;
create policy chai_likes_own_insert on public.chai_comment_likes for insert with check (profile_id = auth.uid());
drop policy if exists chai_likes_own_delete on public.chai_comment_likes;
create policy chai_likes_own_delete on public.chai_comment_likes for delete using (profile_id = auth.uid());

create or replace function public.chai_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.chai_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.chai_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end $$;
drop trigger if exists chai_like_count on public.chai_comment_likes;
create trigger chai_like_count after insert or delete on public.chai_comment_likes
  for each row execute function public.chai_like_count();

-- Totals without exposing who picked what.
create or replace function public.chai_poll_results(p_post uuid)
returns table (option_id text, votes int)
language sql stable security definer set search_path = public as $$
  select v.option_id, count(*)::int
  from public.chai_votes v join public.chai_posts p on p.id = v.post_id
  where v.post_id = p_post and (public.chai_post_visible(p) or public.siqa_is_privileged())
  group by v.option_id
$$;

create or replace function public.chai_result_breakdown(p_post uuid)
returns table (result_id text, plays int)
language sql stable security definer set search_path = public as $$
  select pl.result_id, count(*)::int
  from public.chai_plays pl join public.chai_posts p on p.id = pl.post_id
  where pl.post_id = p_post and (public.chai_post_visible(p) or public.siqa_is_privileged())
  group by pl.result_id
$$;

create or replace function public.chai_participants(p_posts uuid[])
returns table (post_id uuid, people int)
language sql stable security definer set search_path = public as $$
  select x.post_id, count(*)::int from (
    select post_id from public.chai_votes where post_id = any(p_posts)
    union all
    select post_id from public.chai_plays where post_id = any(p_posts)
  ) x
  where exists (select 1 from public.chai_posts p where p.id = x.post_id and (public.chai_post_visible(p) or public.siqa_is_privileged()))
  group by x.post_id
$$;

-- The vote/result badge next to each commenter (only people who commented).
create or replace function public.chai_comment_badges(p_post uuid)
returns table (profile_id uuid, badge text)
language sql stable security definer set search_path = public as $$
  with c as (select distinct profile_id from public.chai_comments where post_id = p_post),
  p as (select * from public.chai_posts where id = p_post)
  select c.profile_id,
    coalesce(
      (select o->>'label' from public.chai_votes v, p, jsonb_array_elements(p.content->'options') o
        where v.post_id = p_post and v.profile_id = c.profile_id and o->>'id' = v.option_id limit 1),
      (select coalesce((select r->>'name' from p, jsonb_array_elements(p.content->'results') r where r->>'id' = pl.result_id limit 1),
                       pl.result_id || case when pl.total is not null then ' · ' || pl.score || '/' || pl.total else '' end)
        from public.chai_plays pl where pl.post_id = p_post and pl.profile_id = c.profile_id)
    )
  from c
$$;

grant execute on function public.chai_poll_results(uuid), public.chai_result_breakdown(uuid),
  public.chai_participants(uuid[]), public.chai_comment_badges(uuid) to anon, authenticated;
