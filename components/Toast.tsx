import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brandStyles } from '../lib/ds';

/**
 * Tiny app-wide toast. Works the same on native and web — unlike
 * Alert.alert, which does nothing on react-native-web.
 *
 *   import { showToast } from '../components/Toast';
 *   showToast('Link copied');
 *
 * <ToastHost /> is mounted once in app/_layout.tsx.
 */

type Listener = (message: string) => void;
let listener: Listener | null = null;

export function showToast(message: string) {
  listener?.(message);
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (msg: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(msg);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() =>
          setMessage(null),
        );
      }, 2200);
    };
    return () => {
      listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opacity]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 84 }]}>
      <Animated.View
        style={[styles.toast, { opacity }]}
        accessibilityLiveRegion="polite"
        accessibilityRole={'alert' as any}
      >
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create(brandStyles({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: 'rgba(20, 22, 21, 0.94)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    maxWidth: 420,
    marginHorizontal: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
}));
