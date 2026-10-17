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

// Marketplace checkout. Pricing, stock, shipping and tax are all computed
// here from live rows, never trusted from the client.
//
//   mode "quote": returns items / shipping per shop / sales tax / total for
//                 the buyer's address. Writes nothing.
//   mode "pay":   recalculates the same, saves a marketplace_checkouts row and
//                 one marketplace_orders row per product, and creates ONE
//                 PaymentIntent for the whole cart (however many shops).
//
// Buyer pays items + each shop's flat shipping + sales tax. Sales tax comes
// from Stripe Tax (only in states registered in the Stripe dashboard) and is
// kept by Siqa to remit, as the marketplace facilitator. After payment, the
// stripe-webhook function records the tax transaction and splits the rest
// per seller (Siqa 6.5% of items+shipping, processing and the Stripe Tax fee
// passed to sellers) and transfers each seller their part.

type Address = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

/** Stripe Tax product codes. Everything else is general tangible goods. */
function taxCodeFor(product: { is_digital: boolean; category: string | null }) {
  if (product.is_digital) return 'txcd_10000000'; // electronically supplied
  if (product.category === 'Clothing & Accessories') return 'txcd_30011000'; // clothing
  return 'txcd_99999999'; // general tangible goods
}

/** Split `total` into integer parts proportional to `weights` (sums exactly). */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) { const out = weights.map(() => 0); out[0] = total; return out; }
  const raw = weights.map(w => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) floors[order[k].i] += 1;
  return floors;
}

class CheckoutError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

async function priceCart(buyerId: string, items: { productId: string; quantity: number }[], address: Address) {
  const productIds = items.map(i => i.productId).filter(Boolean);
  const { data: products, error: productsError } = await supabase
    .from('marketplace_products')
    // marketplace_sellers has its own FK back to marketplace_products
    // (featured_product_id), so the embed must name the real FK.
    .select('id, title, price_cents, currency, inventory_count, is_digital, status, category, seller_id, marketplace_sellers!marketplace_products_seller_id_fkey(id, shop_name, shipping_cents)')
    .in('id', productIds);
  if (productsError || !products || products.length === 0) throw new CheckoutError('Products not found', 404);

  const lines: {
    product: any;
    quantity: number;
    total_cents: number;
  }[] = [];
  for (const item of items) {
    const product = products.find((p: any) => p.id === item.productId);
    const quantity = Number(item.quantity) || 0;
    if (!product) throw new CheckoutError(`Product ${item.productId} not found`, 404);
    if (product.status !== 'active') throw new CheckoutError(`"${product.title}" is no longer available`);
    if (quantity < 1) throw new CheckoutError('Invalid quantity');
    if (!product.is_digital && quantity > product.inventory_count) throw new CheckoutError(`Not enough stock for "${product.title}"`);
    lines.push({ product, quantity, total_cents: product.price_cents * quantity });
  }

  // Flat shipping once per shop, only if that shop has a physical item here.
  const shippingBySeller: Record<string, number> = {};
  const shopNames: Record<string, string> = {};
  for (const l of lines) {
    const seller = l.product.marketplace_sellers as { id: string; shop_name: string; shipping_cents: number | null } | null;
    shopNames[l.product.seller_id] = seller?.shop_name ?? 'Shop';
    if (!l.product.is_digital) shippingBySeller[l.product.seller_id] = Math.max(0, seller?.shipping_cents ?? 0);
    else if (!(l.product.seller_id in shippingBySeller)) shippingBySeller[l.product.seller_id] = 0;
  }
  // Each line's share of its shop's shipping (physical items only); used for
  // tax on shipping, refunds and seller payouts.
  const lineShipping: number[] = lines.map(() => 0);
  for (const sellerId of Object.keys(shippingBySeller)) {
    const idxs = lines.map((l, i) => (l.product.seller_id === sellerId && !l.product.is_digital ? i : -1)).filter(i => i >= 0);
    allocate(shippingBySeller[sellerId], idxs.map(i => lines[i].total_cents)).forEach((c, k) => { lineShipping[idxs[k]] = c; });
  }
  const itemsCents = lines.reduce((n, l) => n + l.total_cents, 0);
  const shippingCents = Object.values(shippingBySeller).reduce((a, b) => a + b, 0);
  const hasPhysical = lines.some(l => !l.product.is_digital);

  // Address: a US address is needed to ship and to work out sales tax.
  const country = (address.country || 'US').toUpperCase();
  if (!address.postal_code || (hasPhysical && (!address.line1 || !address.city || !address.state || !address.name))) {
    throw new CheckoutError(hasPhysical ? 'Enter your full shipping address.' : 'Enter your billing ZIP code.', 400, 'address_incomplete');
  }

  // Sales tax via Stripe Tax.
  let taxCents = 0;
  let calculationId: string | null = null;
  let taxStatus: 'calculated' | 'not_configured' = 'calculated';
  const lineTax: number[] = lines.map(() => 0);
  try {
    const calc = await stripe.tax.calculations.create({
      currency: 'usd',
      line_items: lines.map((l, i) => ({
        amount: l.total_cents,
        quantity: l.quantity,
        reference: `line_${i}_${l.product.id}`,
        tax_code: taxCodeFor(l.product),
        tax_behavior: 'exclusive',
      })),
      ...(shippingCents > 0 ? { shipping_cost: { amount: shippingCents, tax_behavior: 'exclusive' } } : {}),
      customer_details: {
        address: {
          line1: address.line1 || undefined,
          line2: address.line2 || undefined,
          city: address.city || undefined,
          state: address.state || undefined,
          postal_code: address.postal_code,
          country,
        },
        address_source: hasPhysical ? 'shipping' : 'billing',
      },
      expand: ['line_items'],
    } as any);
    calculationId = calc.id;
    taxCents = calc.tax_amount_exclusive;
    // Tax per line: the line's own tax plus a share of any tax on shipping,
    // split by each line's share of its shop's shipping.
    for (const li of (calc as any).line_items?.data ?? []) {
      const idx = Number(String(li.reference).split('_')[1]);
      if (Number.isInteger(idx) && lines[idx]) lineTax[idx] = li.amount_tax ?? 0;
    }
    const shippingTax = (calc as any).shipping_cost?.amount_tax ?? 0;
    if (shippingTax > 0) {
      allocate(shippingTax, lineShipping).forEach((t, i) => { lineTax[i] += t; });
    }
  } catch (err: any) {
    if (err?.code === 'customer_tax_location_invalid') {
      throw new CheckoutError("We couldn't verify that address for tax. Check the street, city, state and ZIP.", 400, 'address_invalid');
    }
    if (err?.code === 'stripe_tax_inactive') {
      // Stripe Tax isn't turned on yet: don't block checkout, but flag it.
      console.warn('Stripe Tax inactive — checkout proceeding without sales tax');
      taxStatus = 'not_configured';
      taxCents = 0;
    } else {
      throw err;
    }
  }

  return {
    buyerId,
    lines,
    shippingBySeller,
    shopNames,
    itemsCents,
    shippingCents,
    taxCents,
    lineTax,
    lineShipping,
    totalCents: itemsCents + shippingCents + taxCents,
    calculationId,
    taxStatus,
    address: { ...address, country },
    hasPhysical,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { buyerId, items, address, mode } = await req.json();
    // items: [{ productId: string, quantity: number }]

    if (!buyerId || typeof buyerId !== 'string') return json({ error: 'Missing buyerId' }, 400);
    if (!Array.isArray(items) || items.length === 0) return json({ error: 'Cart is empty' }, 400);

    const priced = await priceCart(buyerId, items, (address ?? {}) as Address);

    if (priced.totalCents < 50) return json({ error: 'Order total is too small to process' }, 400);

    if (mode === 'quote') {
      return json({
        itemsCents: priced.itemsCents,
        shippingCents: priced.shippingCents,
        shippingByShop: Object.entries(priced.shippingBySeller)
          .filter(([, cents]) => cents > 0)
          .map(([sellerId, cents]) => ({ sellerId, shopName: priced.shopNames[sellerId], cents })),
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        taxStatus: priced.taxStatus,
      });
    }

    // ── Pay: save the checkout + order lines, then one PaymentIntent ──
    const addr = priced.address;
    const shippingAddress = {
      line1: addr.line1 ?? null, line2: addr.line2 ?? null, city: addr.city ?? null,
      state: addr.state ?? null, postal_code: addr.postal_code ?? null, country: addr.country,
    };

    const { data: checkout, error: checkoutError } = await supabase
      .from('marketplace_checkouts')
      .insert({
        buyer_id: buyerId,
        shipping_name: addr.name ?? null,
        shipping_address: shippingAddress,
        items_cents: priced.itemsCents,
        shipping_cents: priced.shippingCents,
        tax_cents: priced.taxCents,
        total_cents: priced.totalCents,
        tax_calculation_id: priced.calculationId,
        tax_status: priced.taxStatus,
        shipping_by_seller: priced.shippingBySeller,
      })
      .select('id')
      .single();
    if (checkoutError || !checkout) return json({ error: checkoutError?.message ?? 'Could not start checkout' }, 500);

    const orderRows = priced.lines.map((l, i) => ({
      buyer_id: buyerId,
      product_id: l.product.id,
      seller_id: l.product.seller_id,
      quantity: l.quantity,
      total_cents: l.total_cents,
      status: 'pending',
      checkout_id: checkout.id,
      tax_cents: priced.lineTax[i],
      shipping_cents: priced.lineShipping[i],
      shipping_name: addr.name ?? null,
      shipping_address: priced.hasPhysical ? shippingAddress : null,
    }));

    const { data: insertedOrders, error: insertError } = await supabase
      .from('marketplace_orders')
      .insert(orderRows)
      .select('id');
    if (insertError || !insertedOrders) return json({ error: insertError?.message ?? 'Could not create order' }, 500);

    const orderIds = insertedOrders.map(o => o.id);
    const transferGroup = `siqa_checkout_${checkout.id}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: priced.totalCents,
      currency: 'usd',
      transfer_group: transferGroup,
      ...(priced.hasPhysical && addr.line1
        ? { shipping: { name: addr.name || 'Siqa buyer', address: { line1: addr.line1, line2: addr.line2 || undefined, city: addr.city, state: addr.state, postal_code: addr.postal_code, country: addr.country } } }
        : {}),
      metadata: {
        product: 'marketplace', // read by siqa-admin Finance sync
        checkout_id: checkout.id,
        // Stripe caps metadata values at 500 chars (~13 order ids). Larger
        // carts leave this out; the webhook then looks orders up by checkout.
        ...(orderIds.join(',').length <= 500 ? { order_ids: orderIds.join(',') } : {}),
        buyer_id: buyerId,
        transfer_group: transferGroup,
        ...(priced.calculationId ? { tax_calculation: priced.calculationId } : {}),
        seller_count: String(Object.keys(priced.shippingBySeller).length),
      },
    });

    await Promise.all([
      supabase.from('marketplace_orders').update({ stripe_payment_intent_id: paymentIntent.id }).in('id', orderIds),
      supabase.from('marketplace_checkouts').update({ payment_intent_id: paymentIntent.id }).eq('id', checkout.id),
    ]);

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      checkoutId: checkout.id,
      orderIds,
      itemsCents: priced.itemsCents,
      shippingCents: priced.shippingCents,
      taxCents: priced.taxCents,
      totalCents: priced.totalCents,
    });
  } catch (err) {
    if (err instanceof CheckoutError) return json({ error: err.message, code: err.code }, err.status);
    const message = err instanceof Error ? err.message : 'Unknown checkout error';
    console.error('Marketplace payment intent error:', err);
    return json({ error: message }, 500);
  }
});
