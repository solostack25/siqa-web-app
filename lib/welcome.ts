import { Platform } from 'react-native';
import { IS_MARKETPLACE_SITE } from './site';

/**
 * The siqa.us welcome page (app/welcome.tsx).
 *
 * While SHOW_WELCOME is true, people opening siqa.us ("/") in a browser see
 * the welcome page first, unless they ticked "Skip this page next time" or
 * opened the installed home-screen app (start_url /?source=pwa).
 * The phone apps and the Marketplace site never show it.
 *
 * Once people know Siqa, set SHOW_WELCOME to false: "/" goes straight to the
 * app again, and /welcome still works as a link.
 */
export const SHOW_WELCOME = true;

const KEY = 'siqa.skipWelcome';

export function shouldShowWelcome(): boolean {
  if (!SHOW_WELCOME || IS_MARKETPLACE_SITE || Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('source') === 'pwa') return false;
    return window.localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

export function setSkipWelcome() {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    /* private mode etc.: they'll just see it again */
  }
}

/** Where the app opens: Gems on phones (like TikTok), Home on desktop. */
export function appStartPath(isDesktopWeb: boolean): string {
  return IS_MARKETPLACE_SITE ? '/marketplace' : isDesktopWeb ? '/home' : '/gems';
}
