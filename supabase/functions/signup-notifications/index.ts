// Emails registration@siqa.us when someone creates a Siqa account.
// Called by the DB trigger notify_new_signup() (on public.profiles insert)
// with the x-siqa-internal header (secret in Vault). Only the profile id is
// accepted; everything else is re-read from the database.
// Turn it off without a deploy:
//   update public.platform_settings set value = 'false' where key = 'notify_new_signups';
// (or flip notify_new_signups in the SoloStack Command Center).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { layout, summary, button } from './email.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const TO = (Deno.env.get('SIGNUP_ALERT_TO') ?? 'registration@siqa.us').split(',').map((s) => s.trim()).filter(Boolean);
const FROM = Deno.env.get('SIGNUP_ALERT_FROM') ?? 'Siqa <notifications@siqa.us>';
const ADMIN_URL = 'https://www.siqa.us/admin';

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }) + ' CT';
  } catch { return d; }
};
// Midnight today in Central Time, as an ISO timestamp.
function startOfTodayCT(): string {
  const now = new Date();
  const ctNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const offsetMs = now.getTime() - ctNow.getTime();
  const ctMidnight = new Date(ctNow);
  ctMidnight.setHours(0, 0, 0, 0);
  return new Date(ctMidnight.getTime() + offsetMs).toISOString();
}
const PROVIDERS: Record<string, string> = { email: 'Email and password', google: 'Google', apple: 'Apple' };

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get('x-siqa-internal') ?? '';
    const { data: ok } = await supabase.rpc('check_internal_secret', { p_secret: secret });
    if (ok !== true) return new Response('Forbidden', { status: 403 });

    const payload = await req.json().catch(() => ({}));
    if (payload.health === true) return Response.json({ resendKeySet: RESEND_KEY.length > 0, to: TO, from: FROM });
    const id: string | undefined = payload.profile_id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new Response('Bad request', { status: 400 });
    if (!RESEND_KEY) { console.error('signup-notifications: RESEND_API_KEY not set'); return new Response('No key', { status: 500 }); }

    const [{ data: profile }, { data: auth }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, created_at').eq('id', id).single(),
      supabase.auth.admin.getUserById(id),
    ]);
    if (!profile) return new Response('Not found', { status: 404 });
    const user = auth?.user;
    const name = String(profile.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'New member');
    const email = user?.email ?? '';
    const provider = PROVIDERS[String(user?.app_metadata?.provider ?? 'email')] ?? String(user?.app_metadata?.provider ?? '');
    const joined = profile.created_at ?? user?.created_at ?? new Date().toISOString();

    // Running totals so each email doubles as a growth check.
    const weekIso = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ count: total }, { count: today }, { count: week }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfTodayCT()),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekIso),
    ]);

    const fields: [string, string][] = ([
      ['Name', name], ['Email', email], ['Signed up with', provider], ['Joined', fmtDate(joined)],
      ['Sign-ups today', String(today ?? '–')], ['Last 7 days', String(week ?? '–')], ['Total members', String(total ?? '–')],
    ] as [string, string][]).filter(([, v]) => v);

    const html = layout({
      tag: 'Admin',
      preheader: `${name} just joined Siqa. ${today ?? ''} sign-ups today, ${total ?? ''} members total.`,
      eyebrow: 'New sign-up',
      heading: `${name} joined Siqa`,
      intro: 'A new account was just created.',
      content: `<div style="height:24px"></div>` + summary(fields) + button('Open Siqa admin', ADMIN_URL),
      footerNote: 'Turn these off with the notify_new_signups switch when sign-ups get busy.',
    });
    const text = [`New Siqa sign-up: ${name}`, '', ...fields.map(([k, v]) => `${k}: ${v}`), '', ADMIN_URL].join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: TO, subject: `New sign-up: ${name} (#${total ?? '?'})`, html, text }),
    });
    if (!res.ok) { console.error('signup-notifications: Resend error', res.status, await res.text()); return new Response('Send failed', { status: 502 }); }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('signup-notifications error:', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
});
