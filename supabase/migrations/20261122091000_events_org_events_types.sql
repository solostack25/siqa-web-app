-- org_events: sum() of bigint is numeric, which didn't match the declared bigint column. Cast it.
-- (Applied to production 2026-11-22.)
create or replace function public.org_events(p_org uuid)
returns table (id uuid, slug text, title text, kind text, status text, starts_at timestamptz, venue text, goal_cents bigint, sold bigint, raised_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_masjid_admin(p_org) then raise exception 'not allowed'; end if;
  return query select e.id, e.slug, e.title, e.kind, e.status, e.starts_at, e.venue, e.goal_cents,
    (select count(*) from public.event_attendees a where a.event_id = e.id)::bigint,
    (e.pre_raised_cents + coalesce((select sum(g.amount_cents) from public.event_gifts g where g.event_id = e.id and g.status not in ('void', 'pending')), 0))::bigint
    from public.events e where e.org_id = p_org order by coalesce(e.starts_at, e.created_at) desc;
end $$;
