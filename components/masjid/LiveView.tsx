// What a masjid TV shows during a live. For a live room (phone/computer in Siqa Studio) the TV joins
// the room itself through a small Studio page: real time, under a second behind, sound in sync.
// While that connects, or if it can't, it plays the regular stream (about 30 seconds behind).
// Camera streams (DJI/RTMP) only have the regular stream.
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { LivePlayer } from './LivePlayer';
import { readToken } from '../../lib/screenDevice';
import { STUDIO_URL } from '../../lib/studioLink';

type Mode = 'connecting' | 'realtime' | 'fallback';
const CONNECT_TIMEOUT_MS = 20000;

export function LiveView({ live, muted, style }: {
  live: { playback_url: string | null; watch_token?: string; room?: boolean };
  muted: boolean;
  style?: any;
}) {
  const token = Platform.OS === 'web' ? readToken() : null;
  const canRealtime = Boolean(live.room && token);
  const [mode, setMode] = useState<Mode>(canRealtime ? 'connecting' : 'fallback');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { setMode(canRealtime ? 'connecting' : 'fallback'); }, [live.watch_token, canRealtime]);

  useEffect(() => {
    if (!canRealtime || mode !== 'connecting') return;
    const onMsg = (e: MessageEvent) => {
      if (!String(e.origin).startsWith(STUDIO_URL) || e.data?.source !== 'siqa-room') return;
      if (e.data.type === 'ready') setMode('realtime');
      else if (e.data.type === 'failed' || e.data.type === 'ended') setMode('fallback');
    };
    window.addEventListener('message', onMsg);
    const t = setTimeout(() => setMode((m) => (m === 'connecting' ? 'fallback' : m)), CONNECT_TIMEOUT_MS);
    return () => { window.removeEventListener('message', onMsg); clearTimeout(t); };
  }, [canRealtime, mode, attempt]);

  // Real time dropped: try again in a minute (the regular stream plays meanwhile), or in 10 seconds
  // when there is no regular stream (watch parties).
  useEffect(() => {
    if (!canRealtime || mode !== 'fallback') return;
    const t = setTimeout(() => { setAttempt((a) => a + 1); setMode('connecting'); }, live.playback_url ? 60000 : 10000);
    return () => clearTimeout(t);
  }, [canRealtime, mode]);

  if (Platform.OS !== 'web') return live.playback_url ? <LivePlayer src={live.playback_url} muted={muted} style={style} /> : <View style={[{ backgroundColor: '#000' }, style]} />;
  const iframeSrc = `${STUDIO_URL}/screen-room?d=${encodeURIComponent(token || '')}&muted=${muted ? 1 : 0}&a=${attempt}`;
  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      {mode !== 'realtime' && live.playback_url ? (
        // While real time connects, show the regular stream without sound (so it doesn't play twice).
        <LivePlayer src={live.playback_url} muted={muted || mode === 'connecting'} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
      ) : null}
      {canRealtime && mode !== 'fallback'
        ? React.createElement('iframe', {
            key: iframeSrc,
            src: iframeSrc,
            allow: 'autoplay',
            title: 'Live',
            style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', border: 0, background: 'transparent', opacity: mode === 'realtime' ? 1 : 0 },
          })
        : null}
    </View>
  );
}
