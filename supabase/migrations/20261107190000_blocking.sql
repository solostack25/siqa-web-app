-- Blocking (App Store Guideline 1.2). user_blocks and content_reports
-- already exist; this adds what the app needs on top:
--  * a helper that says whether two people have blocked each other
--  * no messages across a block, either direction
--  * a unique pair on user_blocks so Block is idempotent

create unique index if not exists user_blocks_pair_idx on public.user_blocks (blocker_id, blocked_id);

create or replace function public.siqa_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function public.siqa_blocked_between(uuid, uuid) from public;
grant execute on function public.siqa_blocked_between(uuid, uuid) to authenticated;

-- The other person in a marketplace thread, seen from auth.uid().
create or replace function public.siqa_thread_other_party(p_thread uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select case when t.buyer_id = auth.uid() then s.user_id else t.buyer_id end
  from public.marketplace_threads t
  join public.marketplace_sellers s on s.id = t.seller_id
  where t.id = p_thread;
$$;
revoke all on function public.siqa_thread_other_party(uuid) from public;
grant execute on function public.siqa_thread_other_party(uuid) to authenticated;

-- Restrictive: applies on top of the existing "participants can send" policy.
drop policy if exists "No messages across a block" on public.marketplace_messages;
create policy "No messages across a block" on public.marketplace_messages
  as restrictive for insert to authenticated
  with check (not public.siqa_blocked_between(auth.uid(), public.siqa_thread_other_party(thread_id)));
