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

// Same formulas as lib/donationFees.ts in the app — keep in sync.
// Siqa fee: 1% of the gift (min 50¢). Card processing: 2.9% + 30¢ of the
// charge; with destination charges Stripe bills Siqa for it, so Siqa's
// application fee includes it. If the donor covers fees, the charge is
// grossed up so the organization gets the whole gift.
function quoteDonation(gift: number, coverFees: boolean) {
  const platformFee = Math.max(Math.round(gift * 0.01), 50);
  const cardFee = (charge: number) => Math.round(charge * 0.029) + 30;
  if (!coverFees) {
    return { charge: gift, platformFee, orgReceives: gift - platformFee - cardFee(gift) };
  }
  let charge = Math.ceil((gift + platformFee + 30) / (1 - 0.029));
  while (charge - platformFee - cardFee(charge) < gift) charge += 1;
  return { charge, platformFee, orgReceives: gift };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { amount, fundraiserId, donorName, coverFees } = await req.json();
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

    // Without a connected account the money would land in Siqa's own
    // balance instead of going to the organization — refuse instead.
    if (!org?.stripe_account_id || !org?.stripe_onboarded) {
      return json({ error: "This organization hasn't set up payments yet." }, 400);
    }

    const quote = quoteDonation(donationAmount, coverFees === true);
    const platformFee = quote.platformFee;
    // Everything except what the organization receives stays with Siqa:
    // its 1% plus the card processing Stripe charges Siqa.
    const applicationFee = quote.charge - quote.orgReceives;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: quote.charge,
      currency: 'usd',
      metadata: {
        fundraiser_id: fundraiser.id,
        org_id: fundraiser.org_id ?? '',
        donor_name: typeof donorName === 'string' && donorName.trim() ? donorName.trim() : 'Anonymous',
        campaign_title: fundraiser.title ?? '',
        platform_fee: String(platformFee),
        gift_amount: String(donationAmount),
        donor_covers_fees: coverFees === true ? 'true' : 'false',
        org_receives: String(quote.orgReceives),
      },
    };

    paymentIntentParams.application_fee_amount = applicationFee;
    paymentIntentParams.transfer_data = { destination: org.stripe_account_id };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee,
      chargeAmount: quote.charge,
      orgReceives: quote.orgReceives,
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
