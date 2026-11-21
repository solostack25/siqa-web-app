// Web push sender for the PWA, called every minute by the Supabase pg_cron job `siqa-push-tick`
// (header x-siqa-internal = the vault secret `siqa_internal_secret`; the database checks it).
//
// Each tick:
//   1. Prayer times: works out each subscribed device's prayer times from the user's saved prayer settings
//      (same rules as the phone app: Athan / Silent / Off per salah, plus the reminder N minutes before),
//      and sends the ones that are due. push_claim makes sure each alert goes out once.
//   2. Live now: sends the queued "<speaker> is live now" pushes to followers' devices.
//
// Env (Vercel): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).

const webpush = require('web-push');
const { CalculationMethod, Coordinates, Madhab, PrayerTimes, HighLatitudeRule } = require('adhan');

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const LABEL = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
// Send anything that came due in the last 3 minutes (covers a late or skipped tick).
const WINDOW_MS = 3 * 60 * 1000;

async function rpc(name, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${name}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: p.weekday };
}

function timesFor(y, m, d, s) {
  const method = CalculationMethod[s.method] ? s.method : 'NorthAmerica';
  const params = CalculationMethod[method]();
  params.madhab = s.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  const coords = new Coordinates(s.location.lat, s.location.lon);
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  return new PrayerTimes(coords, new Date(y, m - 1, d, 12), params);
}

const fmtTime = (date, tz) => date.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

/** Prayer alerts due for one device right now. */
function duePrayerAlerts(sub, now) {
  const s = sub.settings;
  if (!sub.prayer || !s || !s.location || typeof s.location.lat !== 'number') return [];
  const tz = sub.timezone || 'America/Chicago';
  const alerts = s.alerts || {};
  const lead = Number(s.leadMinutes) || 0;
  const out = [];
  for (const offset of [-1, 0, 1]) {
    const { y, m, d, weekday } = localParts(new Date(now.getTime() + offset * 86400000), tz);
    const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let t;
    try { t = timesFor(y, m, d, s); } catch { continue; }
    for (const p of PRAYERS) {
      const mode = alerts[p] || 'athan';
      if (mode === 'off') continue;
      const at = t[p];
      const name = p === 'dhuhr' && weekday === 'Fri' ? "Jumu'ah" : LABEL[p];
      if (lead > 0) {
        const leadAt = new Date(at.getTime() - lead * 60000);
        if (leadAt <= now && now - leadAt < WINDOW_MS) {
          out.push({ key: `${day}:${p}:lead`, title: `${name} in ${lead} minutes`, body: `${name} begins at ${fmtTime(at, tz)}`, silent: true, tag: `prayer-${day}-${p}` });
        }
      }
      if (at <= now && now - at < WINDOW_MS) {
        out.push({
          key: `${day}:${p}:start`, title: `It's time for ${name}`,
          body: mode === 'athan' ? 'Allahu Akbar, Allahu Akbar' : `${name} · ${fmtTime(at, tz)}`,
          silent: mode === 'silent', tag: `prayer-${day}-${p}`,
        });
      }
    }
  }
  return out.map((a) => ({ ...a, url: '/prayer' }));
}

module.exports = async function handler(req, res) {
  const secret = req.headers['x-siqa-internal'];
  if (!secret) return res.status(403).json({ error: 'Not allowed' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID keys missing' });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@siqa.us', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const now = new Date();
  let subs;
  try { subs = (await rpc('push_tick_subscriptions', { p_secret: secret })) || []; }
  catch (e) { return res.status(403).json({ error: String(e.message || e) }); }

  // 1) Prayer times: claim, then send.
  const wanted = [];
  for (const sub of subs) for (const a of duePrayerAlerts(sub, now)) wanted.push({ sub, a });
  let claimed = new Set();
  if (wanted.length) {
    const rows = await rpc('push_claim', { p_secret: secret, p_items: wanted.map((w) => ({ s: w.sub.id, k: w.a.key })) });
    claimed = new Set((rows || []).map((r) => `${r.subscription_id}|${r.key}`));
  }
  const jobs = wanted.filter((w) => claimed.has(`${w.sub.id}|${w.a.key}`))
    .map((w) => ({ sub: w.sub, payload: { title: w.a.title, body: w.a.body, url: w.a.url, tag: w.a.tag, silent: w.a.silent } }));

  // 2) Live now (and anything else queued).
  const queued = (await rpc('push_take_outbox', { p_secret: secret })) || [];
  const byUser = new Map();
  for (const sub of subs) {
    if (!byUser.has(sub.user_id)) byUser.set(sub.user_id, []);
    byUser.get(sub.user_id).push(sub);
  }
  for (const q of queued) {
    for (const sub of byUser.get(q.user_id) || []) {
      if (q.kind === 'live' && !sub.live) continue;
      jobs.push({ sub, payload: { title: q.title, body: q.body || '', url: q.url || '/', tag: q.tag || undefined } });
    }
  }

  // Send, 50 at a time. Devices that are gone (404/410) are removed.
  const ok = new Set(); const gone = new Set(); let failed = 0;
  for (let i = 0; i < jobs.length; i += 50) {
    const batch = jobs.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map((j) => webpush.sendNotification(
      { endpoint: j.sub.endpoint, keys: { p256dh: j.sub.p256dh, auth: j.sub.auth } },
      JSON.stringify(j.payload),
      { TTL: 60 * 30, urgency: 'high' },
    )));
    results.forEach((r, k) => {
      const id = batch[k].sub.id;
      if (r.status === 'fulfilled') ok.add(id);
      else if (r.reason && (r.reason.statusCode === 404 || r.reason.statusCode === 410)) gone.add(id);
      else failed++;
    });
  }
  if (ok.size || gone.size || subs.length) {
    await rpc('push_report', { p_secret: secret, p_ok: [...ok], p_gone: [...gone] }).catch(() => null);
  }
  return res.status(200).json({ devices: subs.length, sent: jobs.length - failed - gone.size, failed, removed: gone.size });
};
