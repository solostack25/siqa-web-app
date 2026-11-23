// Visitors for the Siqa Admin overview, from Vercel Web Analytics (siqa.us, shop. and dashboard.).
// Siqa admins only: the caller's Supabase login is checked with is_siqa_admin().
//
// Env (Vercel): VERCEL_ANALYTICS_TOKEN — a Vercel access token that can read this team's projects.
// Without it the route answers { connected: false } and the overview shows how to connect it.

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';
const PROJECT_ID = 'prj_cVkcQPR3mq7uaDZO3hDMdDqIMzeQ';
const TEAM_ID = 'team_gIUizUvZXeASHNcAnmB0NjLN';

async function isAdmin(jwt) {
  if (!jwt) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_siqa_admin`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: '{}',
  });
  return r.ok && (await r.json().catch(() => false)) === true;
}

async function va(token, by, since, until, limit = 10) {
  const qs = new URLSearchParams({ projectId: PROJECT_ID, teamId: TEAM_ID, since, until, limit: String(limit) });
  for (const b of [].concat(by)) qs.append('by', b);
  const r = await fetch(`https://api.vercel.com/v1/query/web-analytics/visits/aggregate?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error?.message || `Vercel ${r.status}`);
  return body?.data ?? [];
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    if (!(await isAdmin(jwt))) { res.statusCode = 403; return res.json({ error: 'Siqa admins only' }); }
    const token = process.env.VERCEL_ANALYTICS_TOKEN;
    if (!token) return res.json({ connected: false });

    const now = new Date();
    const until = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const day = (n) => new Date(now.getTime() - n * 86400000).toISOString();
    const [daily, pages, refs, countries] = await Promise.all([
      va(token, 'day', day(29), until, 31),
      va(token, 'requestPath', day(7), until, 8),
      va(token, 'referrerHostname', day(7), until, 6),
      va(token, 'country', day(7), until, 6),
    ]);
    const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
    const last = (n) => daily.slice(-n);
    res.json({
      connected: true,
      today: { visitors: last(1)[0]?.visitors ?? 0, pageviews: last(1)[0]?.pageviews ?? 0 },
      week: { visitors: sum(last(7), 'visitors'), pageviews: sum(last(7), 'pageviews') },
      month: { visitors: sum(daily, 'visitors'), pageviews: sum(daily, 'pageviews') },
      daily: daily.map((r) => ({ day: String(r.timestamp).slice(0, 10), visitors: r.visitors || 0, pageviews: r.pageviews || 0 })),
      pages: pages.map((r) => ({ path: r.requestPath ?? r.key ?? '', visitors: r.visitors || 0, pageviews: r.pageviews || 0 })),
      referrers: refs.map((r) => ({ host: r.referrerHostname || 'Direct', visitors: r.visitors || 0 })),
      countries: countries.map((r) => ({ country: r.country || 'Unknown', visitors: r.visitors || 0 })),
    });
  } catch (e) {
    res.statusCode = 502;
    res.json({ error: e.message || 'Could not reach Vercel' });
  }
};
