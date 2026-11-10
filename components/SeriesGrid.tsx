import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';

// Series cards for a speaker's channel or a content org's page.

type SeriesCard = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  videos: { count: number }[];
};

export function useSeriesFor(owner: { speakerId?: string; orgId?: string }) {
  const [rows, setRows] = useState<SeriesCard[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      let q = supabase
        .from('series')
        .select('id,title,description,cover_url,videos(count)')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(60);
      if (owner.orgId) q = q.eq('org_id', owner.orgId);
      else if (owner.speakerId) q = q.eq('speaker_id', owner.speakerId).is('org_id', null);
      else { setLoading(false); return; }
      const { data } = await q;
      if (!live) return;
      // Hide series that don't have a published episode yet.
      setRows(((data as any as SeriesCard[]) ?? []).filter(r => (r.videos?.[0]?.count ?? 0) > 0));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [owner.speakerId, owner.orgId]);
  return { rows, loading };
}

export function SeriesGrid({ rows, loading, columns, emptyText }: {
  rows: SeriesCard[];
  loading?: boolean;
  columns: number;
  emptyText?: string;
}) {
  const { c } = useDS();
  if (loading) return <ActivityIndicator color={c.ink2} />;
  if (!rows.length) return emptyText ? <Text style={[type.callout, { color: c.ink2 }]}>{emptyText}</Text> : null;
  const cols = Math.max(1, Math.min(columns, 4));
  const width = cols === 1 ? '100%' : `${(100 - (cols - 1) * 2) / cols}%`;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 }}>
      {rows.map((r, i) => {
        const n = r.videos?.[0]?.count ?? 0;
        return (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/series/${r.id}` as any)}
            accessibilityRole="link"
            accessibilityLabel={`${r.title}, ${n} episodes`}
            style={({ pressed }) => ({ width: width as any, marginRight: cols > 1 && (i + 1) % cols !== 0 ? '2%' : 0, gap: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <View style={{ aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.stage, alignItems: 'center', justifyContent: 'center' }}>
              {r.cover_url ? <Image source={{ uri: r.cover_url }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="albums-outline" size={28} color={c.brandGold} />}
              <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '34%', backgroundColor: 'rgba(10,15,28,0.78)', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Text style={[type.title2, { color: '#fff' }]}>{n}</Text>
                <Icon name="list" size={18} color="#fff" />
              </View>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={[type.callout, font(700), { color: c.ink }]} numberOfLines={2}>{r.title}</Text>
              <Text style={[type.caption, { color: c.ink2 }]}>Series · {n} episode{n === 1 ? '' : 's'}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
