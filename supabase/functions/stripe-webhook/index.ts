import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { splitCheckout, SIQA_FEE_RATE, STRIPE_TAX_FEE_CENTS, type OrderLine } from './payouts.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Marketplace seller payouts ──────────────────────────────────────────────
// One checkout can include several shops. The buyer pays Siqa once; once the
// payment succeeds, each seller gets a Stripe transfer for their items minus
// Siqa's 6.5% fee and their share of Stripe's processing fee (see payouts.ts).
// Every step is safe to repeat, because Stripe retries webhooks.

type Payout = {
  id: string;
  payment_intent_id: string;
  charge_id: string | null;
  transfer_group: string | null;
  seller_id: string;
  payout_cents: number;
  status: string;
  stripe_transfer_id: string | null;
};

/** Send one payout row to the seller's Stripe account, or mark it owed. */
async function sendPayout(supabase: SupabaseClient, payout: Payout) {
  if (payout.status === 'transferred' || payout.status === 'reversed' || payout.status === 'cancelled') return;
  if (payout.payout_cents <= 0) {
    await supabase.from('marketplace_seller_payouts')
      .update({ status: 'cancelled', error: 'Nothing left to pay after fees' })
      .eq('id', payout.id);
    return;
  }

  const { data: seller } = await supabase
    .from('marketplace_sellers')
    .select('stripe_account_id, stripe_onboarded')
    .eq('id', payout.seller_id)
    .single();

  if (!seller?.stripe_account_id || !seller.stripe_onboarded) {
    await supabase.from('marketplace_seller_payouts')
      .update({ status: 'owed', error: 'Seller has not finished Stripe setup' })
      .eq('id', payout.id);
    return;
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: payout.payout_cents,
        currency: 'usd',
        destination: seller.stripe_account_id,
        ...(payout.transfer_group ? { transfer_group: payout.transfer_group } : {}),
        // Ties the transfer to the buyer's charge so it can't go out before
        // those funds exist in Siqa's balance.
        ...(payout.charge_id ? { source_transaction: payout.charge_id } : {}),
        description: 'Siqa Marketplace sale',
        metadata: {
          product: 'marketplace', // read by siqa-admin Finance sync
          kind: 'seller_payout',
          payout_id: payout.id,
          payment_intent_id: payout.payment_intent_id,
          seller_id: payout.seller_id,
        },
      },
      { idempotencyKey: `seller-payout-${payout.id}` },
    );
    await supabase.from('marketplace_seller_payouts')
      .update({ status: 'transferred', stripe_transfer_id: transfer.id, transferred_at: new Date().toISOString(), error: null })
      .eq('id', payout.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Seller transfer failed', payout.id, message);
    await supabase.from('marketplace_seller_payouts')
      .update({ status: 'failed', error: message })
      .eq('id', payout.id);
  }
}

type Checkout = {
  id: string;
  tax_calculation_id: string | null;
  tax_transaction_id: string | null;
  tax_status: string;
  shipping_by_seller: Record<string, number> | null;
};

async function loadCheckout(supabase: SupabaseClient, intent: Stripe.PaymentIntent): Promise<Checkout | null> {
  const q = supabase
    .from('marketplace_checkouts')
    .select('id, tax_calculation_id, tax_transaction_id, tax_status, shipping_by_seller');
  const { data } = intent.metadata.checkout_id
    ? await q.eq('id', intent.metadata.checkout_id).maybeSingle()
    : await q.eq('payment_intent_id', intent.id).maybeSingle();
  return (data as Checkout | null) ?? null;
}

/**
 * Record the sales tax with Stripe Tax (once) so it shows up in Stripe's tax
 * reports for filing. Returns the Stripe Tax fee to pass on to sellers.
 */
async function recordTax(supabase: SupabaseClient, checkout: Checkout | null): Promise<number> {
  if (!checkout?.tax_calculation_id) return 0;
  if (checkout.tax_transaction_id) return STRIPE_TAX_FEE_CENTS; // already recorded on an earlier attempt
  const tx = await stripe.tax.transactions.createFromCalculation(
    { calculation: checkout.tax_calculation_id, reference: `siqa_checkout_${checkout.id}` },
    { idempotencyKey: `tax-transaction-${checkout.id}` },
  );
  await supabase.from('marketplace_checkouts')
    .update({ tax_transaction_id: tx.id, tax_status: 'recorded' })
    .eq('id', checkout.id);
  return STRIPE_TAX_FEE_CENTS;
}

/** Create (once) the per-seller payout rows for a paid checkout, then pay them. */
async function settleCheckout(supabase: SupabaseClient, intent: Stripe.PaymentIntent, orderIds: string[]) {
  // Stripe's actual fee lives on the charge's balance transaction.
  const full = await stripe.paymentIntents.retrieve(intent.id, { expand: ['latest_charge.balance_transaction'] });
  const charge = full.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
  if (!charge || !bt || typeof bt === 'string') {
    // Not available yet — throwing makes Stripe retry this event shortly.
    throw new Error(`Balance transaction not ready for ${intent.id}`);
  }

  const checkout = await loadCheckout(supabase, intent);
  const taxFeeCents = await recordTax(supabase, checkout);

  const { data: lines } = await supabase
    .from('marketplace_orders')
    .select('id, seller_id, total_cents, quantity, tax_cents')
    .in('id', orderIds);
  if (!lines || lines.length === 0) return;

  const splits = splitCheckout(lines as OrderLine[], {
    shippingBySeller: checkout?.shipping_by_seller ?? {},
    stripeFeeCents: bt.fee,
    taxFeeCents,
    feeRate: SIQA_FEE_RATE,
  });
  const transferGroup = intent.transfer_group || intent.metadata.transfer_group || null;

  for (const split of splits) {
    const taxCollected = (lines as { seller_id: string; tax_cents: number | null }[])
      .filter(l => l.seller_id === split.seller_id)
      .reduce((n, l) => n + (l.tax_cents ?? 0), 0);

    // Unique (payment_intent_id, seller_id): a retried webhook finds the
    // existing row instead of creating (and paying) a second one.
    await supabase.from('marketplace_seller_payouts').upsert(
      {
        payment_intent_id: intent.id,
        charge_id: charge.id,
        transfer_group: transferGroup,
        seller_id: split.seller_id,
        buyer_id: intent.metadata.buyer_id || null,
        order_ids: split.order_ids,
        item_count: split.item_count,
        gross_cents: split.gross_cents,
        shipping_cents: split.shipping_cents,
        siqa_fee_cents: split.siqa_fee_cents,
        processing_fee_cents: split.processing_fee_cents,
        tax_fee_cents: split.tax_fee_cents,
        tax_collected_cents: taxCollected,
        payout_cents: split.payout_cents,
        fee_rate: SIQA_FEE_RATE,
        status: 'pending',
      },
      { onConflict: 'payment_intent_id,seller_id', ignoreDuplicates: true },
    );

    const { data: payout } = await supabase
      .from('marketplace_seller_payouts')
      .select('id, payment_intent_id, charge_id, transfer_group, seller_id, payout_cents, status, stripe_transfer_id')
      .eq('payment_intent_id', intent.id)
      .eq('seller_id', split.seller_id)
      .single();
    if (!payout) continue;

    for (const line of split.lines) {
      await supabase.from('marketplace_orders')
        .update({
          shipping_cents: line.shipping_cents,
          siqa_fee_cents: line.siqa_fee_cents,
          processing_fee_cents: line.processing_fee_cents,
          tax_fee_cents: line.tax_fee_cents,
          seller_payout_cents: line.seller_payout_cents,
          payout_id: payout.id,
        })
        .eq('id', line.id);
    }

    await sendPayout(supabase, payout as Payout);
  }
}

/**
 * Refunds. A full refund pulls back whatever each seller still holds and
 * cancels unpaid payouts. Partial refunds made from siqa-admin ("Cancel &
 * refund" on one order) already adjust that seller's payout themselves and
 * are tagged handled_by=siqa-admin; any other partial refund (e.g. made in
 * the Stripe dashboard) is flagged on the payouts for a person to review.
 */
async function reverseCheckout(supabase: SupabaseClient, charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const { data: payouts } = await supabase
    .from('marketplace_seller_payouts')
    .select('id, status, stripe_transfer_id, payout_cents, reversed_cents')
    .eq('payment_intent_id', piId);
  if (!payouts || payouts.length === 0) return;

  const fullyRefunded = charge.amount_refunded >= charge.amount;

  if (!fullyRefunded) {
    const refunds = charge.refunds?.data ?? [];
    const allFromAdmin = refunds.length > 0 && refunds.every((r: Stripe.Refund) => r.metadata?.handled_by === 'siqa-admin');
    if (allFromAdmin) return;
    for (const p of payouts) {
      await supabase.from('marketplace_seller_payouts')
        .update({ error: `Partial refund of $${(charge.amount_refunded / 100).toFixed(2)} made outside siqa-admin — review which seller it applies to` })
        .eq('id', p.id);
    }
    return;
  }

  // Reverse the recorded sales tax for the whole checkout.
  const { data: checkout } = await supabase
    .from('marketplace_checkouts')
    .select('id, tax_transaction_id, tax_status')
    .eq('payment_intent_id', piId)
    .maybeSingle();
  if (checkout?.tax_transaction_id && checkout.tax_status !== 'reversed') {
    try {
      await stripe.tax.transactions.createReversal(
        { mode: 'full', original_transaction: checkout.tax_transaction_id, reference: `siqa_checkout_${checkout.id}-refund` },
        { idempotencyKey: `tax-reversal-full-${checkout.id}` },
      );
      await supabase.from('marketplace_checkouts').update({ tax_status: 'reversed' }).eq('id', checkout.id);
    } catch (err) {
      console.error('Tax reversal failed', checkout.id, err instanceof Error ? err.message : String(err));
    }
  }

  for (const p of payouts) {
    if (p.status === 'transferred' && p.stripe_transfer_id) {
      const remaining = p.payout_cents - (p.reversed_cents ?? 0);
      try {
        if (remaining > 0) {
          // No amount = reverse whatever is left on the transfer.
          await stripe.transfers.createReversal(p.stripe_transfer_id, {}, { idempotencyKey: `seller-payout-reversal-full-${p.id}` });
        }
        await supabase.from('marketplace_seller_payouts')
          .update({ status: 'reversed', reversed_cents: p.payout_cents, reversed_at: new Date().toISOString(), error: null })
          .eq('id', p.id);
      } catch (err) {
        await supabase.from('marketplace_seller_payouts')
          .update({ error: `Refund: transfer reversal failed — ${err instanceof Error ? err.message : String(err)}` })
          .eq('id', p.id);
      }
    } else if (p.status !== 'reversed') {
      await supabase.from('marketplace_seller_payouts')
        .update({ status: 'cancelled', error: 'Order refunded before payout' })
        .eq('id', p.id);
    }
  }
}

// ─── Webhook ────────────────────────────────────────────────────────────────

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
    const message = err instanceof Error ? err.message : String(err);
    console.error('Webhook signature failed:', message);
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
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

      // Marketplace orders: buyers have no client-side UPDATE policy on
      // marketplace_orders, so this webhook (service role) is the only place
      // that flips status to 'paid'. Only rows still 'pending' are handled,
      // so a retried event can't decrement stock twice.
      let orderIds: string[] = (meta.order_ids ?? '').split(',').filter(Boolean);
      if (orderIds.length === 0 && meta.product === 'marketplace') {
        // Big carts don't fit order ids in Stripe metadata; look them up.
        const q = supabase.from('marketplace_orders').select('id');
        const { data: rows } = meta.checkout_id
          ? await q.eq('checkout_id', meta.checkout_id)
          : await q.eq('stripe_payment_intent_id', intent.id);
        orderIds = (rows ?? []).map(r => r.id);
      }
      {
        if (orderIds.length > 0) {
          const { data: newlyPaid } = await supabase
            .from('marketplace_orders')
            .update({ status: 'paid' })
            .in('id', orderIds)
            .eq('status', 'pending')
            .select('id, product_id, quantity');

          for (const order of newlyPaid ?? []) {
            const { data: product } = await supabase
              .from('marketplace_products')
              .select('inventory_count, is_digital')
              .eq('id', order.product_id)
              .single();

            if (product && !product.is_digital) {
              await supabase
                .from('marketplace_products')
                .update({ inventory_count: Math.max(0, (product.inventory_count || 0) - order.quantity) })
                .eq('id', order.product_id);
            }
          }

          if (meta.buyer_id && newlyPaid && newlyPaid.length > 0) {
            await supabase
              .from('marketplace_cart_items')
              .delete()
              .eq('user_id', meta.buyer_id)
              .in('product_id', newlyPaid.map(o => o.product_id));
          }

          await settleCheckout(supabase, intent, orderIds);
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from('donations')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', intent.id);

      if (intent.metadata.order_ids) {
        const orderIds = intent.metadata.order_ids.split(',').filter(Boolean);
        if (orderIds.length > 0) {
          await supabase
            .from('marketplace_orders')
            .update({ status: 'cancelled' })
            .in('id', orderIds)
            .eq('status', 'pending');
        }
      }
    }

    if (event.type === 'charge.refunded') {
      await reverseCheckout(supabase, event.data.object as Stripe.Charge);
    }

    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      if (account.details_submitted) {
        await supabase
          .from('organizations')
          .update({ stripe_onboarded: true })
          .eq('stripe_account_id', account.id);

        const { data: sellers } = await supabase
          .from('marketplace_sellers')
          .update({
            stripe_onboarded: true,
            stripe_charges_enabled: Boolean(account.charges_enabled),
          })
          .eq('stripe_account_id', account.id)
          .select('id');

        // Seller just finished Stripe setup: pay out anything they're owed.
        for (const seller of sellers ?? []) {
          const { data: owed } = await supabase
            .from('marketplace_seller_payouts')
            .select('id, payment_intent_id, charge_id, transfer_group, seller_id, payout_cents, status, stripe_transfer_id')
            .eq('seller_id', seller.id)
            .in('status', ['owed', 'failed']);
          for (const payout of owed ?? []) await sendPayout(supabase, payout as Payout);
        }
      }
    }
  } catch (err) {
    // A 500 makes Stripe retry the event later; everything above is safe to repeat.
    const message = err instanceof Error ? err.message : String(err);
    console.error('Webhook handling failed:', event.type, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
