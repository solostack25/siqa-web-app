import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { amount, fundraiserId, donorName } = await req.json();
    const donationAmount = Number(amount);

    if (!Number.isInteger(donationAmount) || donationAmount < 100) {
      return json({ error: 'Minimum donation is $1.00' }, 400);
    }

    if (!fundraiserId || typeof fundraiserId !== 'string') {
      return json({ error: 'Missing fundraiserId' }, 400);
    }

    const { data: fundraiser, error: fundraiserError } = await supabase
      .from('fundraisers')
      .select('id,title,org_id,status,organizations(id,org_name,is_verified,stripe_account_id,stripe_onboarded)')
      .eq('id', fundraiserId)
      .single();

    if (fundraiserError || !fundraiser) {
      return json({ error: 'Fundraiser not found' }, 404);
    }

    if (fundraiser.status !== 'active') {
      return json({ error: 'This fundraiser is not currently accepting donations' }, 400);
    }

    const org = Array.isArray(fundraiser.organizations)
      ? fundraiser.organizations[0]
      : fundraiser.organizations;

    if (!org?.is_verified) {
      return json({ error: 'This organization is not verified for donations' }, 400);
    }

    const platformFee = Math.max(Math.round(donationAmount * 0.01), 50);

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: donationAmount,
      currency: 'usd',
      metadata: {
        fundraiser_id: fundraiser.id,
        org_id: fundraiser.org_id ?? '',
        donor_name: typeof donorName === 'string' && donorName.trim() ? donorName.trim() : 'Anonymous',
        campaign_title: fundraiser.title ?? '',
        platform_fee: String(platformFee),
      },
    };

    if (org?.stripe_account_id && org?.stripe_onboarded) {
      paymentIntentParams.application_fee_amount = platformFee;
      paymentIntentParams.transfer_data = {
        destination: org.stripe_account_id,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee,
      fundraiser: {
        id: fundraiser.id,
        title: fundraiser.title,
        orgId: fundraiser.org_id,
        orgName: org?.org_name ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown payment error';
    console.error('Payment intent error:', err);
    return json({ error: message }, 500);
  }
});
