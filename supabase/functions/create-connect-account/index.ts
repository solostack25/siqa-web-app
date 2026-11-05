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

const DEFAULT_RETURN_URL = 'https://www.siqa.us/org-profile';

/** Only send people back to our own sites (or the app), never an arbitrary URL. */
function isAllowedReturnUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    if (u.protocol === 'siqa:') return true;
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'thesiqaapp.com' || h.endsWith('.thesiqaapp.com') || h === 'siqa.us' || h.endsWith('.siqa.us')
      || (h.endsWith('.vercel.app') && h.startsWith('siqa-web-'));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const respond = (body: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Who is calling: the org owner's own login token. Previously any
    // signed-in user could send another org's id and attach their own
    // Stripe account to it (redirecting that org's donations).
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return respond({ error: 'Sign in again to set up payouts.' }, 401);

    const { orgId, orgName, returnUrl } = await req.json();
    if (!orgId) return respond({ error: 'Missing orgId' }, 400);

    const { data: org } = await supabase
      .from('organizations')
      .select('profile_id, is_verified, stripe_account_id, stripe_onboarded')
      .eq('id', orgId)
      .single();
    if (!org) return respond({ error: 'Organization not found' }, 404);
    if (org.profile_id !== user.id) return respond({ error: 'You can only set up payouts for your own organization.' }, 403);
    if (!org.is_verified) return respond({ error: 'Your organization must be verified before connecting payouts.' }, 403);

    const email = user.email ?? undefined;
    const safeReturnUrl = isAllowedReturnUrl(returnUrl) ? returnUrl : DEFAULT_RETURN_URL;

    let accountId = org?.stripe_account_id;

    // Create account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        business_type: 'non_profit',
        metadata: {
          org_id: orgId,
          org_name: orgName ?? '',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      // Save to Supabase
      await supabase
        .from('organizations')
        .update({ stripe_account_id: accountId })
        .eq('id', orgId);
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeReturnUrl,
      return_url: safeReturnUrl,
      type: 'account_onboarding',
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Connect account error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});