// The Siqa signature drawn over the player (imam · masjid · Siqa), top right, the same look as the one stamped into
// live-room recordings. Only for videos that don't already have it stamped in.
import { useEffect, useState } from 'react';
import { View, Image, Platform } from 'react-native';

const SIQA_MARK = Platform.OS === 'web' ? '/brand/siqa-mark.png' : 'https://www.siqa.us/brand/siqa-mark.png';

function Logo({ uri, h }: { uri: string; h: number }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    Image.getSize(uri, (w, hh) => { if (alive && w && hh) setRatio(Math.min(w / hh, 3.4)); }, () => alive && setRatio(0));
    return () => { alive = false; };
  }, [uri]);
  if (!ratio) return null;
  return <Image source={{ uri }} resizeMode="contain" accessible={false} style={{ height: h, width: Math.round(h * ratio) }} />;
}

export function SignatureOverlay({ speakerWm, masjidWm }: { speakerWm?: string | null; masjidWm?: string | null }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const h = box ? Math.max(16, Math.round(box.h * 0.06)) : 0;
  const marks = [speakerWm, masjidWm, SIQA_MARK].filter(Boolean) as string[];
  return (
    <View pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {box ? (
        <View style={{
          position: 'absolute', right: '2.5%', top: '3.5%', flexDirection: 'row', alignItems: 'center', gap: Math.round(h * 0.4),
          paddingHorizontal: Math.round(h * 0.3), paddingVertical: Math.round(h * 0.18), borderRadius: h,
          backgroundColor: 'rgba(10,15,28,0.42)', opacity: 0.95,
        }}>
          {marks.map((u, i) => (
            <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(h * 0.4) }}>
              {i > 0 ? <View style={{ width: 1, height: Math.round(h * 0.6), backgroundColor: 'rgba(255,255,255,0.35)' }} /> : null}
              <Logo uri={u} h={h} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
