// Links between the dashboard and the main Siqa app.
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { DASHBOARD_ORIGIN, IS_DASHBOARD_SITE } from '../../lib/site';

/** A public Siqa page (store, profile, Seed). On dashboard.siqa.us it opens siqa.us in a new tab. */
export function openOnSiqa(path: string) {
  if (Platform.OS === 'web' && IS_DASHBOARD_SITE) { window.open(`https://www.siqa.us${path}`, '_blank', 'noopener'); return; }
  router.push(path as any);
}

/** Back to the viewer app. */
export function backToSiqa() {
  if (Platform.OS === 'web' && IS_DASHBOARD_SITE) { window.location.href = 'https://www.siqa.us/'; return; }
  router.replace('/(tabs)/home' as any);
}

/**
 * Open the dashboard. In the phone app and on previews it's in-app (/manage). On siqa.us it's
 * the separate dashboard.siqa.us site, signed in for you: the session is handed over in the
 * URL fragment (never sent to a server) and wiped from the address bar on arrival.
 */
export async function openDashboard(space?: string) {
  const qs = space ? `?space=${encodeURIComponent(space)}` : '';
  if (Platform.OS !== 'web' || typeof window === 'undefined') { router.push(`/manage${qs}` as any); return; }
  const host = window.location.hostname;
  const onSiqa = host === 'siqa.us' || host === 'www.siqa.us';
  if (!onSiqa) { router.push(`/manage${qs}` as any); return; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = `${DASHBOARD_ORIGIN}/manage${qs}`; return; }
  const frag = new URLSearchParams({ at: session.access_token, rt: session.refresh_token, next: `/manage${qs}` }).toString();
  window.location.href = `${DASHBOARD_ORIGIN}/manage-handoff#${frag}`;
}
