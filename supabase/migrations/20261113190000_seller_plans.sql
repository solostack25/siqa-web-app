-- Seller plans: shops pay monthly by how many products they have live.
--   starter  up to 5 live products   $5/mo
--   growth   up to 10 live products  $10/mo
--   pro      unlimited (11+)         $15/mo
-- Stripe Billing owns the subscription; the stripe-webhook function is the
-- only writer of these columns (sellers can't edit them, see the guard).
-- plan_exempt lets Siqa comp a shop (own store, partners) with no limit.

alter table public.marketplace_sellers
  add column if not exists plan_tier text check (plan_tier in ('starter', 'growth', 'pro')),
  add column if not exists plan_status text not null default 'none',
  add column if not exists plan_current_period_end timestamptz,
  add column if not exists plan_cancel_at_period_end boolean not null default false,
  add column if not exists plan_exempt boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- 'paused' = hidden because the shop's plan is full or not active.
alter table public.marketplace_products drop constraint if exists marketplace_products_status_check;
alter table public.marketplace_products add constraint marketplace_products_status_check
  check (status in ('draft', 'active', 'archived', 'paused'));

create unique index if not exists marketplace_sellers_stripe_subscription_id_key
  on public.marketplace_sellers (stripe_subscription_id) where stripe_subscription_id is not null;

-- How many live products a shop may have right now. null = no limit.
create or replace function public.seller_listing_limit(p_seller_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when s.plan_exempt then null
    when s.plan_status not in ('active', 'trialing', 'past_due') then 0
    when s.plan_tier = 'starter' then 5
    when s.plan_tier = 'growth' then 10
    when s.plan_tier = 'pro' then null
    else 0
  end
  from public.marketplace_sellers s
  where s.id = p_seller_id
$$;

grant execute on function public.seller_listing_limit(uuid) to authenticated;

-- Sellers can't change their own plan fields; only Stripe (via the webhook)
-- or Siqa staff can.
create or replace function public.guard_marketplace_sellers()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if public.siqa_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pending'; new.approved_at := null; new.approved_by := null;
    new.stripe_account_id := null; new.stripe_onboarded := false; new.stripe_charges_enabled := false;
    new.plan_tier := null; new.plan_status := 'none'; new.plan_current_period_end := null;
    new.plan_cancel_at_period_end := false; new.plan_exempt := false;
    new.stripe_customer_id := null; new.stripe_subscription_id := null;
    return new;
  end if;
  new.approval_status := old.approval_status;
  new.approved_at := old.approved_at;
  new.approved_by := old.approved_by;
  new.stripe_account_id := old.stripe_account_id;
  new.stripe_onboarded := old.stripe_onboarded;
  new.stripe_charges_enabled := old.stripe_charges_enabled;
  new.user_id := old.user_id;
  new.plan_tier := old.plan_tier;
  new.plan_status := old.plan_status;
  new.plan_current_period_end := old.plan_current_period_end;
  new.plan_cancel_at_period_end := old.plan_cancel_at_period_end;
  new.plan_exempt := old.plan_exempt;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  return new;
end $function$;

-- Enforce the plan's product limit.
--   New product over the limit (or no plan yet) -> saved as 'paused'; it goes
--   live automatically when the seller picks/upgrades a plan.
--   Switching a hidden product back to 'active' over the limit -> error.
-- 'paused' = hidden by the plan; 'archived' = hidden by the seller.
create or replace function public.enforce_seller_listing_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  lim integer;
  live integer;
begin
  if current_user not in ('anon', 'authenticated') or public.is_solostack_moderator() then
    return new;
  end if;
  if new.status is distinct from 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  lim := public.seller_listing_limit(new.seller_id);
  if lim is null then return new; end if;

  select count(*) into live
  from public.marketplace_products
  where seller_id = new.seller_id and status = 'active' and id <> new.id;

  if live >= lim then
    if tg_op = 'INSERT' then
      new.status := 'paused';
      return new;
    end if;
    if lim = 0 then
      raise exception 'Choose a seller plan to put products live.' using errcode = 'P0001', hint = 'plan_required';
    end if;
    raise exception 'Your plan allows % live products. Upgrade your plan or hide another product first.', lim
      using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $function$;

drop trigger if exists marketplace_products_enforce_plan_limit on public.marketplace_products;
create trigger marketplace_products_enforce_plan_limit
  before insert or update of status on public.marketplace_products
  for each row execute function public.enforce_seller_listing_limit();

-- Called by the webhook whenever a seller's plan changes: hide what's over
-- the limit (newest first) and bring plan-paused products back (oldest
-- first) when there's room again. Seller-archived products are left alone.
create or replace function public.apply_seller_plan_limit(p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lim integer := public.seller_listing_limit(p_seller_id);
  live integer;
begin
  select count(*) into live from public.marketplace_products
  where seller_id = p_seller_id and status = 'active';

  if lim is null or live < lim then
    update public.marketplace_products set status = 'active'
    where id in (
      select id from public.marketplace_products
      where seller_id = p_seller_id and status = 'paused'
      order by created_at asc
      limit case when lim is null then null else lim - live end
    );
  elsif live > lim then
    update public.marketplace_products set status = 'paused'
    where id in (
      select id from public.marketplace_products
      where seller_id = p_seller_id and status = 'active'
      order by created_at desc
      limit live - lim
    );
  end if;
end $function$;

revoke all on function public.apply_seller_plan_limit(uuid) from public, anon, authenticated;
