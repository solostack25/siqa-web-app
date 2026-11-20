import { Platform } from 'react-native';
import { supabase } from './supabase';

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

/**
 * App Store / Play Store: the native apps never sell or price seller plans,
 * show no buy button and no link to buy elsewhere (Apple 3.1.1 / 3.1.1(a),
 * Google Play billing). Plans are bought and changed on the website only;
 * the apps just read the plan and say it's managed on the Siqa website.
 */
export const PLANS_PURCHASABLE_HERE = Platform.OS === 'web';

export type PlanTier = 'free' | 'pro';

/**
 * Must match seller_listing_limit() / seller_fee_rate() in the DB and PLANS in
 * the seller-subscription function. Card processing is passed through at cost
 * on top of Siqa's fee.
 */
export const FREE_PRODUCT_LIMIT = 10;
export const SELLER_PLANS: { tier: PlanTier; price: number; limit: number | null; feePct: number; title: string; blurb: string }[] = [
  { tier: 'free', price: 0, limit: FREE_PRODUCT_LIMIT, feePct: 3, title: 'Free', blurb: 'Up to 10 products. Siqa keeps 3% per sale. No listing fees.' },
  { tier: 'pro', price: 15, limit: null, feePct: 1, title: 'Pro', blurb: 'Unlimited products. Siqa keeps just 1% per sale.' },
];

/** The promo code for founding sellers (0% Siqa fee + unlimited products for 6 months). */
export const FOUNDING_CODE = 'FOUNDINGSELLER';

export const LIVE_PLAN_STATUSES = ['active', 'trialing', 'past_due'];

export type SellerPlanFields = {
  plan_tier: string | null;
  plan_status: string;
  plan_exempt: boolean;
  plan_current_period_end: string | null;
  plan_cancel_at_period_end: boolean;
  founding_until?: string | null;
  promo_code?: string | null;
};

export const SELLER_PLAN_COLUMNS = 'plan_tier, plan_status, plan_exempt, plan_current_period_end, plan_cancel_at_period_end, founding_until, promo_code';

/** Every shop can sell now (Free is the default), so this is always true. Kept for older call sites. */
export function hasLivePlan(_s?: Pick<SellerPlanFields, 'plan_status' | 'plan_exempt'>) {
  return true;
}

/** Paying for Pro through Stripe. */
export function hasPaidPlan(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status'>) {
  return s.plan_tier === 'pro' && LIVE_PLAN_STATUSES.includes(s.plan_status);
}

export function isFounding(s: Pick<SellerPlanFields, 'founding_until'>) {
  return !!s.founding_until && new Date(s.founding_until).getTime() > Date.now();
}

/** Which plan the shop is effectively on. */
export function currentTier(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status'>): PlanTier {
  return hasPaidPlan(s) ? 'pro' : 'free';
}

/** Live-product limit for a shop: null = unlimited. */
export function planLimit(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status' | 'plan_exempt' | 'founding_until'>): number | null {
  if (s.plan_exempt || isFounding(s) || hasPaidPlan(s)) return null;
  return FREE_PRODUCT_LIMIT;
}

/** Siqa's fee on this shop's sales, in percent. */
export function feePct(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status' | 'plan_exempt' | 'founding_until'>): number {
  if (isFounding(s)) return 0;
  if (s.plan_exempt || hasPaidPlan(s)) return 1;
  return 3;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function planLabel(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status' | 'plan_exempt' | 'founding_until'>) {
  if (isFounding(s)) return `Founding seller · 0% fee until ${shortDate(s.founding_until!)}`;
  if (s.plan_exempt) return 'Comped by Siqa';
  if (hasPaidPlan(s)) return PLANS_PURCHASABLE_HERE ? 'Pro · $15/mo · 1% fee' : 'Pro';
  return 'Free · 3% fee';
}

/** Redeem a seller promo code (e.g. FOUNDINGSELLER) for the shop. */
export async function redeemSellerPromo(sellerId: string, code: string): Promise<{ until?: string; error?: string }> {
  const { data, error } = await supabase.rpc('redeem_seller_promo', { p_seller_id: sellerId, p_code: code.trim() });
  if (error) return { error: error.message };
  return { until: data as string };
}

/** Call the seller-subscription edge function. */
export async function sellerPlanRequest(body: {
  action: 'checkout' | 'change' | 'portal';
  sellerId: string;
  tier?: PlanTier;
  returnUrl?: string;
}): Promise<{ url?: string; updated?: boolean; error?: string }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? '';
  const res = await fetch(`${SUPABASE_URL}/functions/v1/seller-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ...body,
      returnUrl: body.returnUrl ?? (Platform.OS === 'web' ? window.location.origin + window.location.pathname : undefined),
    }),
  });
  const data = await res.json().catch(() => ({ error: 'Unexpected response from the server.' }));
  if (!res.ok && !data.error) data.error = `Request failed (${res.status})`;
  return data;
}
