import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { font, type, useDS } from '../lib/ds';
import { BottomSheet, Button, OptionRow, TextField, SegmentedControl } from './ui';
import { showToast } from './Toast';

// "Save to playlist": tick the playlists this video should be in, or make a
// new one. Changes save as you tap.

type MyPlaylist = { id: string; title: string; visibility: 'private' | 'public'; has: boolean };

export function PlaylistSheet({ videoId, visible, onClose }: { videoId: string; visible: boolean; onClose: () => void }) {
  const { c } = useDS();
  const [uid, setUid] = useState<string | null>(null);
  const [lists, setLists] = useState<MyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newVis, setNewVis] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!live) return;
      if (!user) { setUid(null); setLoading(false); return; }
      setUid(user.id);
      const [{ data: pl }, { data: items }] = await Promise.all([
        supabase.from('playlists').select('id,title,visibility').eq('profile_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('playlist_items').select('playlist_id').eq('video_id', videoId),
      ]);
      if (!live) return;
      const inSet = new Set(((items as any[]) ?? []).map(i => i.playlist_id));
      setLists(((pl as any[]) ?? []).map(p => ({ ...p, has: inSet.has(p.id) })));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [visible, videoId]);

  async function toggle(p: MyPlaylist) {
    setLists(prev => prev.map(x => x.id === p.id ? { ...x, has: !x.has } : x));
    const res = p.has
      ? await supabase.from('playlist_items').delete().eq('playlist_id', p.id).eq('video_id', videoId)
      : await supabase.from('playlist_items').insert({ playlist_id: p.id, video_id: videoId, position: Date.now() % 2147483647 });
    if (res.error) {
      setLists(prev => prev.map(x => x.id === p.id ? { ...x, has: p.has } : x));
      showToast("Couldn't update the playlist");
    } else {
      showToast(p.has ? `Removed from ${p.title}` : `Saved to ${p.title}`);
    }
  }

  async function create() {
    const title = newTitle.trim();
    if (!title || !uid) return;
    setBusy(true);
    const { data, error } = await supabase.from('playlists').insert({ profile_id: uid, title, visibility: newVis }).select('id,title,visibility').single();
    if (!error && data) {
      await supabase.from('playlist_items').insert({ playlist_id: (data as any).id, video_id: videoId, position: 0 });
      setLists(prev => [{ ...(data as any), has: true }, ...prev]);
      showToast(`Saved to ${title}`);
      setNewTitle(''); setCreating(false);
    } else {
      showToast(error?.message || "Couldn't create the playlist");
    }
    setBusy(false);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Save to playlist"
      footer={uid && !creating ? <Button variant="secondary" icon="add" label="New playlist" onPress={() => setCreating(true)} /> : undefined}
    >
      {loading ? <ActivityIndicator color={c.ink2} style={{ padding: 20 }} /> : null}
      {!loading && !uid ? (
        <View style={{ gap: 12, paddingVertical: 12 }}>
          <Text style={[type.callout, { color: c.ink2 }]}>Sign in to make playlists.</Text>
          <Button label="Sign in" onPress={() => { onClose(); router.push('/(auth)/login' as any); }} />
        </View>
      ) : null}
      {!loading && uid && !lists.length && !creating ? (
        <Text style={[type.callout, { color: c.ink2, paddingVertical: 12 }]}>You don't have any playlists yet.</Text>
      ) : null}
      {!loading && lists.map((p, i) => (
        <OptionRow
          key={p.id}
          multi
          label={p.title}
          sub={p.visibility === 'public' ? 'Public' : 'Private'}
          icon={p.visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'}
          selected={p.has}
          onPress={() => toggle(p)}
          last={i === lists.length - 1}
        />
      ))}
      {creating ? (
        <View style={{ gap: 12, paddingTop: 12 }}>
          <TextField label="Playlist name" placeholder="e.g. Ramadan reminders" value={newTitle} onChangeText={setNewTitle} maxLength={120} autoFocus />
          <SegmentedControl
            label="Who can see it"
            options={[{ value: 'private', label: 'Only me' }, { value: 'public', label: 'Public' }]}
            value={newVis}
            onChange={v => setNewVis(v as 'private' | 'public')}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="md" label="Create and save" onPress={create} loading={busy} disabled={!newTitle.trim()} />
            <Pressable onPress={() => setCreating(false)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }} accessibilityRole="button">
              <Text style={[type.subhead, font(600), { color: c.ink }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
