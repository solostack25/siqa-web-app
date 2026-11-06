-- Comments: pinning, plus a guard so people can only edit the text of
-- their own comments.
--
-- The speaker of a video (or a Siqa admin) can pin one top-level comment.
-- Pinning goes through pin_comment(); a trigger rejects direct changes to
-- the pin and to the fields a comment author must not change.

alter table public.comments
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

create index if not exists comments_video_pinned_idx
  on public.comments (video_id) where pinned_at is not null;

-- Who may moderate a video's comments: admins and the video's own speaker.
create or replace function public.can_moderate_video_comments(p_video uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_siqa_admin()
      or exists (
        select 1
        from public.videos v
        join public.speakers s on s.id = v.speaker_id
        where v.id = p_video and s.profile_id = auth.uid()
      );
$$;

create or replace function public.pin_comment(p_comment uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video uuid;
  v_parent uuid;
begin
  select video_id, parent_id into v_video, v_parent from public.comments where id = p_comment;
  if v_video is null then
    raise exception 'Comment not found';
  end if;
  if v_parent is not null then
    raise exception 'Only top-level comments can be pinned';
  end if;
  if not public.can_moderate_video_comments(v_video) then
    raise exception 'Only the speaker or an admin can pin comments';
  end if;

  perform set_config('siqa.comment_pin', 'on', true);

  -- One pinned comment per video.
  update public.comments set pinned_at = null, pinned_by = null
   where video_id = v_video and pinned_at is not null and id <> p_comment;

  update public.comments
     set pinned_at = case when p_pin then now() else null end,
         pinned_by = case when p_pin then auth.uid() else null end
   where id = p_comment;
end;
$$;

revoke all on function public.pin_comment(uuid, boolean) from public, anon;
grant execute on function public.pin_comment(uuid, boolean) to authenticated;

-- Authors may edit their text; the pin, counts, author, video and thread
-- position are not theirs to change.
create or replace function public.guard_comment_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('siqa.comment_pin', true), '') = 'on' or public.is_siqa_admin() then
    return new;
  end if;
  if new.pinned_at is distinct from old.pinned_at
     or new.pinned_by is distinct from old.pinned_by then
    raise exception 'Use pin_comment() to pin comments';
  end if;
  -- like_count is kept by the comment_likes trigger, which runs as the
  -- liker; let only that column move on its own.
  if new.profile_id is distinct from old.profile_id
     or new.video_id is distinct from old.video_id
     or new.parent_id is distinct from old.parent_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the comment text can be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_comment_update on public.comments;
create trigger trg_guard_comment_update
  before update on public.comments
  for each row execute function public.guard_comment_update();
