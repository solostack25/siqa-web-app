import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { Avatar, Card, CardTitle } from './SeedSocial';
import { Chip } from './ui';

// Videos owned by a content organization: public.videos rows with
// org_id = this org. Unlike OrgVideos (nonprofit profile-only videos), these
// are real Gems and also show in the main feed.

type OrgVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  platform: string | null;
  platform_video_id: string | null;
  duration_secs: number | null;
  format: string | null;
  published_at: string | null;
  speaker_id: string | null;
  speakers: { id: string; display_name: string; avatar_url: string | null } | null;
};

function thumbFor(v: OrgVideo) {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.platform === 'youtube' && v.platform_video_id) return `https://i.ytimg.com/vi/${v.platform_video_id}/hqdefault.jpg`;
  return null;
}

function duration(secs: number | null) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function ago(iso: string | null) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return 'Today';
  if (d < 2) return 'Yesterday';
  if (d < 7) return `${Math.floor(d)} days ago`;
  if (d < 30) { const w = Math.floor(d / 7); return `${w} week${w === 1 ? '' : 's'} ago`; }
  if (d < 365) { const m = Math.floor(d / 30); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.floor(d / 365); return `${y} year${y === 1 ? '' : 's'} ago`;
}

export function OrgGemVideos({ orgId, orgName, limit, columns, onSeeAll, onCount }: {
  orgId: string;
  orgName: string;
  limit?: number;
  columns: number;
  onSeeAll?: () => void;
  onCount?: (n: number) => void;
}) {
  const { c } = useDS();
  const [videos, setVideos] = useState<OrgVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [speaker, setSpeaker] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, count } = await supabase
        .from('videos')
        .select('id,title,thumbnail_url,platform,platform_video_id,duration_secs,format,published_at,speaker_id,speakers(id,display_name,avatar_url)', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('is_published', true)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(limit ? limit : 200);
      if (!live) return;
      setVideos((data as any as OrgVideo[]) ?? []);
      onCount?.(count ?? (data?.length ?? 0));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [orgId, limit]);

  const speakers = useMemo(() => {
    const seen = new Map<string, string>();
    videos.forEach(v => { if (v.speakers && !seen.has(v.speakers.id)) seen.set(v.speakers.id, v.speakers.display_name); });
    return [...seen.entries()];
  }, [videos]);

  const shown = speaker ? videos.filter(v => v.speaker_id === speaker) : videos;
  const cols = Math.max(1, Math.min(columns, 4));
  const cardWidth = cols === 1 ? '100%' : `${(100 - (cols - 1) * 2) / cols}%`;

  function open(v: OrgVideo) {
    if (v.format === 'short') router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any);
    else router.push(`/watch/${v.id}` as any);
  }

  return (
    <Card>
      <CardTitle right={limit && onSeeAll && videos.length >= limit ? (
        <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="link">
          <Text style={[type.subhead, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>See all</Text>
        </Pressable>
      ) : undefined}>{`Latest from ${orgName}`}</CardTitle>

      {!limit && speakers.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Filter by scholar">
          <Chip label="All scholars" selected={!speaker} onPress={() => setSpeaker(null)} />
          {speakers.map(([id, name]) => (
            <Chip key={id} label={name} selected={speaker === id} onPress={() => setSpeaker(id)} />
          ))}
        </View>
      ) : null}

      {loading ? <ActivityIndicator color={c.ink2} /> : null}
      {!loading && !videos.length ? (
        <Text style={[type.callout, { color: c.ink2 }]}>No videos yet. When your scholars post under {orgName}, they show here and in Gems.</Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 }}>
        {shown.map((v, i) => {
          const thumb = thumbFor(v);
          const len = duration(v.duration_secs);
          return (
            <Pressable
              key={v.id}
              onPress={() => open(v)}
              accessibilityRole="link"
              accessibilityLabel={v.title}
              style={({ pressed }) => [{ width: cardWidth as any, marginRight: cols > 1 && (i + 1) % cols !== 0 ? '2%' : 0, gap: 8, opacity: pressed ? 0.85 : 1 }, cols === 1 && { flexDirection: 'row', gap: 12 }]}
            >
              <View style={[{ aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: c.stage, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, cols === 1 && { width: 150, borderRadius: radius.md }]}>
                {thumb ? <Image source={{ uri: thumb }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' } as any} resizeMode="cover" /> : <Icon name="diamond-outline" size={26} color={c.brandGold} />}
                {len ? (
                  <View style={{ position: 'absolute', right: 6, bottom: 6, backgroundColor: c.scrim, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={[type.micro, { color: '#fff', fontSize: 11 }]}>{len}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flex: cols === 1 ? 1 : undefined, gap: 4, minWidth: 0 }}>
                <Text style={[type.callout, font(700), { color: c.ink }]} numberOfLines={2}>{v.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {cols > 1 ? <Avatar name={v.speakers?.display_name} url={v.speakers?.avatar_url} size={22} tone="neutral" /> : null}
                  <Text style={[type.caption, { color: c.ink2, flexShrink: 1 }]} numberOfLines={1}>
                    {[v.speakers?.display_name, ago(v.published_at)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
