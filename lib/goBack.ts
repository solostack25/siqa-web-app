import { Platform } from 'react-native';
import { router } from 'expo-router';

/**
 * Back button that always does something.
 *
 * router.back() is a no-op when there's nothing to go back to — e.g. a page
 * opened straight from a shared link (Messages, email, a fresh browser tab).
 * In that case go to `fallback` instead (the screen this page "lives under").
 */
export function goBack(fallback: string = '/home') {
  // Fresh browser tab opened from a link: no earlier page in this tab.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history.length <= 1) {
    router.replace(fallback as any);
    return;
  }
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}
