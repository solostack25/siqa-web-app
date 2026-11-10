import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';

// One video in a list: series episodes, playlist items, the watch-page queue.

export type ListVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  platform?: string | null;
  platform_video_id?: string | null;
  duration_secs?: number | null;
  format?: string | null;
  episode_number?: number | null;
  published_at?: string | null;
  speakers?: { id?: string; display_name: string } | null;
};

export const LIST_VIDEO_SELECT = 'id,title,thumbnail_url,platform,platform_video_id,duration_secs,format,episode_number,published_at,speakers(id,display_name)';

export function thumbFor(v: Pick<ListVideo, 'thumbnail_url' | 'platform' | 'platform_video_id'>) {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.platform === 'youtube' && v.platform_video_id) return `https://i.ytimg.com/vi/${v.platform_video_id}/hqdefault.jpg`;
  return null;
}

export function durationLabel(secs?: number | null) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Long videos open on the watch page (optionally inside a playlist); shorts in Gems. */
export function openListVideo(v: ListVideo, playlistId?: string) {
  if (v.format === 'short') router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any);
  else router.push((playlistId ? `/watch/${v.id}?list=${playlistId}` : `/watch/${v.id}`) as any);
}

export function VideoRow({ v, label, active, onPress, right, compact }: {
  v: ListVideo;
  /** e.g. "Episode 3" or "4" */
  label?: string | null;
  active?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  const { c } = useDS();
  const thumb = thumbFor(v);
  const len = durationLabel(v.duration_secs);
  const w = compact ? 120 : 168;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        onPress={onPress ?? (() => openListVideo(v))}
        accessibilityRole="link"
        accessibilityLabel={[label, v.title].filter(Boolean).join(': ')}
        style={({ pressed }) => ({
          flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center',
          padding: active ? 8 : 0, margin: active ? -8 : 0, borderRadius: radius.lg,
          backgroundColor: active ? c.goldTint : 'transparent', opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ width: w, aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: c.stage, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {thumb ? <Image source={{ uri: thumb }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="diamond-outline" size={22} color={c.brandGold} />}
          {len ? (
            <View style={{ position: 'absolute', right: 5, bottom: 5, backgroundColor: c.scrim, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={[type.micro, { color: '#fff', fontSize: 11 }]}>{len}</Text>
            </View>
          ) : null}
          {active ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="play" size={22} color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          {label ? <Text style={[type.micro, { color: active ? c.goldInk : c.ink2 }]}>{label}</Text> : null}
          <Text style={[compact ? type.subhead : type.callout, font(700), { color: c.ink }]} numberOfLines={2}>{v.title}</Text>
          {v.speakers?.display_name ? <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>{v.speakers.display_name}</Text> : null}
        </View>
      </Pressable>
      {right}
    </View>
  );
}
