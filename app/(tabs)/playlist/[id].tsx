import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../../../components/DesktopShell';
import { focusedOnly } from '../../../components/FocusedOnly';
import { Icon } from '../../../components/Icon';
import { Button, IconButton, SegmentedControl, TextField } from '../../../components/ui';
import { LIST_VIDEO_SELECT, VideoRow, openListVideo, type ListVideo } from '../../../components/VideoRow';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { HEADER_TOP_PADDING } from '../../../constants/theme';
import { showToast } from '../../../components/Toast';
import { shareLink, getAppBaseUrl } from '../../../lib/share';

type Playlist = {
  id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public';
  profile_id: string;
  profiles: { full_name: string | null; username: string | null } | null;
};

function PlaylistScreen() {
  const { c } = useDS();
  const isDesktopWeb = useIsDesktopWeb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pl, setPl] = useState<Playlist | null>(null);
  const [items, setItems] = useState<ListVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<'private' | 'public'>('private');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: it }, { data: { user } }] = await Promise.all([
      supabase.from('playlists').select('id,title,description,visibility,profile_id,profiles(full_name,username)').eq('id', id).maybeSingle(),
      supabase.from('playlist_items').select(`position,added_at,videos(${LIST_VIDEO_SELECT},is_published)`).eq('playlist_id', id).order('position', { ascending: true }).order('added_at', { ascending: true }),
      supabase.auth.getUser(),
    ]);
    setPl(p as any);
    setItems((((it as any[]) ?? []).map(r => r.videos).filter((v: any) => v && v.is_published !== false)) as ListVideo[]);
    setMine(Boolean(p && user && (p as any).profile_id === user.id));
    if (p) { setTitle((p as any).title); setDesc((p as any).description ?? ''); setVis((p as any).visibility); }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/playlists' as any);
  }

  async function save() {
    if (!pl || !title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('playlists').update({ title: title.trim(), description: desc.trim() || null, visibility: vis }).eq('id', pl.id);
    setSaving(false);
    if (error) { showToast(error.message); return; }
    setEditing(false);
    load();
  }

  async function removeItem(v: ListVideo) {
    if (!pl) return;
    setItems(prev => prev.filter(x => x.id !== v.id));
    const { error } = await supabase.from('playlist_items').delete().eq('playlist_id', pl.id).eq('video_id', v.id);
    if (error) { showToast("Couldn't remove it"); load(); }
  }

  // Move a video up or down by swapping positions with its neighbour.
  async function move(index: number, dir: -1 | 1) {
    if (!pl) return;
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    await Promise.all(next.map((v, i) =>
      supabase.from('playlist_items').update({ position: i }).eq('playlist_id', pl.id).eq('video_id', v.id),
    ));
  }

  function confirmDelete() {
    if (!pl) return;
    const go = async () => {
      const { error } = await supabase.from('playlists').delete().eq('id', pl.id);
      if (error) { showToast(error.message); return; }
      router.replace('/playlists' as any);
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Delete “${pl.title}”? The videos stay on Siqa.`)) go();
    } else {
      Alert.alert('Delete playlist?', 'The videos stay on Siqa.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
    }
  }

  if (loading && !pl) {
    return <DesktopShell><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.ink2} /></View></DesktopShell>;
  }
  if (!pl) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.bg, padding: 24 }}>
          <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>This playlist is private or no longer exists.</Text>
          <Button size="md" variant="secondary" label="Go back" onPress={back} />
        </View>
      </DesktopShell>
    );
  }

  const ownerName = pl.profiles?.full_name || pl.profiles?.username;

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: isDesktopWeb ? space[8] : HEADER_TOP_PADDING - 8, paddingHorizontal: isDesktopWeb ? space[10] : space[5], paddingBottom: 60 }}>
          <View style={[{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: space[6] }, isDesktopWeb && { flexDirection: 'row', alignItems: 'flex-start', gap: space[8] }]}>
            <View style={[{ gap: space[4] }, isDesktopWeb && { width: 340 }]}>
              {!isDesktopWeb ? <View style={{ marginLeft: -10 }}><IconButton icon="chevron-back" label="Back" onPress={back} /></View> : null}
              {editing ? (
                <View style={{ gap: 10 }}>
                  <TextField label="Name" value={title} onChangeText={setTitle} maxLength={120} />
                  <TextField label="Description (optional)" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 80 }} maxLength={1000} />
                  <SegmentedControl label="Who can see it" options={[{ value: 'private', label: 'Only me' }, { value: 'public', label: 'Public' }]} value={vis} onChange={v => setVis(v as any)} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button size="md" label="Save" onPress={save} loading={saving} />
                    <Button size="md" variant="secondary" label="Cancel" onPress={() => setEditing(false)} />
                  </View>
                  <Pressable onPress={confirmDelete} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={[type.subhead, font(600), { color: c.danger }]}>Delete playlist</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name={pl.visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'} size={14} color={c.ink2} />
                      <Text style={[type.micro, { color: c.ink2, letterSpacing: 0.4 }]}>
                        {pl.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'} PLAYLIST · {items.length} VIDEO{items.length === 1 ? '' : 'S'}
                      </Text>
                    </View>
                    <Text style={[type.title1, { color: c.ink }]}>{pl.title}</Text>
                    {ownerName && !mine ? <Text style={[type.subhead, { color: c.ink2 }]}>By {ownerName}</Text> : null}
                  </View>
                  {pl.description ? <Text style={[type.callout, { color: c.ink2 }]}>{pl.description}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {items[0] ? <Button size="lg" icon="play" label="Play all" onPress={() => openListVideo(items[0], pl.id)} style={{ flexGrow: 1 }} /> : null}
                    {mine ? <Button size="lg" variant="secondary" icon="create-outline" label="Edit" onPress={() => setEditing(true)} /> : null}
                    {pl.visibility === 'public' ? (
                      <Button size="lg" variant="secondary" icon="share-outline" label="Share" onPress={() => shareLink({ url: `${getAppBaseUrl()}/playlist/${pl.id}`, title: pl.title })} />
                    ) : null}
                  </View>
                </>
              )}
            </View>

            <View style={[{ gap: space[4] }, isDesktopWeb && { flex: 1, minWidth: 0 }]}>
              {!items.length ? (
                <View style={{ padding: space[6], borderRadius: radius.lg, backgroundColor: c.bgSunk, gap: 6 }}>
                  <Text style={[type.headline, { color: c.ink }]}>Nothing here yet</Text>
                  <Text style={[type.callout, { color: c.ink2 }]}>On any video, tap “Playlist” and tick this one.</Text>
                </View>
              ) : null}
              {items.map((v, i) => (
                <VideoRow
                  key={v.id}
                  v={v}
                  label={String(i + 1)}
                  onPress={() => openListVideo(v, pl.id)}
                  right={mine ? (
                    <View style={{ flexDirection: isDesktopWeb ? 'row' : 'column' }}>
                      {isDesktopWeb ? (
                        <>
                          <IconButton icon="chevron-up" label="Move up" onPress={() => move(i, -1)} disabled={i === 0} />
                          <IconButton icon="chevron-down" label="Move down" onPress={() => move(i, 1)} disabled={i === items.length - 1} />
                        </>
                      ) : null}
                      <IconButton icon="close" label={`Remove ${v.title}`} onPress={() => removeItem(v)} />
                    </View>
                  ) : undefined}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

export default focusedOnly(PlaylistScreen);
