import { Share, Platform } from 'react-native';
import { showToast } from '../components/Toast';
import { canonicalOrigin } from './site';

/**
 * Base URL used to build shareable links.
 * On web this reads the real origin, so links shared from
 * shop.siqa.us stay on the Marketplace and links from www.siqa.us stay
 * on the full app. On native there's no
 * window.location, so it falls back to the full app's domain — update
 * this if the production domain changes (e.g. siqa.us).
 */
export const NATIVE_SHARE_BASE_URL = 'https://www.siqa.us';

export function getAppBaseUrl(): string {
  if (Platform.OS === 'web') return canonicalOrigin();
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
        // Android joins text and url with a single space, which runs the
        // link into the sentence. Put the link on its own line there.
        const android = /android/i.test(nav.userAgent || '');
        await nav.share(android ? { title, text: `${text}\n\n${url}` } : { title, text, url });
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
      Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n\n${url}` },
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

/**
 * YouTube titles often end with the speaker's name ("… | Dr. Omar Suleiman").
 * The share message already names the speaker, so drop that tail segment.
 */
export function cleanVideoTitle(title: string, speakerName?: string | null): string {
  const t = (title || '').trim();
  if (!speakerName) return t;
  const last = speakerName.trim().split(/\s+/).pop()?.toLowerCase();
  if (!last || last.length < 3) return t;
  const parts = t.split(/\s+[|\u2013\u2014-]\s+/);
  while (parts.length > 1 && parts[parts.length - 1].toLowerCase().includes(last)) parts.pop();
  return parts.join(' | ');
}

// Messages read as two short lines, then the link on its own line:
//   Voting in America: Haram or Wajib?
//   Sh. Yasir Qadhi on Siqa
//
//   https://www.siqa.us/watch/…
export function shareVideo(videoId: string, title: string, speakerName?: string | null) {
  const clean = cleanVideoTitle(title, speakerName);
  return shareLink({
    url: getVideoShareUrl(videoId),
    title: clean,
    text: speakerName ? `${clean}\n${speakerName} on Siqa` : `${clean}\nOn Siqa`,
  });
}

export function shareShort(videoId: string, title: string | null | undefined, speakerName?: string | null) {
  const label = cleanVideoTitle(title?.trim() || 'A Gem', speakerName);
  return shareLink({
    url: getShortShareUrl(videoId),
    title: label,
    text: speakerName ? `${label}\n${speakerName} on Siqa` : `${label}\nOn Siqa`,
  });
}

export function shareProduct(productId: string, title: string, priceLabel?: string | null) {
  const price = priceLabel ? ` (${priceLabel})` : '';
  return shareLink({
    url: getProductShareUrl(productId),
    title,
    text: `${title}${price}\nOn Siqa Marketplace`,
  });
}

export function getShopShareUrl(sellerId: string): string {
  return `${getAppBaseUrl()}/shop/${sellerId}`;
}

export function shareShop(sellerId: string, shopName: string) {
  return shareLink({
    url: getShopShareUrl(sellerId),
    title: `${shopName} on Siqa`,
    text: `${shopName}\nShop on Siqa Marketplace`,
  });
}

export function getChaiShareUrl(postId: string): string {
  return `${getAppBaseUrl()}/chai/${postId}`;
}

export function shareChai(postId: string, title: string, text?: string) {
  return shareLink({ url: getChaiShareUrl(postId), title, text: text ?? `${title}\nOn Siqa Chai` });
}

export function shareSeed(seedId: string, title?: string | null) {
  const label = title?.trim() || 'this Seed';
  return shareLink({
    url: getSeedShareUrl(seedId),
    title: label,
    text: `${label}\nGive to this Seed on Siqa`,
  });
}

export function shareSpeaker(speakerId: string, name: string) {
  return shareLink({
    url: getSpeakerShareUrl(speakerId),
    title: `${name} on Siqa`,
    text: `${name}\nTalks and videos on Siqa`,
  });
}
