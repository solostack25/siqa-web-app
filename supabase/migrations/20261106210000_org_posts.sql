-- Nonprofit profile posts (Facebook-style updates).
--
-- Like org_videos, these live ONLY on the organization's profile page, in
-- their own tables, so they can never show up in Gems / home / browse.
--
-- A post has text and/or up to 4 photos, and can optionally point at one of
-- the org's Seeds ("Support this Seed" button). Signed-in users can like and
-- comment. Only the org's owner (or a Siqa admin) can post, pin or delete
-- posts; anyone can delete their own comment, and the org can delete any
-- comment on its posts.

create table if not exists public.org_posts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  body           text check (body is null or length(body) <= 5000),
  image_urls     text[] not null default '{}',
  fundraiser_id  uuid references public.fundraisers(id) on delete set null,
  pinned_at      timestamptz,
  like_count     integer not null default 0,
  comment_count  integer not null default 0,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint org_posts_has_content check (length(trim(coalesce(body, ''))) > 0 or cardinality(image_urls) > 0),
  constraint org_posts_max_images check (cardinality(image_urls) <= 4)
);

comment on table public.org_posts is 'Nonprofit profile posts. Shown ONLY on the org profile page, never in Gems/home/browse.';

create index if not exists org_posts_feed on public.org_posts (org_id, pinned_at desc nulls last, created_at desc);

create table if not exists public.org_post_likes (
  post_id    uuid not null references public.org_posts(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create index if not exists org_post_likes_profile on public.org_post_likes (profile_id);

create table if not exists public.org_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.org_posts(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists org_post_comments_post on public.org_post_comments (post_id, created_at);
create index if not exists org_post_comments_profile on public.org_post_comments (profile_id);

-- ── Integrity ────────────────────────────────────────────────────────

-- Attached Seed must belong to the same org; keep updated_at fresh; counters
-- and authorship can't be set by the client.
create or replace function public.org_posts_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fundraiser_id is not null and not exists (
    select 1 from fundraisers f where f.id = new.fundraiser_id and f.org_id = new.org_id
  ) then
    raise exception 'That Seed does not belong to this organization';
  end if;
  if tg_op = 'INSERT' then
    new.like_count := 0;
    new.comment_count := 0;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    -- org_id, counters and author are fixed after creation (counters move via triggers below).
    new.org_id := old.org_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if pg_trigger_depth() = 1 then
      new.like_count := old.like_count;
      new.comment_count := old.comment_count;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists org_posts_before_write on public.org_posts;
create trigger org_posts_before_write
  before insert or update on public.org_posts
  for each row execute function public.org_posts_before_write();

-- Counters.
create or replace function public.org_post_likes_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update org_posts set like_count = like_count + 1 where id = new.post_id;
  else
    update org_posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
drop trigger if exists org_post_likes_count on public.org_post_likes;
create trigger org_post_likes_count after insert or delete on public.org_post_likes
  for each row execute function public.org_post_likes_count();

create or replace function public.org_post_comments_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update org_posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update org_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
drop trigger if exists org_post_comments_count on public.org_post_comments;
create trigger org_post_comments_count after insert or delete on public.org_post_comments
  for each row execute function public.org_post_comments_count();

-- Comments are always written as the signed-in user.
create or replace function public.org_post_comments_author()
returns trigger language plpgsql set search_path = public as $$
begin
  new.profile_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists org_post_comments_author on public.org_post_comments;
create trigger org_post_comments_author before insert on public.org_post_comments
  for each row execute function public.org_post_comments_author();

-- Language filter (public.block_bad_language from 20261106200000_language_filter.sql).
drop trigger if exists block_bad_language on public.org_posts;
create trigger block_bad_language before insert or update of body on public.org_posts
  for each row execute function public.block_bad_language('body');

drop trigger if exists block_bad_language on public.org_post_comments;
create trigger block_bad_language before insert or update of body on public.org_post_comments
  for each row execute function public.block_bad_language('body');

-- ── RLS ──────────────────────────────────────────────────────────────
-- public.can_manage_org(org_id) comes from 20261106190000_org_videos.sql.

alter table public.org_posts enable row level security;
alter table public.org_post_likes enable row level security;
alter table public.org_post_comments enable row level security;

drop policy if exists org_posts_read on public.org_posts;
create policy org_posts_read on public.org_posts for select using (true);

drop policy if exists org_posts_insert on public.org_posts;
create policy org_posts_insert on public.org_posts for insert to authenticated
  with check (public.can_manage_org(org_id));

drop policy if exists org_posts_update on public.org_posts;
create policy org_posts_update on public.org_posts for update to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

drop policy if exists org_posts_delete on public.org_posts;
create policy org_posts_delete on public.org_posts for delete to authenticated
  using (public.can_manage_org(org_id));

drop policy if exists org_post_likes_read on public.org_post_likes;
create policy org_post_likes_read on public.org_post_likes for select using (true);

drop policy if exists org_post_likes_insert on public.org_post_likes;
create policy org_post_likes_insert on public.org_post_likes for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists org_post_likes_delete on public.org_post_likes;
create policy org_post_likes_delete on public.org_post_likes for delete to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists org_post_comments_read on public.org_post_comments;
create policy org_post_comments_read on public.org_post_comments for select using (true);

drop policy if exists org_post_comments_insert on public.org_post_comments;
create policy org_post_comments_insert on public.org_post_comments for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists org_post_comments_delete on public.org_post_comments;
create policy org_post_comments_delete on public.org_post_comments for delete to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (select 1 from public.org_posts p where p.id = post_id and public.can_manage_org(p.org_id))
  );
