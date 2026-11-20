-- Seller plans, take two: cheaper than Etsy.
--   Free  up to 10 live products, $0/mo, Siqa keeps 3% per sale
--   Pro   unlimited products,     $15/mo, Siqa keeps 1% per sale
-- Card processing is still passed through to the seller at cost.
-- Founding sellers (promo code FOUNDINGSELLER): unlimited products and a 0%
-- Siqa fee until founding_until (6 months from redeeming).
-- Comped shops (plan_exempt): unlimited products, Pro rate.
-- No shop had a paid starter/growth plan when this shipped; those tiers are
-- retired (any that existed would simply be treated as Free).

alter table public.marketplace_sellers
  add column if not exists founding_until timestamptz,
  add column if not exists promo_code text;

-- Promo codes for sellers. Only Siqa staff manage these (RLS on, no policies).
create table if not exists public.seller_promo_codes (
  code text primary key,                 -- stored upper-case
  description text,
  founding_months integer not null default 6,
  max_redemptions integer,               -- null = no cap
  redemptions integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.seller_promo_codes enable row level security;

insert into public.seller_promo_codes (code, description, founding_months, max_redemptions)
values ('FOUNDINGSELLER', 'Founding sellers: 0% Siqa fee + unlimited products for 6 months', 6, 50)
on conflict (code) do nothing;

-- Live-product limit. null = unlimited.
create or replace function public.seller_listing_limit(p_seller_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when s.plan_exempt then null
    when s.founding_until is not null and s.founding_until > now() then null
    when s.plan_tier = 'pro' and s.plan_status in ('active', 'trialing', 'past_due') then null
    else 10
  end
  from public.marketplace_sellers s
  where s.id = p_seller_id
$$;

-- Siqa's cut of a seller's items + shipping, as a fraction.
create or replace function public.seller_fee_rate(p_seller_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when s.founding_until is not null and s.founding_until > now() then 0
    when s.plan_exempt then 0.01
    when s.plan_tier = 'pro' and s.plan_status in ('active', 'trialing', 'past_due') then 0.01
    else 0.03
  end
  from public.marketplace_sellers s
  where s.id = p_seller_id
$$;
grant execute on function public.seller_fee_rate(uuid) to authenticated;

-- Sellers can't set founding status or the code themselves.
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
    new.founding_until := null; new.promo_code := null;
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
  new.founding_until := old.founding_until;
  new.promo_code := old.promo_code;
  return new;
end $function$;

-- The shop owner redeems a code. One code per shop; respects the cap.
create or replace function public.redeem_seller_promo(p_seller_id uuid, p_code text)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.marketplace_sellers;
  c public.seller_promo_codes;
  until_ts timestamptz;
begin
  select * into s from public.marketplace_sellers where id = p_seller_id for update;
  if s.id is null or s.user_id is distinct from auth.uid() then
    raise exception 'Shop not found.' using errcode = 'P0001';
  end if;
  if s.promo_code is not null then
    raise exception 'Your shop already used the code %.', s.promo_code using errcode = 'P0001';
  end if;

  select * into c from public.seller_promo_codes where code = upper(trim(p_code)) for update;
  if c.code is null or not c.active or (c.expires_at is not null and c.expires_at < now()) then
    raise exception 'That code isn''t valid.' using errcode = 'P0001';
  end if;
  if c.max_redemptions is not null and c.redemptions >= c.max_redemptions then
    raise exception 'That code has been fully claimed.' using errcode = 'P0001';
  end if;

  until_ts := now() + make_interval(months => c.founding_months);
  update public.seller_promo_codes set redemptions = redemptions + 1 where code = c.code;
  -- Runs as the function owner, so the guard trigger lets these through.
  update public.marketplace_sellers set founding_until = until_ts, promo_code = c.code where id = s.id;
  perform public.apply_seller_plan_limit(s.id);
  return until_ts;
end $function$;
revoke all on function public.redeem_seller_promo(uuid, text) from public, anon;
grant execute on function public.redeem_seller_promo(uuid, text) to authenticated;

-- Shops start on Free now, so products that were waiting on a plan go live.
select public.apply_seller_plan_limit(id) from public.marketplace_sellers;

-- When a founding period ends, hide anything over the Free limit (newest first).
select cron.unschedule('seller-founding-expiry') where exists (select 1 from cron.job where jobname = 'seller-founding-expiry');
select cron.schedule(
  'seller-founding-expiry',
  '17 6 * * *',
  $$select public.apply_seller_plan_limit(id) from public.marketplace_sellers
    where founding_until between now() - interval '2 days' and now()$$
);
