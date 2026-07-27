import { Share, Platform } from 'react-native';

/**
 * Base URL used to build shareable video links.
 * On web this is always correct (reads the real origin, so it keeps
 * working if/when the custom domain changes). On native there's no
 * window.location, so it falls back to a constant — update this if
 * the production domain changes.
 */
export function getAppBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'https://thesiqaapp.com';
}

export function getVideoShareUrl(videoId: string): string {
  return `${getAppBaseUrl()}/watch/${videoId}`;
}

type ShareResult = { copied: boolean };

/**
 * Shares a video link. Behavior differs by platform since RN's Share
 * module isn't implemented on web at all (react-native-web has no
 * working Share, calling it silently does nothing):
 * - Native (iOS/Android): system share sheet via RN's Share API
 * - Web with Web Share API support (most mobile browsers, Safari): native share sheet
 * - Web without it (most desktop browsers): copies the link to the clipboard
 *   — the caller should show its own "Link copied" confirmation in this case,
 *   signaled by the returned { copied: true }.
 */
export async function shareVideo(videoId: string, title: string): Promise<ShareResult> {
  const url = getVideoShareUrl(videoId);
  const shareText = `${title} — watch on Siqa`;

  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;

    if (nav?.share) {
      try {
        await nav.share({ title, text: shareText, url });
      } catch {
        // User cancelled or the browser rejected it — not an error worth surfacing.
      }
      return { copied: false };
    }

    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(url);
      return { copied: true };
    }

    return { copied: false };
  }

  try {
    await Share.share({ message: `${shareText}\n${url}`, url });
  } catch {
    // User cancelled — not an error worth surfacing.
  }
  return { copied: false };
}
