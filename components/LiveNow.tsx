// Live khutbahs and sessions happening right now: a strip for Home and a banner for a speaker's profile.
// Each hides itself when nothing is live.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { font, radius, space, type, useDS } from '../lib/ds';
import { Icon } from './Icon';

export type LiveItem = {
  watch_token: string; title: string; started_at: string; speaker_id: string; speaker_name: string;
  avatar_url: string | null; masjid_name: string | null; is_verified: boolean;
};

/** Polls who's live (every 30 s while the screen is in view). */
export function useLiveNow(speakerId?: string | null) {
  const [items, setItems] = useState<LiveItem[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('siqa_live_now', { p_speaker: speakerId ?? null });
    setItems((data as LiveItem[]) || []);
  }, [speakerId]);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]));
  return items;
}

const sinceLabel = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just started' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

function LivePill() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#d9755f' }}>
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#fff' }} />
      <Text style={[type.caption, font(700), { color: '#fff' }]}>LIVE</Text>
    </View>
  );
}

function Avatar({ uri, size = 44 }: { uri: string | null; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 999, backgroundColor: '#243049' }} />
    : <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: '#243049', alignItems: 'center', justifyContent: 'center' }}><Icon name="person" size={size / 2} color="#9facc4" /></View>;
}

/** Home: a dark strip of everyone live right now. */
export function LiveNowStrip({ pad = space[4] }: { pad?: number }) {
  const items = useLiveNow();
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: space[6] }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: space[3] }}>
        {items.map((it) => (
          <Pressable
            key={it.watch_token}
            onPress={() => router.push(`/live/${it.watch_token}` as any)}
            accessibilityRole="link"
            accessibilityLabel={`${it.speaker_name} is live: ${it.title}. Watch now`}
            style={({ pressed }) => [{
              width: items.length === 1 ? undefined : 300, minWidth: 280, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space[3],
              padding: space[4], borderRadius: radius.xl, backgroundColor: '#0a0f1c', transform: [{ scale: pressed ? 0.98 : 1 }],
            }]}
          >
            <Avatar uri={it.avatar_url} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <LivePill />
                <Text style={[type.caption, { color: '#9facc4' }]}>{sinceLabel(it.started_at)}</Text>
              </View>
              <Text style={[type.headline, { color: '#edf1f7' }]} numberOfLines={1}>{it.speaker_name}</Text>
              <Text style={[type.subhead, { color: '#9facc4' }]} numberOfLines={1}>{it.title}{it.masjid_name ? ` · ${it.masjid_name}` : ''}</Text>
            </View>
            <View style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type.subhead, font(700), { color: '#0a0f1c' }]}>Watch</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Speaker profile: "Live now" banner when this speaker is live. */
export function SpeakerLiveBanner({ speakerId, style }: { speakerId: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useDS();
  const items = useLiveNow(speakerId);
  const it = items[0];
  if (!it) return null;
  return (
    <Pressable
      onPress={() => router.push(`/live/${it.watch_token}` as any)}
      accessibilityRole="link"
      accessibilityLabel={`Live now: ${it.title}. Watch`}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.xl,
        backgroundColor: '#0a0f1c', opacity: pressed ? 0.92 : 1,
      }, style]}
    >
      <LivePill />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: '#edf1f7' }]} numberOfLines={1}>{it.title}</Text>
        <Text style={[type.subhead, { color: '#9facc4' }]} numberOfLines={1}>{it.masjid_name ? `${it.masjid_name} · ` : ''}{sinceLabel(it.started_at)}</Text>
      </View>
      <Text style={[type.subhead, font(700), { color: c.brandGold }]}>Watch ›</Text>
    </Pressable>
  );
}
