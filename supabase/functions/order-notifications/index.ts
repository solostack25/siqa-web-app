// Emails the seller and buyer when a marketplace order becomes paid.
// Called by the DB trigger notify_order_paid() with the x-siqa-internal
// header (secret in Vault). Previously anyone could POST a made-up order
// and have Siqa email any user with attacker-chosen content; now the caller
// must know the secret, only the order id is accepted, and every detail is
// re-read from the database.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SITE = 'https://shop.siqa.us';

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get('x-siqa-internal') ?? '';
    const { data: ok } = await supabase.rpc('check_internal_secret', { p_secret: secret });
    if (ok !== true) return new Response('Forbidden', { status: 403 });

    const payload = await req.json().catch(() => ({}));
    const orderId: string | undefined = payload.order_id ?? payload.record?.id;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return new Response('Bad request', { status: 400 });

    const { data: order } = await supabase
      .from('marketplace_orders')
      .select('id, status, quantity, total_cents, buyer_id, seller_id, product_id, marketplace_products(title), marketplace_sellers(user_id)')
      .eq('id', orderId)
      .single();
    if (!order || order.status !== 'paid') return new Response('Skipped', { status: 200 });

    const product: any = Array.isArray(order.marketplace_products) ? order.marketplace_products[0] : order.marketplace_products;
    const seller: any = Array.isArray(order.marketplace_sellers) ? order.marketplace_sellers[0] : order.marketplace_sellers;
    const title = esc(product?.title ?? 'Your listing');
    const total = `$${((order.total_cents ?? 0) / 100).toFixed(2)}`;
    const qty = Number(order.quantity) || 1;

    const [sellerAuth, buyerAuth] = await Promise.all([
      seller?.user_id ? supabase.auth.admin.getUserById(seller.user_id) : Promise.resolve({ data: null } as any),
      order.buyer_id ? supabase.auth.admin.getUserById(order.buyer_id) : Promise.resolve({ data: null } as any),
    ]);
    const sellerEmail = sellerAuth?.data?.user?.email;
    const buyerEmail = buyerAuth?.data?.user?.email;

    const send = (to: string, subject: string, html: string) =>
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ to, subject, html }),
      });

    const emails: Promise<Response>[] = [];
    if (sellerEmail) {
      emails.push(send(sellerEmail, `New order: ${product?.title ?? 'Your listing'}`, `
        <h2>You have a new order!</h2>
        <p><strong>${title}</strong></p>
        <p>Quantity: ${qty}</p><p>Total: ${total}</p><p>Order ID: ${esc(order.id)}</p>
        <p><a href="${SITE}/seller-dashboard">View your orders</a></p>`));
    }
    if (buyerEmail) {
      emails.push(send(buyerEmail, `Order confirmed: ${product?.title ?? 'Your order'}`, `
        <h2>Your order is confirmed!</h2>
        <p><strong>${title}</strong></p>
        <p>Quantity: ${qty}</p><p>Total: ${total}</p><p>Order ID: ${esc(order.id)}</p>
        <p><a href="${SITE}/orders">View your order</a></p>`));
    }
    const results = await Promise.allSettled(emails);
    const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
    if (failed) console.error(`order-notifications: ${failed} email(s) failed for order ${order.id}`);

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('order-notifications error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
