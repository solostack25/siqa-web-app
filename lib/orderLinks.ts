import { Linking } from 'react-native';
import { supabase } from './supabase';

// "Order delivery" links on food listings. The owner (or a Siqa admin)
// pastes the listing's own page on each service; nothing is looked up
// automatically, so a button only shows when someone confirmed the link.

export type OrderPlatform = 'ubereats' | 'doordash' | 'grubhub' | 'direct';

export const ORDER_PLATFORMS: {
  key: OrderPlatform;
  column: 'ubereats_url' | 'doordash_url' | 'grubhub_url' | 'order_url';
  label: string;
  placeholder: string;
  pattern: RegExp;
}[] = [
  { key: 'ubereats', column: 'ubereats_url', label: 'Uber Eats', placeholder: 'https://www.ubereats.com/store/…', pattern: /^https:\/\/([a-z0-9-]+\.)?(ubereats\.com|uber\.com)\//i },
  { key: 'doordash', column: 'doordash_url', label: 'DoorDash', placeholder: 'https://www.doordash.com/store/…', pattern: /^https:\/\/([a-z0-9-]+\.)?(doordash\.com|drd\.sh)\//i },
  { key: 'grubhub', column: 'grubhub_url', label: 'Grubhub', placeholder: 'https://www.grubhub.com/restaurant/…', pattern: /^https:\/\/([a-z0-9-]+\.)?(grubhub\.com|seamless\.com)\//i },
  { key: 'direct', column: 'order_url', label: 'Order online', placeholder: 'Your own ordering page (Toast, Square, ChowNow…)', pattern: /^https?:\/\/\S+$/i },
];

/** Categories that get the "Order delivery" section. */
export const ORDER_CATEGORIES = new Set(['restaurants', 'food_catering', 'grocery']);

/** Trims and adds https:// when missing; '' stays ''. */
export function normalizeOrderUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Null when valid (or empty); otherwise a message for the form. */
export function orderUrlError(platform: OrderPlatform, raw: string): string | null {
  const url = normalizeOrderUrl(raw);
  if (!url) return null;
  const p = ORDER_PLATFORMS.find(x => x.key === platform)!;
  if (p.pattern.test(url)) return null;
  return platform === 'direct'
    ? 'Paste a full web address.'
    : `That doesn't look like a ${p.label} link. Copy it from your store page on ${p.label}.`;
}

// Affiliate tracking: once a program approves Siqa, set its template (with
// {url} where the store link goes) as an EXPO_PUBLIC_* variable in Vercel
// and on Expo. Unset means the plain link is used.
const AFFILIATE_TEMPLATES: Partial<Record<OrderPlatform, string | undefined>> = {
  ubereats: process.env.EXPO_PUBLIC_AFFILIATE_UBEREATS,
  doordash: process.env.EXPO_PUBLIC_AFFILIATE_DOORDASH,
  grubhub: process.env.EXPO_PUBLIC_AFFILIATE_GRUBHUB,
};

export function trackedOrderUrl(platform: OrderPlatform, url: string): string {
  const template = AFFILIATE_TEMPLATES[platform];
  if (!template || !template.includes('{url}')) return url;
  return template.replace('{url}', encodeURIComponent(url));
}

/** Logs the click (for the owner's stats) and opens the ordering page. */
export async function openOrderLink(listingId: string, platform: OrderPlatform, url: string) {
  supabase.rpc('log_order_click', { p_listing: listingId, p_platform: platform }).then(() => {}, () => {});
  await Linking.openURL(trackedOrderUrl(platform, url));
}

/** The order links a listing has, in display order. */
export function orderLinksOf(l: Partial<Record<'ubereats_url' | 'doordash_url' | 'grubhub_url' | 'order_url', string | null>>) {
  return ORDER_PLATFORMS
    .map(p => ({ ...p, url: (l[p.column] ?? '').trim() }))
    .filter(p => p.url);
}
