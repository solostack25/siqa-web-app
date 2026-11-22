// Plays a live HLS stream on the web (TV screens, the Siqa box WebView, Siqa Home).
// Uses hls.js wherever the browser supports it (Chrome, Android WebView, TV boxes): Android's
// built-in HLS often shows one frame and freezes on cheap boxes. Native HLS only where hls.js
// can't run (iPhone Safari). A watchdog recovers if the picture stops moving.
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

const STALL_MS = 8000;   // picture hasn't moved for this long → recover
const MAX_BEHIND_S = 8;  // drifted this far behind live → jump to live

export function LivePlayer({ src, muted = true, style, onEnded }: { src: string; muted?: boolean; style?: any; onEnded?: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const v = ref.current;
    if (!v) return;
    let hls: any = null;
    let cancelled = false;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastTime = -1;
    let lastMoved = Date.now();
    let recoveries = 0;

    const play = () => { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); };

    const start = async () => {
      const { default: Hls } = await import('hls.js');
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 2,           // play 2 segments behind live (lowest that stays smooth)
          liveMaxLatencyDurationCount: 4,     // hls.js catches up by itself if it falls behind
          maxBufferLength: 20,
          backBufferLength: 10,           // keep memory low on 2GB boxes
          manifestLoadingMaxRetry: 10,
          levelLoadingMaxRetry: 10,
          fragLoadingMaxRetry: 10,
        });
        hls.loadSource(src);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        hls.on(Hls.Events.ERROR, (_: any, d: any) => {
          if (!d?.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => hls?.startLoad(), 3000);
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
          else rebuild();
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = src; play();
      }
    };

    const rebuild = () => {
      try { hls?.destroy(); } catch {}
      hls = null;
      v.removeAttribute('src');
      v.load();
      lastTime = -1; lastMoved = Date.now();
      start();
    };

    // Watchdog: if the picture stops moving, nudge it back to live; if that doesn't help, reload the player.
    watchdog = setInterval(() => {
      if (cancelled || v.paused && v.readyState === 0) return;
      const t = v.currentTime;
      if (t !== lastTime) { lastTime = t; lastMoved = Date.now(); recoveries = 0; }
      // Drifted behind live: jump to the live edge.
      const liveEdge = hls?.liveSyncPosition ?? (v.seekable.length ? v.seekable.end(v.seekable.length - 1) - 3 : null);
      if (liveEdge && liveEdge - t > MAX_BEHIND_S) { v.currentTime = liveEdge; play(); }
      if (Date.now() - lastMoved < STALL_MS) return;
      lastMoved = Date.now();
      recoveries += 1;
      if (recoveries <= 1 && liveEdge) { v.currentTime = liveEdge; play(); }
      else { recoveries = 0; rebuild(); }
    }, 2000);

    start();
    return () => {
      cancelled = true;
      if (watchdog) clearInterval(watchdog);
      try { hls?.destroy(); } catch {}
    };
  }, [src]);
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);

  if (Platform.OS !== 'web') return <View style={[{ backgroundColor: '#000' }, style]} />;
  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      {React.createElement('video', {
        ref, muted, autoPlay: true, playsInline: true, controls: false,
        onEnded,
        style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
      })}
    </View>
  );
}
