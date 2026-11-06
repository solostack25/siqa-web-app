import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

// Over-the-air updates (EAS Update). Merging to master publishes new JS to
// installed apps. A downloaded update is applied the next time the app comes
// back from the background, so nobody gets reloaded mid-scroll.
// No-op on web and in development.
const Updates: typeof import('expo-updates') | null =
  Platform.OS === 'web' ? null : require('expo-updates');

const CHECK_EVERY_MS = 30 * 60 * 1000;

export function useOtaUpdates() {
  const ready = useRef(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!Updates || __DEV__ || !Updates.isEnabled) return;

    async function check() {
      if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      try {
        const res = await Updates!.checkForUpdateAsync();
        if (!res.isAvailable) return;
        const f = await Updates!.fetchUpdateAsync();
        if (f.isNew) ready.current = true;
      } catch {
        // Offline or the update server is unreachable: try again later.
      }
    }

    check();
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      if (ready.current) {
        ready.current = false;
        Updates!.reloadAsync().catch(() => {});
      } else {
        check();
      }
    });
    return () => sub.remove();
  }, []);
}
