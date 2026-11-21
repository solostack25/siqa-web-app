// What kind of account is signed in. People who only run a masjid get a clutter-free
// Siqa: the app opens straight into the masjid console, without Gems, Shop or the
// nonprofit directory. They can still choose "Open the full Siqa app" from the console.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type AccountKind = {
  role: string | null; masjids: number; other_orgs: number; is_speaker: boolean; is_seller: boolean;
};

const FULL_APP_KEY = 'siqa_masjid_full_app';
export function wantsFullApp() {
  try { return Platform.OS === 'web' && typeof localStorage !== 'undefined' && localStorage.getItem(FULL_APP_KEY) === '1'; } catch { return false; }
}
export function setWantsFullApp(v: boolean) {
  try { if (v) localStorage.setItem(FULL_APP_KEY, '1'); else localStorage.removeItem(FULL_APP_KEY); } catch {}
}

export function isMasjidOnly(k: AccountKind | null) {
  if (!k || !k.masjids) return false;
  if (k.role === 'admin' || k.role === 'speaker' || k.is_speaker || k.is_seller || k.other_orgs > 0) return false;
  return true;
}

let cached: { uid: string; kind: AccountKind } | null = null;

export async function loadAccountKind(): Promise<AccountKind | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { cached = null; return null; }
  if (cached?.uid === session.user.id) return cached.kind;
  const { data } = await supabase.rpc('my_account_kind');
  if (!data) return null;
  cached = { uid: session.user.id, kind: data as AccountKind };
  return cached.kind;
}

/** True once we know this is a masjid-only account (and they haven't asked for the full app). */
export function useMasjidOnly() {
  const [only, setOnly] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => loadAccountKind().then((k) => { if (alive) setOnly(isMasjidOnly(k) && !wantsFullApp()); }).catch(() => {});
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { cached = null; setTimeout(check, 0); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  return only;
}
