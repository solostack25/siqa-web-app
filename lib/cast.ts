import { Platform } from 'react-native';

// Cast a Siqa video to a TV from the website.
//
//   Chrome (desktop + Android) → Google Cast: Chromecast, Google TV, and
//     TVs with Chromecast built in. Uses Google's Default Media Receiver,
//     which plays our Bunny MP4 links directly — no receiver app to host.
//   Safari (Mac, iPhone, iPad) → AirPlay: Apple TV and AirPlay TVs.
//   Other browsers with the Remote Playback API → their own device picker.
//
// The phone app (iOS/Android build) would need the native Cast SDK and a
// new app build; this file is web only.

const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

export type CastMethod = 'googlecast' | 'airplay' | 'remoteplayback' | null;
export type CastState = 'unavailable' | 'idle' | 'connecting' | 'connected';

type Listener = (state: CastState, deviceName: string | null) => void;

let sdkPromise: Promise<boolean> | null = null;
let listeners: Listener[] = [];
let lastState: CastState = 'unavailable';
let lastDevice: string | null = null;

const w = () => (typeof window !== 'undefined' ? (window as any) : null);

function emit(state: CastState, device: string | null) {
  lastState = state;
  lastDevice = device;
  listeners.forEach((l) => l(state, device));
}

/** Load Google's Cast sender SDK once. Resolves true when it's usable (Chrome). */
export function loadGoogleCast(): Promise<boolean> {
  if (Platform.OS !== 'web' || !w()) return Promise.resolve(false);
  if (sdkPromise) return sdkPromise;
  // The SDK only works in Chrome-based browsers (Chrome, Edge, Android
  // Chrome); skip the download elsewhere. Chrome on iPhone is Safari inside.
  const isChromium = Boolean(w().chrome) && /Chrome\//.test(navigator.userAgent);
  if (!isChromium) return (sdkPromise = Promise.resolve(false));

  sdkPromise = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000);
    w().__onGCastApiAvailable = (available: boolean) => {
      clearTimeout(timeout);
      if (!available) return resolve(false);
      try {
        const cast = w().cast;
        const chrome = w().chrome;
        const ctx = cast.framework.CastContext.getInstance();
        ctx.setOptions({
          receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        const sync = () => {
          const s = ctx.getCastState();
          const session = ctx.getCurrentSession();
          const name = session?.getCastDevice?.()?.friendlyName ?? null;
          const C = cast.framework.CastState;
          emit(
            s === C.CONNECTED ? 'connected' : s === C.CONNECTING ? 'connecting' : 'idle',
            name,
          );
        };
        ctx.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, sync);
        ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, sync);
        sync();
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    const s = document.createElement('script');
    s.src = CAST_SDK_URL;
    s.async = true;
    s.onerror = () => { clearTimeout(timeout); resolve(false); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/** Which way this browser can send video to a TV, if any. */
export async function detectCastMethod(video?: HTMLVideoElement | null): Promise<CastMethod> {
  if (Platform.OS !== 'web' || !w()) return null;
  if (await loadGoogleCast()) return 'googlecast';
  if (w().WebKitPlaybackTargetAvailabilityEvent) return 'airplay';
  if (video && (video as any).remote) return 'remoteplayback';
  return null;
}

export function onCastStateChanged(listener: Listener) {
  listeners.push(listener);
  listener(lastState, lastDevice);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

export type CastMedia = {
  url: string;
  title: string;
  subtitle?: string | null;
  posterUrl?: string | null;
  startTime?: number;
};

/**
 * Open the TV picker and play the video there. Throws with a friendly
 * message when nothing could be cast. `video` is the page's own player,
 * used for AirPlay / Remote Playback and paused once the TV takes over.
 */
export async function castVideo(media: CastMedia, video: HTMLVideoElement | null, method: CastMethod) {
  if (method === 'googlecast') {
    const cast = w().cast;
    const chrome = w().chrome;
    const ctx = cast.framework.CastContext.getInstance();
    if (!ctx.getCurrentSession()) {
      // Opens Chrome's device list. Rejects with 'cancel' if they close it.
      await ctx.requestSession();
    }
    const session = ctx.getCurrentSession();
    if (!session) throw new Error('No TV connected.');

    const info = new chrome.cast.media.MediaInfo(media.url, guessType(media.url));
    info.streamType = chrome.cast.media.StreamType.BUFFERED;
    const meta = new chrome.cast.media.GenericMediaMetadata();
    meta.title = media.title;
    if (media.subtitle) meta.subtitle = media.subtitle;
    if (media.posterUrl) meta.images = [new chrome.cast.Image(media.posterUrl)];
    info.metadata = meta;

    const request = new chrome.cast.media.LoadRequest(info);
    request.autoplay = true;
    request.currentTime = Math.max(0, media.startTime ?? 0);
    await session.loadMedia(request);
    video?.pause();
    return;
  }

  if (method === 'airplay' && video && (video as any).webkitShowPlaybackTargetPicker) {
    (video as any).webkitShowPlaybackTargetPicker();
    return;
  }

  if (method === 'remoteplayback' && video && (video as any).remote) {
    await (video as any).remote.prompt();
    return;
  }

  throw new Error("This browser can't cast. Open Siqa in Chrome (Chromecast) or Safari (AirPlay).");
}

export function stopCasting() {
  try {
    w()?.cast?.framework?.CastContext.getInstance().endCurrentSession(true);
  } catch { /* nothing to stop */ }
}

function guessType(url: string) {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.m3u8')) return 'application/x-mpegurl';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}
