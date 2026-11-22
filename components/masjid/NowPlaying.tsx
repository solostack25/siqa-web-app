// "Play at masjid": a lecture a masjid team put on all its TV screens. Every screen plays from the
// same point (started_at), so all the masjid's TVs stay together; it ends on its own after the
// video's length. A live khutbah still takes over.
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { readToken } from '../../lib/screenDevice';

export type NowPlayingInfo = {
  video_id: string; title: string; platform: string | null; platform_video_id: string | null; video_url: string | null;
  duration_secs: number | null; speaker_name: string | null; started_at: string; server_now: string;
};

export function useNowPlaying(pollMs = 10000) {
  const [np, setNp] = useState<(NowPlayingInfo & { offsetMs: number }) | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let alive = true;
    const load = async () => {
      const token = readToken();
      if (!token) return;
      const t0 = Date.now();
      const { data } = await supabase.rpc('screen_now_playing', { p_device_token: token });
      if (!alive) return;
      const d = data as NowPlayingInfo | null;
      setNp((prev) => {
        if (!d) return null;
        const offsetMs = new Date(d.server_now).getTime() - (t0 + (Date.now() - t0) / 2);
        // Same video, same start: keep the old object so the player isn't rebuilt.
        if (prev && prev.video_id === d.video_id && prev.started_at === d.started_at) return prev;
        return { ...d, offsetMs };
      });
    };
    load();
    const t = setInterval(load, pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [pollMs]);
  return np;
}

/** Seconds into the video the masjid's screens should be at right now. */
function elapsed(np: NowPlayingInfo & { offsetMs: number }) {
  return Math.max(0, (Date.now() + np.offsetMs - new Date(np.started_at).getTime()) / 1000);
}

export function NowPlayingPlayer({ np, muted, style }: { np: NowPlayingInfo & { offsetMs: number }; muted: boolean; style?: any }) {
  if (Platform.OS !== 'web') return <View style={[{ backgroundColor: '#000' }, style]} />;
  const start = Math.floor(elapsed(np));
  if (np.platform === 'youtube' && np.platform_video_id) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(np.platform_video_id)}?autoplay=1&start=${start}&controls=0&rel=0&modestbranding=1&playsinline=1&mute=${muted ? 1 : 0}`;
    return (
      <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
        {React.createElement('iframe', { key: `${np.video_id}:${np.started_at}`, src, allow: 'autoplay; encrypted-media', title: np.title, style: { width: '100%', height: '100%', border: 0 } })}
      </View>
    );
  }
  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      {React.createElement('video', {
        key: `${np.video_id}:${np.started_at}`, src: np.video_url || undefined, autoPlay: true, playsInline: true, muted,
        onLoadedMetadata: (e: any) => { try { e.currentTarget.currentTime = elapsed(np); } catch {} },
        style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
      })}
    </View>
  );
}
