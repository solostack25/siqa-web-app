// Share images for Chai quiz results.
//
//   /api/chai-card?id=<post>&r=<result>[&s=<score>&t=<total>][&f=story|og]
//
// f=story (default): 1080x1920 PNG for Instagram/WhatsApp Stories.
// f=og: 1200x630 PNG used as the link preview for a shared result.
// Without r it draws the quiz itself ("What do you get?").
//
// Only live/ended posts are readable with the public key, and the result
// must be one the quiz actually has, so the image can't be made to say
// anything the quiz doesn't.

const fs = require('fs');
const path = require('path');
const satori = require('satori').default || require('satori');
const { Resvg } = require('@resvg/resvg-js');

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

// Same palette as lib/chai.ts.
const C = { ink: '#22163a', ink2: '#4a3d63', cream: '#fff7ec', white: '#ffffff', saffron: '#ffcf3d', masala: '#ec6a37', rose: '#ff7aa8', cardamom: '#2fae6e', plum: '#9d8bff' };

let fonts = null;
function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  fonts = [
    { name: 'Fredoka', data: fs.readFileSync(path.join(dir, 'fredoka-600.ttf')), weight: 600, style: 'normal' },
    { name: 'Fredoka', data: fs.readFileSync(path.join(dir, 'fredoka-700.ttf')), weight: 700, style: 'normal' },
    { name: 'Space Mono', data: fs.readFileSync(path.join(dir, 'space-mono-700.ttf')), weight: 700, style: 'normal' },
  ];
  return fonts;
}

let icon = null;
function iconDataUri() {
  if (!icon) icon = 'data:image/png;base64,' + fs.readFileSync(path.join(process.cwd(), 'public', 'icon-192.png')).toString('base64');
  return icon;
}

// Tiny element helper so this file needs no JSX build step.
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', boxSizing: 'border-box', ...style }, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) } });

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const id = String(q.id || '');
  const format = q.f === 'og' ? 'og' : 'story';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(res, 400);

  let post;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/chai_posts?id=eq.${id}&select=id,kind,title,cover_color,content&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    post = r.ok ? (await r.json())[0] : null;
  } catch {
    post = null;
  }
  if (!post) return fail(res, 404);

  const result = resolveResult(post, q);
  const tile = C[post.cover_color] || C.saffron;

  try {
    const tree = format === 'og' ? ogCard(post, result, tile) : storyCard(post, result, tile);
    const size = format === 'og' ? { width: 1200, height: 630 } : { width: 1080, height: 1920 };
    const svg = await satori(tree, { ...size, fonts: loadFonts() });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size.width } }).render().asPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.statusCode = 200;
    return res.end(png);
  } catch (e) {
    return fail(res, 500);
  }
};

function fail(res, code) {
  res.statusCode = code;
  res.setHeader('Cache-Control', 'no-store');
  return res.end();
}

/** The result named in the URL, checked against the quiz. Null = quiz cover. */
function resolveResult(post, q) {
  const r = typeof q.r === 'string' ? q.r.slice(0, 120) : '';
  if (!r) return null;
  const c = post.content || {};
  if (post.kind === 'personality') {
    const found = (c.results || []).find((x) => x.id === r);
    return found ? { headline: `I'm ${String(found.name).replace(/^The /, 'the ')}`, name: found.name, description: found.description || '' } : null;
  }
  if (post.kind === 'trivia') {
    const tier = (c.tiers || []).find((t) => t.name === r);
    if (!tier) return null;
    const total = (c.questions || []).length;
    const s = Number.parseInt(q.s, 10);
    const score = Number.isFinite(s) && s >= 0 && s <= total ? s : null;
    return { headline: score != null ? `${score}/${total} · ${tier.name}` : tier.name, name: tier.name, description: tier.description || '' };
  }
  return null;
}

function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function headlineSize(text, big, small) {
  const n = text.length;
  return n <= 18 ? big : n <= 32 ? Math.round(big * 0.8) : small;
}

const mono = (size, color, text, extra = {}) => h('div', { fontFamily: 'Space Mono', fontSize: size, color, letterSpacing: size * 0.08, ...extra }, text);

function brand(size, onDark) {
  return h('div', { alignItems: 'center', gap: size * 0.4 },
    { type: 'img', props: { src: iconDataUri(), width: size * 1.6, height: size * 1.6, style: { borderRadius: size * 0.4 } } },
    h('div', { fontFamily: 'Fredoka', fontWeight: 700, fontSize: size * 1.1, color: onDark ? C.white : C.ink }, 'Siqa Chai'),
  );
}

function storyCard(post, result, tile) {
  const headline = result ? result.headline : post.title;
  return h('div', { width: 1080, height: 1920, background: C.cream, flexDirection: 'column', justifyContent: 'space-between', padding: '120px 90px 110px', fontFamily: 'Fredoka' },
    brand(46),
    h('div', { flexDirection: 'column', gap: 40 },
      h('div', { alignSelf: 'flex-start', background: C.ink, color: C.saffron, borderRadius: 999, padding: '14px 30px', fontFamily: 'Space Mono', fontSize: 30, letterSpacing: 3 }, result ? 'MY RESULT' : post.kind === 'trivia' ? 'TRIVIA' : 'QUIZ'),
      // The chunky card: ink border + hard offset shadow, like the app.
      h('div', { flexDirection: 'column', gap: 28, width: 900, background: tile, border: `7px solid ${C.ink}`, borderRadius: 56, padding: '64px 60px', boxShadow: `18px 18px 0px 0px ${C.ink}` },
        mono(28, C.ink, clip(post.title, 70).toUpperCase(), { lineHeight: 1.4 }),
        h('div', { fontWeight: 700, fontSize: headlineSize(headline, 112, 76), lineHeight: 1.02, color: C.ink }, clip(headline, 60)),
        result && result.description ? h('div', { fontWeight: 600, fontSize: 40, lineHeight: 1.3, color: C.ink }, clip(result.description, 150)) : null,
      ),
    ),
    h('div', { flexDirection: 'column', gap: 18 },
      h('div', { fontWeight: 700, fontSize: 64, color: C.ink }, result ? 'What do you get?' : 'Take the quiz'),
      mono(34, C.ink2, 'siqa.us/chai'),
    ),
  );
}

function ogCard(post, result, tile) {
  const headline = result ? result.headline : post.title;
  return h('div', { width: 1200, height: 630, background: tile, padding: 56, fontFamily: 'Fredoka' },
    h('div', { width: 1088, height: 518, flexDirection: 'column', justifyContent: 'space-between', background: C.cream, border: `6px solid ${C.ink}`, borderRadius: 40, padding: '44px 52px' },
      h('div', { justifyContent: 'space-between', alignItems: 'center' }, brand(34), mono(22, C.ink2, result ? 'MY RESULT' : post.kind === 'trivia' ? 'TRIVIA' : 'QUIZ')),
      h('div', { flexDirection: 'column', gap: 14 },
        mono(22, C.ink2, clip(post.title, 60).toUpperCase()),
        h('div', { fontWeight: 700, fontSize: headlineSize(headline, 88, 58), lineHeight: 1.04, color: C.ink }, clip(headline, 60)),
      ),
      h('div', { fontWeight: 700, fontSize: 36, color: C.ink }, result ? 'What do you get? Play on Siqa →' : 'Play on Siqa →'),
    ),
  );
}
