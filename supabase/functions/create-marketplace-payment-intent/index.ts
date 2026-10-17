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

// Mirrors the original Next.js marketplace's /api/checkout: pricing,
// stock checks, and order rows are all computed server-side from the
// live product row, never trusted from the client.
//
// One PaymentIntent covers the whole cart, however many shops are in it
// (Stripe "separate charges and transfers"). The buyer pays Siqa once;
// when the payment succeeds, the stripe-webhook function splits it per
// seller (Siqa's 6.5% fee + each seller's share of Stripe's processing
// fee) and transfers each seller their part, or records it as owed if
// they haven't finished Stripe setup. The transfer_group links the
// charge to those transfers in Stripe.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { buyerId, items } = await req.json();
    // items: [{ productId: string, quantity: number }]

    if (!buyerId || typeof buyerId !== 'string') {
      return json({ error: 'Missing buyerId' }, 400);
    }
    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: 'Cart is empty' }, 400);
    }

    const productIds = items.map((i: any) => i.productId).filter(Boolean);
    const { data: products, error: productsError } = await supabase
      .from('marketplace_products')
      // Same disambiguation as the browse query in the app — marketplace_sellers
      // has its own FK back to marketplace_products (featured_product_id), so
      // this embed is ambiguous without naming the actual FK explicitly.
      .select('id, title, price_cents, currency, inventory_count, is_digital, status, seller_id, marketplace_sellers!marketplace_products_seller_id_fkey(id, stripe_account_id, stripe_onboarded)')
      .in('id', productIds);

    if (productsError || !products || products.length === 0) {
      return json({ error: 'Products not found' }, 404);
    }

    const orderRows: Record<string, unknown>[] = [];
    let totalCents = 0;
    const sellerIds = new Set<string>();

    for (const item of items) {
      const product = products.find((p: any) => p.id === item.productId);
      const quantity = Number(item.quantity) || 0;

      if (!product) return json({ error: `Product ${item.productId} not found` }, 404);
      if (product.status !== 'active') return json({ error: `"${product.title}" is no longer available` }, 400);
      if (quantity < 1) return json({ error: 'Invalid quantity' }, 400);
      if (!product.is_digital && quantity > product.inventory_count) {
        return json({ error: `Not enough stock for "${product.title}"` }, 400);
      }

      const lineTotal = product.price_cents * quantity;
      totalCents += lineTotal;
      sellerIds.add(product.seller_id);

      orderRows.push({
        buyer_id: buyerId,
        product_id: product.id,
        seller_id: product.seller_id,
        quantity,
        total_cents: lineTotal,
        status: 'pending',
      });
    }

    if (totalCents < 50) {
      return json({ error: 'Order total is too small to process' }, 400);
    }

    const { data: insertedOrders, error: insertError } = await supabase
      .from('marketplace_orders')
      .insert(orderRows)
      .select('id, seller_id, total_cents');

    if (insertError || !insertedOrders) {
      return json({ error: insertError?.message ?? 'Could not create order' }, 500);
    }

    const orderIds = insertedOrders.map(o => o.id);
    const transferGroup = `siqa_checkout_${orderIds[0]}`;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: totalCents,
      currency: 'usd',
      transfer_group: transferGroup,
      metadata: {
        product: 'marketplace', // read by siqa-admin Finance sync
        // Stripe caps metadata values at 500 chars (~13 order ids). Larger
        // carts leave this out; the webhook then finds the orders by their
        // stored stripe_payment_intent_id instead.
        ...(orderIds.join(',').length <= 500 ? { order_ids: orderIds.join(',') } : {}),
        buyer_id: buyerId,
        transfer_group: transferGroup,
        seller_count: String(sellerIds.size),
      },
    };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    await supabase
      .from('marketplace_orders')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .in('id', orderIds);

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      orderIds,
      totalCents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown checkout error';
    console.error('Marketplace payment intent error:', err);
    return json({ error: message }, 500);
  }
});
