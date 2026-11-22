-- Ticket and gift payments: event-pay (edge function) creates a pending order or gift, the buyer pays with
-- Stripe, then event-pay confirms with Stripe and calls these to issue tickets / count the gift.
-- (Applied to production 2026-11-22.)
alter table public.event_orders add column if not exists guests jsonb not null default '[]'::jsonb;   -- [{"name","email","diet"}] in ticket order
alter table public.event_orders add column if not exists gift_show_name boolean not null default false;

-- Marks an order paid and issues its tickets. Safe to call twice. Service role only.
create or replace function public.event_fulfill_order(p_order uuid, p_payment_intent text)
returns json language plpgsql security definer set search_path = '' as $$
declare o public.event_orders; it jsonb; t public.event_ticket_types; n int := 0; i int; g jsonb;
begin
  select * into o from public.event_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status = 'paid' then return json_build_object('ok', true, 'token', o.token, 'already', true); end if;
  update public.event_orders set status = 'paid', paid_at = now(), stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id) where id = o.id;
  for it in select * from jsonb_array_elements(o.items) loop
    select * into t from public.event_ticket_types where id = (it->>'ticket_type_id')::uuid;
    for i in 1 .. ((it->>'qty')::int * coalesce(t.seats, 1)) loop
      g := o.guests -> n;
      insert into public.event_attendees (event_id, order_id, ticket_type_id, name, email, diet, kind)
      values (o.event_id, o.id, t.id,
              coalesce(nullif(trim(g->>'name'), ''), case when n = 0 then o.buyer_name else coalesce(o.buyer_name, 'Guest') || ' — guest ' || (n + 1) end),
              coalesce(nullif(trim(g->>'email'), ''), case when n = 0 then o.buyer_email end),
              nullif(trim(g->>'diet'), ''), coalesce(t.kind, 'in_person'));
      n := n + 1;
    end loop;
  end loop;
  if o.gift_cents > 0 then
    insert into public.event_gifts (event_id, amount_cents, method, donor_name, donor_email, show_name, status, stripe_payment_intent_id, test_mode, logged_by)
    values (o.event_id, o.gift_cents, 'card', o.buyer_name, o.buyer_email, o.gift_show_name, 'confirmed',
            case when p_payment_intent is null then null else p_payment_intent || ':checkout' end, o.test_mode, 'Ticket checkout');
  end if;
  return json_build_object('ok', true, 'token', o.token);
end $$;
revoke all on function public.event_fulfill_order(uuid, text) from public, anon, authenticated;

create or replace function public.event_fulfill_gift(p_gift uuid)
returns json language plpgsql security definer set search_path = '' as $$
begin
  update public.event_gifts set status = 'confirmed' where id = p_gift and status = 'pending';
  return json_build_object('ok', true);
end $$;
revoke all on function public.event_fulfill_gift(uuid) from public, anon, authenticated;
