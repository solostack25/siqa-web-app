// Rich link previews for shared Siqa links.
//
// The web app is a single-page app, so every URL returns the same
// index.html with no page-specific <meta> tags. That means a link pasted
// into WhatsApp, iMessage, Instagram DMs, X, Facebook, Slack, etc. shows a
// bare URL with no title or image.
//
// vercel.json rewrites the shareable URLs here:
//   /watch/:id            -> ?type=video&id=:id
//   /gems?videoId=:id     -> ?type=short&videoId=:id
//   /product/:id          -> ?type=product&id=:id
//   /seed/:id             -> ?type=seed&id=:id
//   /speaker/:id          -> ?type=speaker&id=:id
// This function loads the built index.html, swaps in the right title,
// description and image, and returns it. The browser URL is unchanged, so
// people still land in the app exactly as before; link-preview bots just
// see real tags now.

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
// Public (publishable) key — the same one the app ships in lib/supabase.ts.
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

const DEFAULT_DESCRIPTION =
  'Siqa — trusted Islamic talks from real scholars, a Muslim marketplace, and causes worth supporting.';
const MARKETPLACE_DESCRIPTION = 'Shop from Muslim-owned businesses on Siqa Marketplace.';

let cachedShell = null;

module.exports = async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.siqa.us';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  const h = String(host).toLowerCase();
  const isMarketplace = h.startsWith('shop.') || h.startsWith('marketplace.');

  const q = req.query || {};
  const type = String(q.type || '');
  const id = String(q.id || q.videoId || '');

  let shell;
  try {
    shell = await loadShell(origin);
  } catch (e) {
    // If we can't even load index.html, send people to the app root rather than an error page.
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }

  let meta = null;
  if (id && isSafeId(id)) {
    try {
      meta = await lookup(type, id, origin, isMarketplace);
    } catch {
      meta = null; // fall back to site defaults below
    }
  }

  const siteName = isMarketplace ? 'Siqa Marketplace' : 'Siqa';
  const pageUrl = origin + (id && isSafeId(id) ? pathFor(type, id) : '/');
  const tags = {
    title: meta?.title ? `${meta.title} | ${siteName}` : siteName,
    ogTitle: meta?.title || siteName,
    description: clip(meta?.description || (isMarketplace ? MARKETPLACE_DESCRIPTION : DEFAULT_DESCRIPTION), 200),
    image: meta?.image || `${origin}/og-default.png`,
    url: pageUrl,
    ogType: meta?.ogType || 'website',
    siteName,
    extra: meta?.extra || '',
  };

  const html = injectMeta(shell, tags);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short CDN cache so edits to a title/thumbnail show up in previews quickly.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(html);
};

async function loadShell(origin) {
  if (cachedShell) return cachedShell;
  // Preferred: the built file bundled with this function (vercel.json
  // "includeFiles"). Works even on password-protected preview deployments.
  try {
    const fs = require('fs');
    const path = require('path');
    cachedShell = fs.readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf8');
    return cachedShell;
  } catch {
    // fall back to fetching it from the deployment
  }
  const r = await fetch(`${origin}/index.html`, { headers: { 'x-siqa-og': '1' } });
  if (!r.ok) throw new Error(`index.html ${r.status}`);
  cachedShell = await r.text();
  return cachedShell;
}

function isSafeId(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function pathFor(type, id) {
  switch (type) {
    case 'video': return `/watch/${id}`;
    case 'short': return `/gems?videoId=${id}`;
    case 'product': return `/product/${id}`;
    case 'seed': return `/seed/${id}`;
    case 'speaker': return `/speaker/${id}`;
    default: return '/';
  }
}

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

// YouTube descriptions are full of hashtags, divider lines, links and
// "Please LIKE, COMMENT & SHARE". Keep the first real sentence or two.
function cleanVideoDescription(raw) {
  if (!raw) return null;
  const lines = String(raw)
    .split(/\r?\n/)
    .map((l) => l.replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[\u25ba\u25b6\u2192]/g, '').replace(/^[^\p{L}\p{N}"'\u201c]+/u, '').trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[-_=*~.\s]{3,}$/.test(l))
    .filter((l) => !/(please|don'?t forget|make sure|be sure)\b.*\b(like|subscribe|share|comment)/i.test(l) && !/\bsubscribe\b/i.test(l))
    .filter((l) => !/^(credits?|note|produced by|follow us|support us|donate|instagram|twitter|facebook|tiktok|website)\b/i.test(l))
    .filter((l) => /[a-z]{3,}/i.test(l));
  if (!lines.length) return null;
  let out = lines.join(' ').replace(/\s+/g, ' ').trim();
  // Stop at a clean sentence boundary near 160 characters.
  if (out.length > 160) {
    const cut = out.slice(0, 160);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    out = end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  return out.length >= 20 ? out : null;
}

async function lookup(type, id, origin, isMarketplace) {
  const eq = `id=eq.${encodeURIComponent(id)}`;

  if ((type === 'video' || type === 'short') && !isMarketplace) {
    const v = await sb(`videos?${eq}&is_published=eq.true&select=title,description,thumbnail_url,platform,platform_video_id,speakers(display_name)&limit=1`);
    if (!v) return null;
    const speaker = v.speakers?.display_name;
    const image =
      v.thumbnail_url ||
      (v.platform === 'youtube' && v.platform_video_id
        ? `https://i.ytimg.com/vi/${v.platform_video_id}/hqdefault.jpg`
        : null);
    return {
      title: v.title || (speaker ? `A Gem from ${speaker}` : 'A Gem on Siqa'),
      description: cleanVideoDescription(v.description) || (speaker ? `Watch ${speaker} on Siqa.` : 'Watch on Siqa.'),
      image: absolute(image, origin),
      ogType: 'video.other',
    };
  }

  if (type === 'product') {
    const p = await sb(`marketplace_products?${eq}&select=title,description,price_cents,currency,images&limit=1`);
    if (!p) return null;
    const price = formatPrice(p.price_cents, p.currency);
    return {
      title: price ? `${p.title} — ${price}` : p.title,
      description: p.description || MARKETPLACE_DESCRIPTION,
      image: absolute(Array.isArray(p.images) ? p.images[0] : null, origin),
      ogType: 'product',
      extra: price
        ? `<meta property="product:price:amount" content="${(p.price_cents / 100).toFixed(2)}" />` +
          `<meta property="product:price:currency" content="${esc((p.currency || 'usd').toUpperCase())}" />`
        : '',
    };
  }

  if (type === 'seed' && !isMarketplace) {
    const s = await sb(`fundraisers?${eq}&select=title,subtitle,description,cover_image_url,image_url,organizations(org_name)&limit=1`);
    if (!s) return null;
    const org = s.organizations?.org_name;
    return {
      title: s.title ? `Support: ${s.title}` : 'Support this Seed',
      description: s.subtitle || s.description || (org ? `A cause from ${org} on Siqa.` : null),
      image: absolute(s.cover_image_url || s.image_url, origin),
    };
  }

  if (type === 'speaker' && !isMarketplace) {
    const sp = await sb(`speakers?${eq}&select=display_name,bio,avatar_url&limit=1`).catch(() => null);
    if (!sp) return null;
    return {
      title: `${sp.display_name} on Siqa`,
      description: sp.bio || `Watch talks from ${sp.display_name} on Siqa.`,
      image: absolute(sp.avatar_url, origin),
      ogType: 'profile',
    };
  }

  return null;
}

function absolute(url, origin) {
  if (!url || typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return origin + url;
  return null;
}

function formatPrice(cents, currency) {
  if (typeof cents !== 'number') return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function clip(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function injectMeta(shell, t) {
  // Drop the shell's generic title/description/OG tags so ours win.
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta[^>]+(name|property)="(description|og:[^"]*|twitter:[^"]*)"[^>]*>/gi, '');

  const block =
    `<title>${esc(t.title)}</title>` +
    `<meta name="description" content="${esc(t.description)}" />` +
    `<link rel="canonical" href="${esc(t.url)}" />` +
    `<meta property="og:site_name" content="${esc(t.siteName)}" />` +
    `<meta property="og:type" content="${esc(t.ogType)}" />` +
    `<meta property="og:title" content="${esc(t.ogTitle)}" />` +
    `<meta property="og:description" content="${esc(t.description)}" />` +
    `<meta property="og:url" content="${esc(t.url)}" />` +
    `<meta property="og:image" content="${esc(t.image)}" />` +
    `<meta name="twitter:card" content="summary_large_image" />` +
    `<meta name="twitter:title" content="${esc(t.ogTitle)}" />` +
    `<meta name="twitter:description" content="${esc(t.description)}" />` +
    `<meta name="twitter:image" content="${esc(t.image)}" />` +
    t.extra;

  return html.replace(/<\/head>/i, `${block}</head>`);
}
