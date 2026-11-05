import { Share, Platform } from 'react-native';
import { showToast } from '../components/Toast';

/**
 * Base URL used to build shareable links.
 * On web this reads the real origin, so links shared from
 * marketplace.thesiqaapp.com stay on the Marketplace and links from
 * gems.thesiqaapp.com stay on the full app. On native there's no
 * window.location, so it falls back to the full app's domain — update
 * this if the production domain changes (e.g. siqa.us).
 */
export const NATIVE_SHARE_BASE_URL = 'https://gems.thesiqaapp.com';

export function getAppBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return NATIVE_SHARE_BASE_URL;
}

/** Long-form video → its own watch page. */
export function getVideoShareUrl(videoId: string): string {
  return `${getAppBaseUrl()}/watch/${videoId}`;
}

/** Short (Gems feed) → opens the feed scrolled to that short. */
export function getShortShareUrl(videoId: string): string {
  return `${getAppBaseUrl()}/gems?videoId=${encodeURIComponent(videoId)}`;
}

export function getProductShareUrl(productId: string): string {
  return `${getAppBaseUrl()}/product/${productId}`;
}

export function getSpeakerShareUrl(speakerId: string): string {
  return `${getAppBaseUrl()}/speaker/${speakerId}`;
}

export function getSeedShareUrl(seedId: string): string {
  return `${getAppBaseUrl()}/seed/${seedId}`;
}

type ShareResult = { shared: boolean; copied: boolean };

/**
 * Shares a link and gives the user feedback. Behavior by platform:
 * - Native (iOS/Android): system share sheet.
 * - Web with the Web Share API (phones, Safari, installed PWA): native share sheet.
 * - Web without it (most desktop browsers): copies the link and shows a
 *   "Link copied" toast.
 * RN's Share module does nothing on web, and Alert.alert is a no-op there
 * too — that's why the old Gems/Seed share buttons appeared dead on web.
 */
export async function shareLink(opts: { url: string; title: string; text?: string }): Promise<ShareResult> {
  const { url, title } = opts;
  const text = opts.text ?? title;

  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;

    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return { shared: true, copied: false };
      } catch (e: any) {
        // AbortError = user closed the sheet. Anything else (e.g. not
        // allowed in this context) falls through to copying instead.
        if (e?.name === 'AbortError') return { shared: false, copied: false };
      }
    }

    if (await copyToClipboard(url)) {
      showToast('Link copied');
      return { shared: false, copied: true };
    }

    showToast("Couldn't share — copy the link from the address bar");
    return { shared: false, copied: false };
  }

  try {
    // iOS uses `url` as a rich link; Android only reads `message`.
    const result = await Share.share(
      Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` },
      { subject: title },
    );
    return { shared: result.action === Share.sharedAction, copied: false };
  } catch {
    return { shared: false, copied: false };
  }
}

async function copyToClipboard(value: string): Promise<boolean> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Clipboard API can be blocked (insecure context, permissions) — try the old way.
  }
  try {
    if (typeof document === 'undefined') return false;
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function shareVideo(videoId: string, title: string, speakerName?: string | null) {
  const by = speakerName ? ` by ${speakerName}` : '';
  return shareLink({
    url: getVideoShareUrl(videoId),
    title,
    text: `${title}${by} — watch on Siqa`,
  });
}

export function shareShort(videoId: string, title: string | null | undefined, speakerName?: string | null) {
  const label = title?.trim() || 'A Gem';
  const by = speakerName ? ` from ${speakerName}` : '';
  return shareLink({
    url: getShortShareUrl(videoId),
    title: label,
    text: `${label}${by} — watch on Siqa`,
  });
}

export function shareProduct(productId: string, title: string, priceLabel?: string | null) {
  const price = priceLabel ? ` (${priceLabel})` : '';
  return shareLink({
    url: getProductShareUrl(productId),
    title,
    text: `${title}${price} — on Siqa Marketplace`,
  });
}

export function shareSeed(seedId: string, title?: string | null) {
  const label = title?.trim() || 'this Seed';
  return shareLink({
    url: getSeedShareUrl(seedId),
    title: label,
    text: `Support "${label}" on Siqa`,
  });
}

export function shareSpeaker(speakerId: string, name: string) {
  return shareLink({
    url: getSpeakerShareUrl(speakerId),
    title: `${name} on Siqa`,
    text: `Watch ${name} on Siqa`,
  });
}
