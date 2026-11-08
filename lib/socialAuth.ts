// First-login touches for people who sign in with Apple or Google.
//
// - Record terms acceptance the same way email sign-up does (the button
//   screen says "By continuing ... you agree to the Terms").
// - Give the profile a name if the provider didn't send one (Apple only
//   shares the name on the very first sign-in, and users can hide it).
//
// Safe to call on every SIGNED_IN: it only writes what's missing.

import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const TERMS_VERSION = '2026-11-07';

export async function finishSocialSignIn(session: Session | null) {
  const user = session?.user;
  if (!user) return;
  const provider = user.app_metadata?.provider;
  if (provider !== 'google' && provider !== 'apple') return;

  const meta = user.user_metadata ?? {};
  if (!meta.terms_accepted_at) {
    await supabase.auth.updateUser({ data: { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION } });
  }

  const { data: profile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle();
  if (!profile) return;
  const patch: Record<string, string> = {};
  if (!profile.full_name?.trim()) {
    const name = (meta.full_name || meta.name || '').trim();
    const fallback = user.email && !user.email.endsWith('privaterelay.appleid.com') ? user.email.split('@')[0] : 'Siqa member';
    patch.full_name = name || fallback;
  }
  if (!profile.avatar_url && (meta.avatar_url || meta.picture)) patch.avatar_url = meta.avatar_url || meta.picture;
  if (Object.keys(patch).length) await supabase.from('profiles').update(patch).eq('id', user.id);
}
