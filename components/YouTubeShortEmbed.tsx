import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';

export type YouTubeShortHandle = {
  playAsync: () => Promise<void>;
  pauseAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
};

type Props = {
  videoId: string;
  loop?: boolean;
  onReadyForDisplay?: () => void;
};

// YouTube's IFrame Player API controls an embedded player via postMessage —
// this works the same way whether the embed is nested in a real <iframe> on
// web, or loaded as the top-level document inside a native WebView. This is
// the officially supported control mechanism (not scraping/injecting into
// YouTube's internal DOM), same spirit as the plain embed used on the watch
// page — just with imperative play/pause/mute control layered on top so it
// can plug into Gems' existing active-card play/pause logic.
function sendCommand(target: any, func: string, args: any[] = []) {
  const message = JSON.stringify({ event: 'command', func, args });
  if (Platform.OS === 'web') {
    target?.contentWindow?.postMessage(message, '*');
  } else {
    target?.postMessage?.(message);
  }
}

export const YouTubeShortEmbed = forwardRef<YouTubeShortHandle, Props>(
  ({ videoId, loop = true, onReadyForDisplay }, ref) => {
    const targetRef = useRef<any>(null);
    const [loaded, setLoaded] = useState(false);

    useImperativeHandle(ref, () => ({
      playAsync: async () => sendCommand(targetRef.current, 'playVideo'),
      pauseAsync: async () => sendCommand(targetRef.current, 'pauseVideo'),
      unloadAsync: async () => sendCommand(targetRef.current, 'stopVideo'),
    }));

    const embedUrl =
      `https://www.youtube.com/embed/${videoId}` +
      `?enablejsapi=1&playsinline=1&modestbranding=1&rel=0&controls=0` +
      (loop ? `&loop=1&playlist=${videoId}` : '');

    function handleLoad() {
      setLoaded(true);
      onReadyForDisplay?.();
    }

    if (Platform.OS === 'web') {
      return (
        <View style={StyleSheet.absoluteFill}>
          {React.createElement('iframe', {
            ref: targetRef,
            src: embedUrl,
            style: { width: '100%', height: '100%', border: 0 },
            allow: 'autoplay; encrypted-media; picture-in-picture',
            onLoad: handleLoad,
          })}
        </View>
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WebView } = require('react-native-webview');
    return (
      <WebView
        ref={targetRef}
        source={{ uri: embedUrl }}
        style={StyleSheet.absoluteFill}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={handleLoad}
        javaScriptEnabled
      />
    );
  }
);
