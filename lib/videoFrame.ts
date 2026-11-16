import { Platform } from 'react-native';

// expo-video-thumbnails is native-only — not available on web.
const VideoThumbnails = Platform.OS !== 'web' ? require('expo-video-thumbnails') : null;

/**
 * Grab still frames from a video at the given points (0–1 of its length).
 * Returns one image URI per point (a data: URL on web, a file:// URI on
 * native), or null where that frame couldn't be read.
 *
 * Works for local files and remote URLs. On web a remote video must be
 * served with CORS headers, otherwise the browser won't let us read the
 * pixels and every entry comes back null.
 */
export async function captureVideoFrames(
  uri: string,
  points: number[],
  durationHintSecs?: number | null,
): Promise<(string | null)[]> {
  if (Platform.OS === 'web') return captureFramesWeb(uri, points);
  if (!VideoThumbnails) return points.map(() => null);
  const durMs = (durationHintSecs && durationHintSecs > 0 ? durationHintSecs : 30) * 1000;
  const out: (string | null)[] = [];
  for (const p of points) {
    try {
      const { uri: frame } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: Math.round(Math.min(Math.max(p, 0), 0.99) * durMs),
        quality: 0.85,
      });
      out.push(frame);
    } catch {
      out.push(null);
    }
  }
  return out;
}

function captureFramesWeb(uri: string, points: number[]): Promise<(string | null)[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const out: (string | null)[] = [];
    let i = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      while (out.length < points.length) out.push(null);
      resolve(out);
    };
    // Don't hang the editor if the network stalls.
    const timer = setTimeout(finish, 20000);

    const seekNext = () => {
      if (i >= points.length) return finish();
      const d = video.duration && isFinite(video.duration) ? video.duration : 1;
      video.currentTime = Math.min(Math.max(points[i] * d, 0), Math.max(d - 0.05, 0));
    };

    video.onloadedmetadata = seekNext;
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        // Tainted canvas (no CORS) — no frame can be read from this video.
        return finish();
      }
      i += 1;
      seekNext();
    };
    video.onerror = finish;
    video.src = uri;
  });
}
