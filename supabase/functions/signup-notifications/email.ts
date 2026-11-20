// Shared Siqa email layout (same as claim-notifications). Table-based with
// inline styles so it renders the same in Gmail, Outlook and Apple Mail.
// Brand: navy #0F1E3D, gold #C9A227, Inter.

export const NAVY = '#0F1E3D';
export const GOLD = '#C9A227';
const INK = '#14181F';
const MUTED = '#5B6478';
const LINE = '#E7E2D6';
const BG = '#F4F1EA';
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

export function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A big rounded call-to-action button. */
export function button(label: string, href: string) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
    <tr><td align="center" bgcolor="${NAVY}" style="border-radius:10px">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a>
    </td></tr>
  </table>`;
}

/** Label/value rows. */
export function summary(rows: [string, string][], emphasizeLast = false) {
  const body = rows.map(([k, v], i) => {
    const last = emphasizeLast && i === rows.length - 1;
    const top = last ? `border-top:1px solid ${LINE};padding-top:12px;` : '';
    const weight = last ? `font-weight:700;color:${INK};font-size:16px;` : `color:${MUTED};font-size:14px;`;
    return `<tr>
      <td style="font-family:${FONT};${top}padding-bottom:6px;${weight}">${esc(k)}</td>
      <td align="right" style="font-family:${FONT};${top}padding-bottom:6px;${weight}${last ? '' : `color:${INK};`}">${esc(v)}</td>
    </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBFAF6;border:1px solid ${LINE};border-radius:12px;padding:16px 18px">${body}</table>`;
}

/** Full email document. `content` is trusted HTML built with the helpers above. */
export function layout(opts: {
  preheader: string;
  eyebrow: string;
  heading: string;
  intro?: string;
  content: string;
  footerNote?: string;
  tag?: string;
}) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td style="background:${NAVY};border-radius:16px 16px 0 0;padding:20px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;background:${GOLD};border-radius:9px;color:${NAVY};font-family:'Traditional Arabic','Amiri','Segoe UI',Arial,sans-serif;font-size:20px;font-weight:700;line-height:36px">&#1589;</td>
            <td style="padding-left:10px;font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.01em">Siqa</td>
          </tr></table>
        </td>
        ${opts.tag ? `<td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${GOLD}">${esc(opts.tag)}</td>` : ''}
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;padding:32px 28px 28px;border-left:1px solid ${LINE};border-right:1px solid ${LINE}">
      <div style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};margin-bottom:8px">${esc(opts.eyebrow)}</div>
      <h1 style="margin:0 0 10px;font-family:${FONT};font-size:24px;line-height:30px;font-weight:700;color:${INK}">${esc(opts.heading)}</h1>
      ${opts.intro ? `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:23px;color:${MUTED}">${esc(opts.intro)}</p>` : ''}
      ${opts.content}
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-top:none;border-radius:0 0 16px 16px;padding:0 28px">
      <div style="height:3px;background:${GOLD};border-radius:2px;width:48px"></div>
    </td></tr>
    <tr><td align="center" style="padding:20px 12px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED}">
      ${opts.footerNote ? `${esc(opts.footerNote)}<br>` : ''}
      <a href="https://www.siqa.us" style="color:${MUTED};text-decoration:underline">siqa.us</a> &middot; Authentic Islamic content from verified voices
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
