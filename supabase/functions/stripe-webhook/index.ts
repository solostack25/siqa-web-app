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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEventAsync
      ? await stripe.webhooks.constructEventAsync(body, signature ?? '', webhookSecret ?? '')
      : stripe.webhooks.constructEvent(body, signature ?? '', webhookSecret ?? '');
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const meta = intent.metadata;

    // Update donation status
    await supabase
      .from('donations')
      .update({ status: 'completed' })
      .eq('stripe_payment_intent_id', intent.id);

    // Increment fundraiser raised_amount and donor_count
    if (meta.fundraiser_id) {
      const { data: current } = await supabase
        .from('fundraisers')
        .select('raised_amount, donor_count')
        .eq('id', meta.fundraiser_id)
        .single();

      if (current) {
        await supabase
          .from('fundraisers')
          .update({
            raised_amount: (current.raised_amount || 0) + intent.amount,
            donor_count: (current.donor_count || 0) + 1,
          })
          .eq('id', meta.fundraiser_id);
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    await supabase
      .from('donations')
      .update({ status: 'failed' })
      .eq('stripe_payment_intent_id', intent.id);
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    if (account.details_submitted) {
      await supabase
        .from('organizations')
        .update({ stripe_onboarded: true })
        .eq('stripe_account_id', account.id);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});