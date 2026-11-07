// Sign in with Apple and Google through Supabase Auth.
//
// iPhone + Apple: the native Apple sheet (expo-apple-authentication), whose
//   identity token Supabase verifies (signInWithIdToken). Apple only sends
//   the person's name the very first time, so it's saved right away.
// Everything else (Google everywhere, Apple on Android and the web): the
//   provider's page. On the web the browser goes there and comes back to
//   /auth-callback; in the app it opens in a secure browser sheet and comes
//   back to siqa://auth-callback with the session in the link.
//
// Supabase dashboard setup this needs: Authentication › Providers › Apple
// and Google turned on with their keys, and Authentication › URL
// Configuration › Redirect URLs listing https://www.siqa.us/auth-callback,
// https://siqa.us/auth-callback and siqa://auth-callback.

import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export const TERMS_VERSION = '2026-11-07';
export type SocialProvider = 'apple' | 'google';
export type SocialResult = { ok: true } | { ok: false; cancelled?: boolean; error?: string };

/** Native Apple sheet is available (iPhone with a build that includes it). */
export async function nativeAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try { return await AppleAuthentication.isAvailableAsync(); } catch { return false; }
}

/** Signing in counts as agreeing to the terms (the button says so); record it once. */
export async function stampTermsIfMissing() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.terms_accepted_at) return;
  await supabase.auth.updateUser({ data: { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION } });
}

async function appleNative(): Promise<SocialResult> {
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) return { ok: false, error: 'Apple didn’t return a sign-in token. Try again.' };
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
    if (error) return { ok: false, error: error.message };
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ').trim();
    if (name) {
      await supabase.auth.updateUser({ data: { full_name: name } });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('profiles').update({ full_name: name }).eq('id', user.id).is('full_name', null);
    }
    await stampTermsIfMissing();
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') return { ok: false, cancelled: true };
    return { ok: false, error: e?.message ?? 'Sign in with Apple didn’t work.' };
  }
}

function paramsFrom(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = [url.split('#')[1] ?? '', (url.split('?')[1] ?? '').split('#')[0]];
  parts.forEach((p) => p.split('&').forEach((kv) => {
    if (!kv) return;
    const [k, v = ''] = kv.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }));
  return out;
}

async function oauth(provider: SocialProvider): Promise<SocialResult> {
  if (Platform.OS === 'web') {
    const redirectTo = `${window.location.origin}/auth-callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    // On success the browser leaves the page; /auth-callback finishes up.
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data?.url) return { ok: false, error: error?.message ?? 'Couldn’t start sign-in.' };
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { ok: false, cancelled: true };
  const p = paramsFrom(res.url);
  if (p.error || p.error_description) return { ok: false, error: p.error_description || p.error };
  if (p.code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(p.code);
    if (e) return { ok: false, error: e.message };
  } else if (p.access_token && p.refresh_token) {
    const { error: e } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
    if (e) return { ok: false, error: e.message };
  } else {
    return { ok: false, error: 'Sign-in didn’t finish. Try again.' };
  }
  await stampTermsIfMissing();
  return { ok: true };
}

export async function signInWith(provider: SocialProvider): Promise<SocialResult> {
  if (provider === 'apple' && (await nativeAppleAvailable())) return appleNative();
  return oauth(provider);
}
