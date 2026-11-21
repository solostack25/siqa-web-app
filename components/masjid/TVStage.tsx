// Lays out a fixed 1920×1080 (or 1080×1920) design and scales it to whatever TV it's on,
// so every screen looks the same from a 1366×768 set to a 4K panel.
import { View, useWindowDimensions, Text, Animated, Easing } from 'react-native';
import { useEffect, useRef, useState } from 'react';

export function TVStage({ children, portrait = false, bg = '#0a0f1c' }: { children: React.ReactNode; portrait?: boolean; bg?: string }) {
  const { width, height } = useWindowDimensions();
  const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
  const scale = Math.min(width / W, height / H);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: bg, overflow: 'hidden' }}>
      <View style={{
        position: 'absolute', width: W, height: H,
        left: (width - W * scale) / 2, top: (height - H * scale) / 2,
        transform: [{ scale }], transformOrigin: 'top left',
      } as any}>
        {children}
      </View>
    </View>
  );
}

/** Text that scrolls right-to-left forever (bottom ticker). */
export function Ticker({ text, width, style }: { text: string; width: number; style: any }) {
  const x = useRef(new Animated.Value(width)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!w) return;
    x.setValue(width);
    const anim = Animated.loop(Animated.timing(x, { toValue: -w, duration: ((width + w) / 110) * 1000, easing: Easing.linear, useNativeDriver: false }));
    anim.start();
    return () => anim.stop();
  }, [w, width, text]);
  return (
    <View style={{ width, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateX: x }], flexDirection: 'row', width: 8000 }}>
        <Text onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[style, { whiteSpace: 'nowrap', alignSelf: 'flex-start' } as any]}>{text}</Text>
      </Animated.View>
    </View>
  );
}
