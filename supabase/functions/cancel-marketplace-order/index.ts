import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Seller "Cancel & refund" for one marketplace order line.
//
// Only the shop that sold the item can call this (checked from the caller's
// Supabase login). For a paid order it:
//   1. refunds the buyer that line's price + its share of shipping + its tax
//   2. takes that line's payout back from the seller (reverses that much of
//      the transfer, or reduces what they're owed if not paid out yet)
//   3. records a partial reversal in Stripe Tax so tax reports net it out
//   4. marks the order cancelled with the reason
// An order that was never paid is just marked cancelled.
// Siqa admin has the same flow in siqa-admin (lib/payouts.ts).

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const CANCELLABLE_PAID = ['paid']; // once shipped, it's a return, not a cancellation

async function clawBackPayout(order: any): Promise<string> {
  if (!order.payout_id || order.seller_payout_cents == null) return 'No seller payout recorded yet.';
  const { data: payout } = await admin.from('marketplace_seller_payouts').select('*').eq('id', order.payout_id).single();
  if (!payout) return 'Payout row not found.';
  const lineCents = order.seller_payout_cents as number;
  if (lineCents <= 0) return 'Nothing was owed to the seller for this item.';

  if (payout.status === 'transferred' && payout.stripe_transfer_id) {
    const amount = Math.min(lineCents, payout.payout_cents - (payout.reversed_cents ?? 0));
    if (amount > 0) {
      await stripe.transfers.createReversal(
        payout.stripe_transfer_id,
        { amount, metadata: { order_id: order.id, reason: 'order_cancelled' } },
        { idempotencyKey: `seller-line-reversal-${order.id}` },
      );
    }
    const reversed = (payout.reversed_cents ?? 0) + amount;
    await admin.from('marketplace_seller_payouts').update({
      reversed_cents: reversed,
      ...(reversed >= payout.payout_cents ? { status: 'reversed', reversed_at: new Date().toISOString() } : {}),
    }).eq('id', payout.id);
    return `Took back $${(amount / 100).toFixed(2)} from the seller's payout.`;
  }

  if (['owed', 'failed', 'pending'].includes(payout.status)) {
    const left = Math.max(0, payout.payout_cents - lineCents);
    await admin.from('marketplace_seller_payouts').update({
      gross_cents: Math.max(0, payout.gross_cents - order.total_cents - (order.shipping_cents ?? 0)),
      shipping_cents: Math.max(0, (payout.shipping_cents ?? 0) - (order.shipping_cents ?? 0)),
      siqa_fee_cents: Math.max(0, payout.siqa_fee_cents - (order.siqa_fee_cents ?? 0)),
      processing_fee_cents: Math.max(0, payout.processing_fee_cents - (order.processing_fee_cents ?? 0)),
      tax_fee_cents: Math.max(0, (payout.tax_fee_cents ?? 0) - (order.tax_fee_cents ?? 0)),
      tax_collected_cents: Math.max(0, (payout.tax_collected_cents ?? 0) - (order.tax_cents ?? 0)),
      payout_cents: left,
      item_count: Math.max(0, payout.item_count - (order.quantity ?? 1)),
      ...(left === 0 ? { status: 'cancelled', error: 'All items cancelled before payout' } : {}),
    }).eq('id', payout.id);
    return `Reduced what the seller is owed by $${(lineCents / 100).toFixed(2)}.`;
  }
  return `Payout is ${payout.status}; nothing to take back.`;
}

async function reverseLineTax(order: any): Promise<string> {
  if (!order.checkout_id || !order.tax_cents) return 'No sales tax on this item.';
  const { data: checkout } = await admin
    .from('marketplace_checkouts')
    .select('id, tax_transaction_id, tax_status')
    .eq('id', order.checkout_id)
    .single();
  if (!checkout?.tax_transaction_id) return "Sales tax wasn't recorded for this checkout.";
  if (checkout.tax_status === 'reversed') return 'Sales tax already reversed.';

  const items = await stripe.tax.transactions.listLineItems(checkout.tax_transaction_id, { limit: 100 });
  const line = items.data.find((li: Stripe.Tax.TransactionLineItem) => li.type === 'transaction' && li.reference.endsWith(`_${order.product_id}`));
  if (!line) return 'Item not found in the Stripe Tax record — reverse it in Stripe.';
  const shippingTax = Math.max(0, (order.tax_cents ?? 0) - line.amount_tax);
  const shipping = order.shipping_cents ?? 0;
  await stripe.tax.transactions.createReversal(
    {
      mode: 'partial',
      original_transaction: checkout.tax_transaction_id,
      reference: `siqa_order_${order.id}-refund`,
      line_items: [{ original_line_item: line.id, reference: line.reference, amount: -line.amount, amount_tax: -line.amount_tax }],
      ...(shipping > 0 ? { shipping_cost: { amount: -shipping, amount_tax: -shippingTax } } : {}),
      metadata: { order_id: order.id },
    } as any,
    { idempotencyKey: `tax-reversal-order-${order.id}` },
  );
  await admin.from('marketplace_checkouts').update({ tax_status: 'partially_reversed' }).eq('id', checkout.id);
  return `Reversed $${((line.amount_tax + shippingTax) / 100).toFixed(2)} sales tax.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Who is calling: the seller's own Supabase login token.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'Sign in again to cancel orders.' }, 401);

    const { orderId, reason } = await req.json();
    const cleanReason = String(reason ?? '').trim().slice(0, 500);
    if (!orderId) return json({ error: 'Missing order' }, 400);
    if (!cleanReason) return json({ error: 'Add a short reason for the buyer.' }, 400);

    const { data: order } = await admin.from('marketplace_orders').select('*').eq('id', orderId).single();
    if (!order) return json({ error: 'Order not found' }, 404);

    const { data: seller } = await admin.from('marketplace_sellers').select('id, user_id').eq('id', order.seller_id).single();
    if (!seller || seller.user_id !== user.id) return json({ error: "You can only cancel your own shop's orders." }, 403);

    if (order.status === 'cancelled') return json({ ok: true, status: 'cancelled', note: 'Already cancelled.' });

    const now = new Date().toISOString();

    if (order.status === 'pending') {
      await admin.from('marketplace_orders').update({
        status: 'cancelled', cancel_reason: cleanReason, cancelled_by: 'seller', cancelled_at: now,
      }).eq('id', order.id);
      return json({ ok: true, status: 'cancelled', refundedCents: 0, note: 'Order was never paid; nothing to refund.' });
    }

    if (!CANCELLABLE_PAID.includes(order.status)) {
      return json({ error: `This order is ${order.status}. Once shipped, handle it as a return — contact Siqa support.` }, 400);
    }
    if (!order.stripe_payment_intent_id) return json({ error: 'No payment found for this order — contact Siqa support.' }, 400);

    // 1. Refund the buyer this line: price + shipping share + tax.
    const amount = order.total_cents + (order.shipping_cents ?? 0) + (order.tax_cents ?? 0);
    const refund = await stripe.refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount,
        reason: 'requested_by_customer',
        // Tells the webhook this partial refund's payout/tax side is handled here.
        metadata: { handled_by: 'siqa-seller', order_id: order.id },
      },
      { idempotencyKey: `order-refund-${order.id}` },
    );

    // Mark it cancelled right away so a retry can't refund twice.
    await admin.from('marketplace_orders').update({
      status: 'cancelled', cancel_reason: cleanReason, cancelled_by: 'seller', cancelled_at: now,
      refund_id: refund.id, refunded_cents: amount,
    }).eq('id', order.id);

    // 2 + 3. Seller payout and sales tax. Failures here don't undo the
    // buyer's refund; they're noted on the order for Siqa to finish.
    const notes: string[] = [];
    try { notes.push(await clawBackPayout(order)); } catch (e) { notes.push(`Payout take-back failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { notes.push(await reverseLineTax(order)); } catch (e) { notes.push(`Tax reversal failed: ${e instanceof Error ? e.message : String(e)}`); }
    const failed = notes.some(n => n.includes('failed'));
    if (failed) {
      await admin.from('marketplace_seller_payouts')
        .update({ error: `Seller cancelled order ${order.id}: ${notes.join(' ')}` })
        .eq('id', order.payout_id);
    }

    return json({ ok: true, status: 'cancelled', refundedCents: amount, note: notes.join(' ') });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not cancel the order';
    console.error('cancel-marketplace-order error:', err);
    return json({ error: message }, 500);
  }
});
