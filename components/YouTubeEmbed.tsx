import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';

type Props = {
  videoId: string;
  // Aspect ratio container height is derived from width via aspectRatio,
  // so no fixed height is needed here.
};

/**
 * Plays a YouTube video via YouTube's own official embed player.
 * This is the ToS-compliant way to show someone else's YouTube content —
 * we never download or rehost the file, we just display YouTube's player,
 * same as embedding a YouTube video on any website.
 */
export function YouTubeEmbed({ videoId }: Props) {
  const embedUrl = `https://www.youtube.com/embed/${videoId}?playsinline=1&modestbranding=1&rel=0`;

  if (Platform.OS === 'web') {
    // react-native-web renders to real DOM, so a plain iframe works here —
    // this branch never executes on native, so it's safe despite 'iframe'
    // not being a React Native primitive.
    return React.createElement('iframe', {
      src: embedUrl,
      style: { width: '100%', height: '100%', border: 0 },
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowFullScreen: true,
      title: 'YouTube video player',
    });
  }

  // Native: react-native-webview
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebView } = require('react-native-webview');
  return (
    <View style={styles.nativeWrap}>
      <WebView
        source={{ uri: embedUrl }}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nativeWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
