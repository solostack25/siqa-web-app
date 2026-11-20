// Remembers what someone chose on Create Account ("Seller") across steps that
// leave the page: Continue with Apple/Google, or confirming their email first.
// On the next sign-in, consumeSignupIntent() sends them where they meant to go.
// Web only (localStorage); the native app signs up in place, so it routes directly.

import { Platform } from 'react-native';

export type SignupIntent = 'seller' | 'speaker' | 'org';

const KEY = 'siqa_signup_intent';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // email confirmation can take a while

export function setSignupIntent(intent: SignupIntent | null) {
  if (Platform.OS !== 'web') return;
  try {
    if (intent) localStorage.setItem(KEY, JSON.stringify({ intent, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked (private mode etc.) — they can still find Sell on Siqa
  }
}

/** Returns the saved intent once (and clears it), if it's recent. */
export function consumeSignupIntent(): SignupIntent | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const { intent, at } = JSON.parse(raw) as { intent: SignupIntent; at: number };
    return Date.now() - at < MAX_AGE_MS ? intent : null;
  } catch {
    return null;
  }
}

/** Where each intent lands after sign-in. */
export const INTENT_ROUTE: Record<SignupIntent, string> = {
  seller: '/sell',
  speaker: '/apply-speaker',
  org: '/org-register',
};

// A claim invite link (siqa.us/claim?invite=…) opened while signed out:
// remembered so they land back on it after signing in or creating an account.
const INVITE_KEY = 'siqa_pending_claim_invite';

export function setPendingInvite(token: string | null) {
  if (Platform.OS !== 'web') return;
  try {
    if (token) localStorage.setItem(INVITE_KEY, JSON.stringify({ token, at: Date.now() }));
    else localStorage.removeItem(INVITE_KEY);
  } catch {
    // storage blocked — they can open the link again after signing in
  }
}

export function consumePendingInvite(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = localStorage.getItem(INVITE_KEY);
    if (!raw) return null;
    localStorage.removeItem(INVITE_KEY);
    const { token, at } = JSON.parse(raw) as { token: string; at: number };
    return Date.now() - at < MAX_AGE_MS ? token : null;
  } catch {
    return null;
  }
}
