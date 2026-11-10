import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { Button } from './ui';
import { LIST_VIDEO_SELECT, VideoRow, openListVideo, type ListVideo } from './VideoRow';

// Watch page: the series this video belongs to, or the playlist it's being
// played from (?list=), with the current item highlighted and a Next button.

type Queue = { kind: 'series' | 'playlist'; id: string; title: string; items: ListVideo[] };

export function useWatchQueue(videoId: string | undefined, seriesId: string | null | undefined, playlistId: string | undefined) {
  const [queue, setQueue] = useState<Queue | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (playlistId) {
        const [{ data: p }, { data: it }] = await Promise.all([
          supabase.from('playlists').select('id,title').eq('id', playlistId).maybeSingle(),
          supabase.from('playlist_items').select(`videos(${LIST_VIDEO_SELECT},is_published)`).eq('playlist_id', playlistId).order('position', { ascending: true }).order('added_at', { ascending: true }),
        ]);
        if (!live) return;
        if (p) {
          const items = (((it as any[]) ?? []).map(r => r.videos).filter((v: any) => v && v.is_published !== false && v.format !== 'short')) as ListVideo[];
          setQueue({ kind: 'playlist', id: (p as any).id, title: (p as any).title, items });
          return;
        }
      }
      if (seriesId) {
        const [{ data: s }, { data: eps }] = await Promise.all([
          supabase.from('series').select('id,title').eq('id', seriesId).maybeSingle(),
          supabase.from('videos').select(LIST_VIDEO_SELECT).eq('series_id', seriesId).eq('is_published', true)
            .lte('published_at', new Date().toISOString())
            .order('episode_number', { ascending: true, nullsFirst: false }).order('published_at', { ascending: true }),
        ]);
        if (!live) return;
        if (s) { setQueue({ kind: 'series', id: (s as any).id, title: (s as any).title, items: (eps as any as ListVideo[]) ?? [] }); return; }
      }
      if (live) setQueue(null);
    })();
    return () => { live = false; };
  }, [videoId, seriesId, playlistId]);
  return queue;
}

export function WatchQueue({ queue, currentId, compact }: { queue: Queue; currentId: string; compact?: boolean }) {
  const { c } = useDS();
  const [open, setOpen] = useState(!compact);
  const idx = queue.items.findIndex(v => v.id === currentId);
  const next = idx >= 0 ? queue.items[idx + 1] : queue.items[0];
  const listParam = queue.kind === 'playlist' ? queue.id : undefined;
  const position = idx >= 0
    ? (queue.kind === 'series' ? `Episode ${queue.items[idx].episode_number ?? idx + 1} of ${queue.items.length}` : `${idx + 1} of ${queue.items.length}`)
    : `${queue.items.length} videos`;

  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: c.bgSunk, padding: 14, gap: 12 }}>
      <Pressable
        onPress={() => router.push((queue.kind === 'series' ? `/series/${queue.id}` : `/playlist/${queue.id}`) as any)}
        accessibilityRole="link"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Icon name={queue.kind === 'series' ? 'albums-outline' : 'list'} size={20} color={c.goldInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.micro, { color: c.goldInk, letterSpacing: 0.3 }]}>{queue.kind === 'series' ? 'SERIES' : 'PLAYLIST'} · {position.toUpperCase()}</Text>
          <Text style={[type.callout, font(700), { color: c.ink }]} numberOfLines={1}>{queue.title}</Text>
        </View>
        <Icon name="chevron-forward" size={16} color={c.ink3} />
      </Pressable>

      {next && next.id !== currentId ? (
        <Button
          size="md"
          variant="secondary"
          icon="play-skip-forward"
          label={queue.kind === 'series' ? `Next: Episode ${next.episode_number ?? (idx + 2)}` : 'Play next'}
          onPress={() => openListVideo(next, listParam)}
        />
      ) : null}

      {compact ? (
        <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={[type.subhead, font(600), { color: c.ink }]}>{open ? 'Hide list' : `Show all ${queue.items.length}`}</Text>
        </Pressable>
      ) : null}

      {open ? (
        <View style={{ gap: 14 }}>
          {queue.items.map((v, i) => (
            <VideoRow
              key={v.id}
              v={v}
              compact
              active={v.id === currentId}
              label={queue.kind === 'series' ? `Episode ${v.episode_number ?? i + 1}` : String(i + 1)}
              onPress={() => openListVideo(v, listParam)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
