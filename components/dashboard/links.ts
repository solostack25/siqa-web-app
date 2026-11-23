// Links between the dashboard and the main Siqa app.
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { IS_DASHBOARD_SITE } from '../../lib/site';

/** A public Siqa page (store, profile, Seed). Opens in place, so Back returns to the dashboard. */
export function openOnSiqa(path: string) {
  if (Platform.OS === 'web' && IS_DASHBOARD_SITE) { window.open(`https://www.siqa.us${path}`, '_blank', 'noopener'); return; }
  router.push(path as any);
}

/** Back to the viewer app. */
export function backToSiqa() {
  if (Platform.OS === 'web' && IS_DASHBOARD_SITE) { window.location.href = 'https://www.siqa.us/'; return; }
  router.replace('/(tabs)/home' as any);
}

/** Open the dashboard: it's part of siqa.us (/manage), so it opens in place with the same sign-in. */
export async function openDashboard(space?: string) {
  const qs = space ? `?space=${encodeURIComponent(space)}` : '';
  router.push(`/manage${qs}` as any);
}
