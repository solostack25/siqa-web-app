import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Delete the signed-in person's Siqa account (Settings → Delete account).
// Apple requires in-app account deletion for any app with sign-up.
//
// What happens:
//   • Their login and profile are deleted, and with the profile go their
//     likes, saves, follows, comments, notifications, cart and favorites.
//     A speaker profile linked to them is deleted along with its videos.
//   • If they own a shop: it's closed (hidden, products archived) but kept
//     with its order history for buyers' records and taxes. Not allowed
//     while it still has paid orders waiting to ship.
//   • Their own past orders and donations stay (sellers need them for
//     payouts and taxes) but no longer point to a person.
//   • An organization they registered stays, without an owner login.
// Relies on supabase/migrations/20261017_account_deletion.sql (siqa-admin).

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'Sign in again to delete your account.' }, 401);

    const { confirm } = await req.json().catch(() => ({}));
    if (String(confirm ?? '').trim().toUpperCase() !== 'DELETE') {
      return json({ error: 'Type DELETE to confirm.' }, 400);
    }

    const now = new Date().toISOString();

    // Shop: refuse while buyers are still waiting on paid orders.
    const { data: shop } = await admin
      .from('marketplace_sellers')
      .select('id, shop_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (shop) {
      const { count: toShip } = await admin
        .from('marketplace_orders')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', shop.id)
        .eq('status', 'paid');
      if ((toShip ?? 0) > 0) {
        return json({
          error: `${shop.shop_name} has ${toShip} paid order${toShip === 1 ? '' : 's'} still to ship. Ship or cancel ${toShip === 1 ? 'it' : 'them'} in your Seller Dashboard, then delete your account.`,
          code: 'open_orders',
        }, 409);
      }

      const { error: productsErr } = await admin
        .from('marketplace_products')
        .update({ status: 'archived' })
        .eq('seller_id', shop.id)
        .neq('status', 'archived');
      if (productsErr) throw productsErr;

      const { error: shopErr } = await admin
        .from('marketplace_sellers')
        .update({ approval_status: 'closed', closed_at: now })
        .eq('id', shop.id);
      if (shopErr) throw shopErr;
    }

    // Their own checkouts that were never paid can just be cancelled.
    await admin
      .from('marketplace_orders')
      .update({ status: 'cancelled', cancel_reason: 'Buyer deleted their account', cancelled_by: 'buyer', cancelled_at: now })
      .eq('buyer_id', user.id)
      .eq('status', 'pending');

    // Delete the login. Database links take care of the rest (see above).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as any)?.message ?? 'Could not delete the account';
    console.error('delete-account error:', err);
    return json({ error: `Couldn't delete your account: ${message}. Please contact Siqa support.` }, 500);
  }
});
