// Siqa Events payments: ticket checkout and gifts during the appeal.
//
//   POST { action: 'create', slug, kind: 'tickets', items: [{ticket_type_id, qty}], guests: [{name,email,diet}],
//          buyer: {name,email,phone}, gift_cents, show_name }
//   POST { action: 'create', slug, kind: 'gift', amount_cents, donor: {name,email}, anonymous, show_name, table_label }
//     → { clientSecret, paymentIntentId, testMode } or { free: true, orderToken }
//   POST { action: 'confirm', payment_intent_id } → { ok, orderToken? }
//
// Prices always come from the database, never from the request. Money goes to the organization's connected
// Stripe account (destination charge, Siqa keeps 1% + card processing). If the org hasn't connected Stripe and
// this deployment uses a TEST key, the charge goes to Siqa's test account and is marked test_mode, so events can
// be tried end to end without real money. With a live key, an org without Stripe can't sell.
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const TEST_KEY = SECRET.startsWith('sk_test_');
const stripe = new Stripe(SECRET, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_CENTS = 10_000_000; // $100,000 per payment
const clean = (v: unknown, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function fees(charge: number) {
  const platform = Math.max(Math.round(charge * 0.01), 50);
  const card = Math.round(charge * 0.029) + 30;
  return Math.min(charge, platform + card);
}

async function loadEvent(slug: string) {
  const { data: ev } = await db
    .from('events')
    .select('id,title,status,org_id,checkout_gift,organizations(org_name,stripe_account_id,stripe_onboarded)')
    .eq('slug', slug)
    .maybeSingle();
  return ev as any;
}

async function intent(ev: any, amount: number, description: string, metadata: Record<string, string>, email?: string) {
  const org = Array.isArray(ev.organizations) ? ev.organizations[0] : ev.organizations;
  const params: Stripe.PaymentIntentCreateParams = {
    amount,
    currency: 'usd',
    description,
    automatic_payment_methods: { enabled: true },
    metadata: { ...metadata, event_id: ev.id, org_id: ev.org_id, product: 'event' },
  };
  if (email && /.+@.+\..+/.test(email)) params.receipt_email = email;
  let testMode = false;
  if (org?.stripe_account_id && org?.stripe_onboarded) {
    params.application_fee_amount = fees(amount);
    params.transfer_data = { destination: org.stripe_account_id };
    testMode = TEST_KEY;
  } else if (TEST_KEY) {
    testMode = true; // org not connected yet: practice payment on Siqa's test account
  } else {
    throw new Error(`${org?.org_name ?? 'This organization'} hasn't set up payments yet.`);
  }
  params.metadata!.test_mode = testMode ? 'true' : 'false';
  const pi = await stripe.paymentIntents.create(params);
  return { pi, testMode };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    let profileId: string | null = null;
    if (token) {
      const { data } = await db.auth.getUser(token);
      profileId = data?.user?.id ?? null;
    }

    if (body.action === 'confirm') {
      const id = clean(body.payment_intent_id, 80);
      if (!id.startsWith('pi_')) return json({ error: 'Missing payment' }, 400);
      const pi = await stripe.paymentIntents.retrieve(id);
      if (pi.metadata?.product !== 'event') return json({ error: 'Not an event payment' }, 400);
      if (pi.status !== 'succeeded' && pi.status !== 'processing') return json({ ok: false, status: pi.status });
      if (pi.metadata.event_order_id) {
        const { data, error } = await db.rpc('event_fulfill_order', { p_order: pi.metadata.event_order_id, p_payment_intent: pi.id });
        if (error) throw error;
        return json({ ok: true, orderToken: (data as any)?.token });
      }
      if (pi.metadata.event_gift_id) {
        const { error } = await db.rpc('event_fulfill_gift', { p_gift: pi.metadata.event_gift_id });
        if (error) throw error;
        return json({ ok: true });
      }
      return json({ error: 'Unknown payment' }, 400);
    }

    if (body.action !== 'create') return json({ error: 'Unknown action' }, 400);
    const ev = await loadEvent(clean(body.slug, 40));
    if (!ev || !['published', 'live'].includes(ev.status)) return json({ error: "This event isn't open right now." }, 404);

    if (body.kind === 'gift') {
      const amount = Math.round(Number(body.amount_cents));
      if (!Number.isFinite(amount) || amount < 100) return json({ error: 'The smallest gift is $1.' }, 400);
      if (amount > MAX_CENTS) return json({ error: 'For gifts over $100,000 please talk to the organizers.' }, 400);
      const donor = body.donor ?? {};
      const { data: gift, error } = await db
        .from('event_gifts')
        .insert({
          event_id: ev.id,
          amount_cents: amount,
          method: 'card',
          donor_name: clean(donor.name) || null,
          donor_email: clean(donor.email, 200) || null,
          anonymous: body.anonymous === true,
          show_name: body.show_name === true && body.anonymous !== true,
          table_label: clean(body.table_label, 20) || null,
          status: 'pending',
          logged_by: 'Online',
        })
        .select('id')
        .single();
      if (error) throw error;
      const { pi, testMode } = await intent(ev, amount, `Gift — ${ev.title}`, { event_gift_id: gift.id }, clean(donor.email, 200));
      await db.from('event_gifts').update({ stripe_payment_intent_id: pi.id, test_mode: testMode }).eq('id', gift.id);
      return json({ clientSecret: pi.client_secret, paymentIntentId: pi.id, testMode });
    }

    // Tickets
    const want: { ticket_type_id: string; qty: number }[] = (Array.isArray(body.items) ? body.items : [])
      .map((i: any) => ({ ticket_type_id: String(i.ticket_type_id ?? ''), qty: Math.floor(Number(i.qty)) }))
      .filter((i: any) => i.ticket_type_id && i.qty > 0 && i.qty <= 50);
    if (!want.length) return json({ error: 'Pick at least one ticket.' }, 400);
    const buyer = body.buyer ?? {};
    const buyerName = clean(buyer.name);
    const buyerEmail = clean(buyer.email, 200);
    if (!buyerName) return json({ error: 'Enter your name.' }, 400);
    if (!/.+@.+\..+/.test(buyerEmail)) return json({ error: 'Enter your email so we can send your tickets.' }, 400);

    const { data: pub } = await db.rpc('event_public', { p_slug: clean(body.slug, 40) });
    const tickets: any[] = (pub as any)?.tickets ?? [];
    let total = 0;
    const items = [];
    for (const w of want) {
      const t = tickets.find((x) => x.id === w.ticket_type_id);
      if (!t) return json({ error: 'One of those tickets is no longer available.' }, 400);
      if (t.remaining !== null && t.remaining < w.qty) {
        return json({ error: t.remaining === 0 ? `${t.name} is sold out.` : `Only ${t.remaining} ${t.name} left.` }, 400);
      }
      total += t.price_cents * w.qty;
      items.push({ ticket_type_id: t.id, qty: w.qty, price_cents: t.price_cents });
    }
    const gift = ev.checkout_gift ? Math.max(0, Math.round(Number(body.gift_cents) || 0)) : 0;
    if (gift > 0 && gift < 100) return json({ error: 'The smallest gift is $1.' }, 400);
    const charge = total + gift;
    if (charge > MAX_CENTS) return json({ error: 'That order is too large to pay online. Please contact the organizers.' }, 400);

    const guests = (Array.isArray(body.guests) ? body.guests : []).slice(0, 200).map((g: any) => ({
      name: clean(g?.name), email: clean(g?.email, 200), diet: clean(g?.diet, 80),
    }));
    const { data: order, error } = await db
      .from('event_orders')
      .insert({
        event_id: ev.id,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_phone: clean(buyer.phone, 40) || null,
        buyer_profile_id: profileId,
        items,
        guests,
        total_cents: charge,
        gift_cents: gift,
        gift_show_name: body.show_name === true,
      })
      .select('id,token')
      .single();
    if (error) throw error;

    if (charge === 0) {
      const { error: fe } = await db.rpc('event_fulfill_order', { p_order: order.id, p_payment_intent: null });
      if (fe) throw fe;
      return json({ free: true, orderToken: order.token });
    }
    const { pi, testMode } = await intent(ev, charge, `Tickets — ${ev.title}`, { event_order_id: order.id }, buyerEmail);
    await db.from('event_orders').update({ stripe_payment_intent_id: pi.id, test_mode: testMode }).eq('id', order.id);
    return json({ clientSecret: pi.client_secret, paymentIntentId: pi.id, testMode, orderToken: order.token });
  } catch (err) {
    console.error('event-pay', err);
    return json({ error: err instanceof Error ? err.message : 'Payment error' }, 500);
  }
});
