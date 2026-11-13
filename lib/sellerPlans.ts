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

export type PlanTier = 'starter' | 'growth' | 'pro';

/** Must match seller_listing_limit() in the DB and PLANS in the seller-subscription function. */
export const SELLER_PLANS: { tier: PlanTier; price: number; limit: number | null; title: string; blurb: string }[] = [
  { tier: 'starter', price: 5, limit: 5, title: 'Up to 5 products', blurb: 'For trying Siqa out or a small shop.' },
  { tier: 'growth', price: 10, limit: 10, title: 'Up to 10 products', blurb: 'Room to grow your line.' },
  { tier: 'pro', price: 15, limit: null, title: 'Unlimited products', blurb: '11 or more products — no cap.' },
];

export const LIVE_PLAN_STATUSES = ['active', 'trialing', 'past_due'];

export type SellerPlanFields = {
  plan_tier: PlanTier | null;
  plan_status: string;
  plan_exempt: boolean;
  plan_current_period_end: string | null;
  plan_cancel_at_period_end: boolean;
};

export const SELLER_PLAN_COLUMNS = 'plan_tier, plan_status, plan_exempt, plan_current_period_end, plan_cancel_at_period_end';

export function hasLivePlan(s: Pick<SellerPlanFields, 'plan_status' | 'plan_exempt'>) {
  return s.plan_exempt || LIVE_PLAN_STATUSES.includes(s.plan_status);
}

/** Live-product limit for a shop: null = unlimited, 0 = no plan. */
export function planLimit(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status' | 'plan_exempt'>): number | null {
  if (s.plan_exempt) return null;
  if (!LIVE_PLAN_STATUSES.includes(s.plan_status)) return 0;
  return SELLER_PLANS.find(p => p.tier === s.plan_tier)?.limit ?? 0;
}

export function planLabel(s: Pick<SellerPlanFields, 'plan_tier' | 'plan_status' | 'plan_exempt'>) {
  if (s.plan_exempt) return 'Comped by Siqa';
  const p = SELLER_PLANS.find(x => x.tier === s.plan_tier);
  if (!p || !LIVE_PLAN_STATUSES.includes(s.plan_status)) return 'No plan';
  return PLANS_PURCHASABLE_HERE ? `$${p.price}/mo · ${p.title}` : p.title;
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
