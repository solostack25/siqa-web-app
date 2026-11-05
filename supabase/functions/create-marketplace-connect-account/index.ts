import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_RETURN_URL = 'https://www.siqa.us/seller-dashboard';

/** Only send sellers back to our own sites (or the app), never an arbitrary URL. */
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

// Mirrors create-connect-account (used for org donation payouts) but
// targets marketplace_sellers / business_type 'individual' instead of
// organizations / 'non_profit' — sellers here are typically individual
// artisans, not registered nonprofits.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const respond = (body: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Who is calling: the seller's own Supabase login token. Previously this
    // trusted any sellerId in the body, so anyone could finish payout setup
    // on another seller's not-yet-onboarded Stripe account.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return respond({ error: 'Sign in again to connect payouts.' }, 401);

    const { sellerId, shopName, returnUrl } = await req.json();
    if (!sellerId) return respond({ error: 'Missing sellerId' }, 400);

    const { data: seller } = await supabase
      .from('marketplace_sellers')
      .select('user_id, stripe_account_id, stripe_onboarded')
      .eq('id', sellerId)
      .single();
    if (!seller) return respond({ error: 'Shop not found' }, 404);
    if (seller.user_id !== user.id) return respond({ error: 'You can only set up payouts for your own shop.' }, 403);

    const email = user.email ?? undefined;
    const safeReturnUrl = isAllowedReturnUrl(returnUrl) ? returnUrl : DEFAULT_RETURN_URL;

    let accountId = seller?.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        business_type: 'individual',
        metadata: {
          marketplace_seller_id: sellerId,
          shop_name: shopName ?? '',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      await supabase
        .from('marketplace_sellers')
        .update({ stripe_account_id: accountId })
        .eq('id', sellerId);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeReturnUrl,
      return_url: safeReturnUrl,
      type: 'account_onboarding',
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Marketplace connect account error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
