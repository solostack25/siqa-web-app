import { Platform } from 'react-native';

// One codebase, two websites:
//   gems.thesiqaapp.com        -> the full Siqa app (Gems, Shop, Seeds, Orgs)
//   marketplace.thesiqaapp.com -> Shop only: same look and the same live
//                                 data, but no videos and no nonprofit
//                                 features (Seeds, Orgs, donations).
// The native app is always the full app.
//
// For testing on a Vercel preview URL, add ?site=marketplace once; it is
// remembered for that browser tab (?site=full switches back).

export type SiteMode = 'full' | 'marketplace';

function detect(): SiteMode {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return 'full';
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('marketplace.')) return 'marketplace';
  try {
    const param = new URLSearchParams(window.location.search).get('site');
    if (param === 'marketplace' || param === 'full') {
      window.sessionStorage.setItem('siqa_site', param);
      return param;
    }
    const saved = window.sessionStorage.getItem('siqa_site');
    if (saved === 'marketplace') return 'marketplace';
  } catch {
    // sessionStorage can throw in private modes; fall through.
  }
  return 'full';
}

export const SITE_MODE: SiteMode = detect();
export const IS_MARKETPLACE_SITE = SITE_MODE === 'marketplace';

/** Where "home" is on this site. */
export const SITE_HOME = IS_MARKETPLACE_SITE ? '/marketplace' : '/';

// Routes that belong to Gems (videos) or the nonprofit side. On the
// Marketplace site, landing on one of these sends you to the Shop.
const BLOCKED_PREFIXES = [
  '/gems', '/watch', '/channel', '/speaker', '/browse', '/gem-upload',
  '/seeds', '/seed', '/seed-create', '/orgs', '/org-profile', '/org-register',
  '/donate', '/donate-success', '/dashboard',
];

/** True when this path shouldn't be reachable on the current site. */
export function isBlockedOnSite(pathname: string): boolean {
  if (!IS_MARKETPLACE_SITE) return false;
  if (pathname === '/' || pathname === '') return true;
  return BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'));
}
