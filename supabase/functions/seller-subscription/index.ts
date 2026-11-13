import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Seller plans (monthly, by number of live products):
//   starter ≤5 $5 · growth ≤10 $10 · pro unlimited $15
// Actions:
//   checkout — new plan: returns a Stripe Checkout URL
//   change   — already subscribed: switches tier now (prorated)
//   portal   — returns a Stripe Billing Portal URL (card, invoices, cancel)
// The stripe-webhook function writes the result to marketplace_sellers.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANS = {
  starter: { name: 'Siqa Seller — up to 5 products', cents: 500 },
  growth: { name: 'Siqa Seller — up to 10 products', cents: 1000 },
  pro: { name: 'Siqa Seller — unlimited products', cents: 1500 },
} as const;
type Tier = keyof typeof PLANS;
const lookupKey = (tier: Tier) => `siqa_seller_${tier}_monthly`;

const DEFAULT_RETURN_URL = 'https://www.siqa.us/sell';

function isAllowedReturnUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    if (u.protocol === 'siqa:') return true;
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'thesiqaapp.com' || h.endsWith('.thesiqaapp.com') || h === 'siqa.us' || h.endsWith('.siqa.us')
      || (h.endsWith('.vercel.app') && h.startsWith('siqa-web-'));
  } catch {
    return false;
  }
}

function withParam(url: string, key: string, value: string) {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

/** Find the plan's price by lookup key, creating product + price the first time. */
async function priceFor(tier: Tier): Promise<string> {
  const key = lookupKey(tier);
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const product = await stripe.products.create(
    { name: PLANS[tier].name, metadata: { product: 'marketplace', kind: 'seller_plan', tier } },
    { idempotencyKey: `siqa-seller-plan-product-${tier}` },
  );
  const price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: PLANS[tier].cents,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: key,
      metadata: { product: 'marketplace', kind: 'seller_plan', tier },
    },
    { idempotencyKey: `siqa-seller-plan-price-${tier}` },
  );
  return price.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return respond({ error: 'Sign in again to manage your plan.' }, 401);

    const { action = 'checkout', sellerId, tier, returnUrl } = await req.json();
    if (!sellerId) return respond({ error: 'Missing sellerId' }, 400);

    const { data: seller } = await supabase
      .from('marketplace_sellers')
      .select('id, user_id, shop_name, approval_status, plan_tier, plan_status, stripe_customer_id, stripe_subscription_id')
      .eq('id', sellerId)
      .single();
    if (!seller) return respond({ error: 'Shop not found' }, 404);
    if (seller.user_id !== user.id) return respond({ error: 'You can only manage your own shop.' }, 403);

    const back = isAllowedReturnUrl(returnUrl) ? returnUrl : DEFAULT_RETURN_URL;
    const hasLiveSub = !!seller.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(seller.plan_status);

    if (action === 'portal') {
      if (!seller.stripe_customer_id) return respond({ error: 'No billing account yet — pick a plan first.' }, 400);
      const session = await stripe.billingPortal.sessions.create({ customer: seller.stripe_customer_id, return_url: back });
      return respond({ url: session.url });
    }

    if (!tier || !(tier in PLANS)) return respond({ error: 'Pick a plan.' }, 400);
    const priceId = await priceFor(tier as Tier);

    // Already subscribed: switch the price on the existing subscription.
    if (hasLiveSub) {
      if (seller.plan_tier === tier) return respond({ updated: true, tier });
      const sub = await stripe.subscriptions.retrieve(seller.stripe_subscription_id!);
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: sub.items.data[0].id, price: priceId }],
        proration_behavior: 'create_prorations',
        cancel_at_period_end: false,
        metadata: { ...sub.metadata, tier },
      });
      return respond({ updated: true, tier });
    }

    if (seller.approval_status !== 'approved') {
      return respond({ error: 'Your shop needs to be approved before you pick a plan.' }, 400);
    }

    let customerId = seller.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          name: seller.shop_name ?? undefined,
          metadata: { marketplace_seller_id: seller.id, user_id: user.id },
        },
        { idempotencyKey: `siqa-seller-customer-${seller.id}` },
      );
      customerId = customer.id;
      await supabase.from('marketplace_sellers').update({ stripe_customer_id: customerId }).eq('id', seller.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: seller.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        description: `Siqa seller plan — ${seller.shop_name ?? ''}`.trim(),
        metadata: { product: 'marketplace', kind: 'seller_plan', marketplace_seller_id: seller.id, tier },
      },
      metadata: { product: 'marketplace', kind: 'seller_plan', marketplace_seller_id: seller.id, tier },
      success_url: withParam(back, 'plan', 'success'),
      cancel_url: withParam(back, 'plan', 'cancelled'),
    });
    return respond({ url: session.url });
  } catch (err) {
    console.error('seller-subscription error:', err);
    return respond({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
