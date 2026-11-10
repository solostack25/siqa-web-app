import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { focusedOnly } from '../../components/FocusedOnly';
import { Icon } from '../../components/Icon';
import { Button, IconButton, SegmentedControl, TextField } from '../../components/ui';
import { thumbFor } from '../../components/VideoRow';
import { font, radius, space, type, useDS } from '../../lib/ds';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { showToast } from '../../components/Toast';

type Row = {
  id: string;
  title: string;
  visibility: 'private' | 'public';
  updated_at: string;
  playlist_items: { count: number }[];
  first?: string | null;
};

function PlaylistsScreen() {
  const { c } = useDS();
  const isDesktopWeb = useIsDesktopWeb();
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [vis, setVis] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUid(user?.id ?? null);
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('playlists')
      .select('id,title,visibility,updated_at,playlist_items(count)')
      .eq('profile_id', user.id)
      .order('updated_at', { ascending: false });
    const list = ((data as any) as Row[]) ?? [];
    // A cover for each: its most recently added video.
    await Promise.all(list.map(async r => {
      if (!(r.playlist_items?.[0]?.count)) return;
      const { data: it } = await supabase
        .from('playlist_items')
        .select('videos(thumbnail_url,platform,platform_video_id)')
        .eq('playlist_id', r.id)
        .order('added_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      r.first = (it as any)?.videos ? thumbFor((it as any).videos) : null;
    }));
    setRows(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!uid || !title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from('playlists').insert({ profile_id: uid, title: title.trim(), visibility: vis }).select('id').single();
    setBusy(false);
    if (error || !data) { showToast(error?.message || "Couldn't create the playlist"); return; }
    setTitle(''); setCreating(false);
    router.push(`/playlist/${(data as any).id}` as any);
  }

  const cols = isDesktopWeb ? 4 : 2;
  const width = `${(100 - (cols - 1) * 3) / cols}%`;

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: isDesktopWeb ? space[8] : HEADER_TOP_PADDING, paddingHorizontal: isDesktopWeb ? space[10] : space[5], paddingBottom: 60 }}>
          <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', gap: space[6] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!isDesktopWeb ? <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as any))} /> : null}
              <Text style={[type.display, { color: c.ink, flex: 1 }]} accessibilityRole="header">Playlists</Text>
              {uid && !creating ? <Button size="md" icon="add" label="New" onPress={() => setCreating(true)} /> : null}
            </View>

            {creating ? (
              <View style={{ gap: 12, padding: space[4], borderRadius: radius.lg, backgroundColor: c.bgSunk, maxWidth: 560 }}>
                <TextField label="Playlist name" placeholder="e.g. Ramadan reminders" value={title} onChangeText={setTitle} maxLength={120} autoFocus />
                <SegmentedControl label="Who can see it" options={[{ value: 'private', label: 'Only me' }, { value: 'public', label: 'Public' }]} value={vis} onChange={v => setVis(v as any)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button size="md" label="Create" onPress={create} loading={busy} disabled={!title.trim()} />
                  <Button size="md" variant="secondary" label="Cancel" onPress={() => setCreating(false)} />
                </View>
              </View>
            ) : null}

            {loading ? <ActivityIndicator color={c.ink2} /> : null}
            {!loading && uid === null ? (
              <View style={{ gap: 12, maxWidth: 420 }}>
                <Text style={[type.callout, { color: c.ink2 }]}>Sign in to make playlists and save videos to them.</Text>
                <Button label="Sign in" onPress={() => router.push('/(auth)/login' as any)} />
              </View>
            ) : null}
            {!loading && uid && !rows.length && !creating ? (
              <Text style={[type.callout, { color: c.ink2 }]}>No playlists yet. On any video, tap “Playlist” to start one.</Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 24 }}>
              {rows.map((r, i) => {
                const n = r.playlist_items?.[0]?.count ?? 0;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => router.push(`/playlist/${r.id}` as any)}
                    accessibilityRole="link"
                    style={({ pressed }) => ({ width: width as any, marginRight: (i + 1) % cols !== 0 ? '3%' : 0, gap: 8, opacity: pressed ? 0.85 : 1 })}
                  >
                    <View style={{ aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.stage, alignItems: 'center', justifyContent: 'center' }}>
                      {r.first ? <Image source={{ uri: r.first }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="list" size={26} color={c.brandGold} />}
                      <View style={{ position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.scrim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Icon name="list" size={12} color="#fff" />
                        <Text style={[type.micro, { color: '#fff' }]}>{n}</Text>
                      </View>
                    </View>
                    <Text style={[type.callout, font(700), { color: c.ink }]} numberOfLines={2}>{r.title}</Text>
                    <Text style={[type.caption, { color: c.ink2 }]}>{r.visibility === 'public' ? 'Public' : 'Private'} · {n} video{n === 1 ? '' : 's'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

export default focusedOnly(PlaylistsScreen);
