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

    const { sellerId, shopName, email, returnUrl } = await req.json();

    if (!sellerId) {
      return new Response(JSON.stringify({ error: 'Missing sellerId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: seller } = await supabase
      .from('marketplace_sellers')
      .select('stripe_account_id, stripe_onboarded')
      .eq('id', sellerId)
      .single();

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
      refresh_url: returnUrl ?? 'https://gems.thesiqaapp.com/seller-dashboard',
      return_url: returnUrl ?? 'https://gems.thesiqaapp.com/seller-dashboard',
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
