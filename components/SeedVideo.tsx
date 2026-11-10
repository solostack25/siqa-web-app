import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { YouTubeEmbed } from './YouTubeEmbed';
import { Icon } from './Icon';
import { useTheme } from '../lib/theme';

/** YouTube id from a watch / youtu.be / shorts / embed / live URL, else null. */
export function seedYouTubeId(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const m =
    uri.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    uri.match(/youtube(?:-nocookie)?\.com\/.*[?&]v=([A-Za-z0-9_-]{11})/) ||
    uri.match(/youtube(?:-nocookie)?\.com\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * A Seed's video with the platform's own play controls.
 *
 * - YouTube link (an org's video from its channel): thumbnail + play button,
 *   then YouTube's official embed player on tap — never downloaded or rehosted.
 * - web: a plain <video controls>, which browsers always let the viewer play
 *   (hiding controls and flipping shouldPlay never started playback on web);
 * - iOS/Android: expo-av with the phone's standard controls.
 */
export function SeedVideo({
  uri,
  poster,
  fit = 'cover',
  style,
}: {
  uri: string;
  poster?: string | null;
  fit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
}) {
  const ytId = seedYouTubeId(uri);
  if (ytId) return <YouTubeSeedVideo id={ytId} poster={poster} style={style} />;

  if (Platform.OS === 'web') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]}>
        {React.createElement('video', {
          src: uri,
          poster: poster || undefined,
          controls: true,
          playsInline: true,
          preload: 'metadata',
          style: { width: '100%', height: '100%', objectFit: fit, display: 'block', backgroundColor: '#000' },
        })}
      </View>
    );
  }
  return (
    <Video videoStyle={{ width: '100%', height: '100%' }}
      source={{ uri }}
      posterSource={poster ? { uri: poster } : undefined}
      usePoster={Boolean(poster)}
      posterStyle={{ resizeMode: fit } as any}
      useNativeControls
      resizeMode={fit === 'cover' ? ResizeMode.COVER : ResizeMode.CONTAIN}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}

function YouTubeSeedVideo({ id, poster, style }: { id: string; poster?: string | null; style?: StyleProp<ViewStyle> }) {
  // Tap-to-load: a feed of Seeds shouldn't spin up an iframe per card.
  const { colors: C } = useTheme();
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]}>
        <YouTubeEmbed videoId={id} autoplay />
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => setPlaying(true)}
      accessibilityRole="button"
      accessibilityLabel="Play video"
      style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]}
    >
      <Image
        source={{ uri: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }}
        defaultSource={poster ? { uri: poster } : undefined}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 }}>
          <Icon name="play" size={28} color={C.black} />
        </View>
      </View>
    </Pressable>
  );
}
