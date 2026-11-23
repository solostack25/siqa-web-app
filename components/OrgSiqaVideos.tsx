// Siqa videos tagged to this masjid or organization: khutbahs and halaqas its imams gave there, posted to both
// the imam's page and this one.
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../lib/supabase';
import { font, space, type, useDS } from '../lib/ds';
import { VideoRow, LIST_VIDEO_SELECT, type ListVideo } from './VideoRow';

export function OrgSiqaVideos({ orgId, limit, title = 'From our mimbar' }: { orgId: string; limit?: number; title?: string }) {
  const { c, shadow } = useDS();
  const [rows, setRows] = useState<ListVideo[] | null>(null);
  useEffect(() => {
    supabase.from('videos').select(LIST_VIDEO_SELECT).eq('org_id', orgId).eq('is_published', true)
      .order('published_at', { ascending: false }).limit(limit ?? 60)
      .then(({ data }) => setRows((data as unknown as ListVideo[]) ?? []));
  }, [orgId, limit]);
  if (!rows || rows.length === 0) return null;
  return (
    <View style={[{ gap: space[3], padding: space[5], borderRadius: 20, backgroundColor: c.surface }, shadow('card')]}>
      <Text style={[type.title2, font(700), { color: c.ink }]}>{title}</Text>
      <View style={{ gap: space[2] }}>
        {rows.map((v) => <VideoRow key={v.id} v={v} label={v.speakers?.display_name ?? undefined} />)}
      </View>
    </View>
  );
}
