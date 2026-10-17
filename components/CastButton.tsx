import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { castVideo, detectCastMethod, onCastStateChanged, stopCasting, type CastMedia, type CastMethod, type CastState } from '../lib/cast';
import { useTheme } from '../lib/theme';

/** The standard "cast" glyph (screen with signal waves); filled corner when connected. */
export function CastIcon({ size = 20, color = '#fff', connected = false }: { size?: number; color?: string; connected?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
        fill={color}
      />
      {connected && <Path d="M19 7H5v1.63c3.96 1.28 7.09 4.41 8.37 8.37H19V7z" fill={color} />}
    </Svg>
  );
}

type Props = {
  media: CastMedia;
  /** Finds the page's own <video> (for AirPlay, and to pause it when the TV takes over). */
  getVideoElement: () => HTMLVideoElement | null;
  /** 'pill' = labeled button next to Share; 'overlay' = round icon on the player. */
  variant?: 'pill' | 'overlay';
};

/**
 * Cast to TV. Renders nothing where casting isn't possible (the phone
 * app, Firefox), so it only shows up when it can work.
 */
export function CastButton({ media, getVideoElement, variant = 'pill' }: Props) {
  const { colors: C } = useTheme();
  const [method, setMethod] = useState<CastMethod>(null);
  const [state, setState] = useState<CastState>('unavailable');
  const [device, setDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let alive = true;
    // Give the player a moment to render its <video> before checking.
    const t = setTimeout(() => {
      detectCastMethod(getVideoElement()).then((m) => alive && setMethod(m));
    }, 300);
    const off = onCastStateChanged((s, d) => { setState(s); setDevice(d); });
    return () => { alive = false; clearTimeout(t); off(); };
  }, []);

  if (Platform.OS !== 'web' || !method) return null;

  const connected = method === 'googlecast' && state === 'connected';

  async function onPress() {
    setError(null);
    try {
      const video = getVideoElement();
      await castVideo({ ...media, startTime: video?.currentTime ?? 0 }, video, method);
    } catch (e: any) {
      // Closing the device list isn't an error.
      const code = typeof e === 'string' ? e : e?.code ?? e?.message;
      if (code === 'cancel' || code === 'CANCEL') return;
      setError(
        code === 'receiver_unavailable' || code === 'RECEIVER_UNAVAILABLE'
          ? 'No TVs found. Make sure your Chromecast or TV is on the same Wi-Fi.'
          : typeof e?.message === 'string' ? e.message : "Couldn't cast this video.",
      );
    }
  }

  if (variant === 'overlay') {
    return (
      <TouchableOpacity
        accessibilityLabel={connected ? `Casting to ${device ?? 'TV'}` : 'Cast to TV'}
        onPress={onPress}
        style={styles.overlay}
      >
        <CastIcon size={20} color={connected ? C.gold : '#fff'} connected={connected} />
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <View style={styles.pillRow}>
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: connected ? C.goldBg : C.surface2, borderColor: connected ? C.gold : C.border }]}
          onPress={onPress}
        >
          <CastIcon size={16} color={connected ? C.gold : C.text} connected={connected} />
          <Text style={[styles.pillText, { color: connected ? C.gold : C.text }]} numberOfLines={1}>
            {connected ? `On ${device ?? 'TV'}` : state === 'connecting' ? 'Connecting…' : 'Cast'}
          </Text>
        </TouchableOpacity>
        {connected && (
          <TouchableOpacity onPress={stopCasting} hitSlop={8}>
            <Text style={[styles.stop, { color: C.text3 }]}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={[styles.error, { color: C.text3 }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 12, right: 12, zIndex: 5,
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 0.5, maxWidth: 220,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  stop: { fontSize: 12, fontWeight: '600' },
  error: { fontSize: 12, marginTop: 6, maxWidth: 260 },
});
