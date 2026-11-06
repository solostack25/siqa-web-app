import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

/**
 * A Seed's video with the platform's own play controls.
 *
 * The old version hid the controls and started playback by flipping
 * expo-av's `shouldPlay` after a tap. On the website that never started the
 * video (the play button disappeared, the video stayed paused), so:
 * - web: a plain <video controls>, which browsers always let the viewer play;
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
    <Video
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
