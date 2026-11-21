// Plays a live HLS stream on the web (TV screens, the Siqa box WebView, Siqa Home).
// Uses the browser's own HLS when it has it (Safari, Android WebView), else hls.js.
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

export function LivePlayer({ src, muted = true, style, onEnded }: { src: string; muted?: boolean; style?: any; onEnded?: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const v = ref.current;
    if (!v) return;
    let hls: any = null;
    let cancelled = false;
    const play = () => { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); };
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src; play();
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, maxBufferLength: 20 });
          hls.loadSource(src);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, play);
          hls.on(Hls.Events.ERROR, (_: any, d: any) => {
            if (!d?.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => hls?.startLoad(), 3000);
            else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
          });
        } else { v.src = src; play(); }
      });
    }
    return () => { cancelled = true; try { hls?.destroy(); } catch {} };
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
