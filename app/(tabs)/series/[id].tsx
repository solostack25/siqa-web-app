import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../../../components/DesktopShell';
import { focusedOnly } from '../../../components/FocusedOnly';
import { Icon } from '../../../components/Icon';
import { Avatar } from '../../../components/SeedSocial';
import { Button, IconButton, TextField } from '../../../components/ui';
import { LIST_VIDEO_SELECT, VideoRow, openListVideo, type ListVideo } from '../../../components/VideoRow';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { HEADER_TOP_PADDING } from '../../../constants/theme';
import { showToast } from '../../../components/Toast';

type Series = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  speaker_id: string | null;
  org_id: string | null;
  speakers: { id: string; display_name: string; avatar_url: string | null } | null;
  organizations: { id: string; org_name: string; logo_url: string | null } | null;
};

function SeriesScreen() {
  const { c, shadow } = useDS();
  const isDesktopWeb = useIsDesktopWeb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<ListVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: s }, { data: eps }] = await Promise.all([
      supabase
        .from('series')
        .select('id,title,description,cover_url,speaker_id,org_id,speakers(id,display_name,avatar_url),organizations(id,org_name,logo_url)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('videos')
        .select(LIST_VIDEO_SELECT)
        .eq('series_id', id)
        .eq('is_published', true)
        .lte('published_at', new Date().toISOString())
        .order('episode_number', { ascending: true, nullsFirst: false })
        .order('published_at', { ascending: true }),
    ]);
    setSeries(s as any);
    setEpisodes((eps as any as ListVideo[]) ?? []);
    if (s) {
      const { data: ok } = await supabase.rpc('can_manage_series', { p_speaker_id: (s as any).speaker_id, p_org_id: (s as any).org_id });
      setCanEdit(Boolean(ok));
      setTitle((s as any).title);
      setDesc((s as any).description ?? '');
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    if (!series || !title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('series').update({ title: title.trim(), description: desc.trim() || null }).eq('id', series.id);
    setSaving(false);
    if (error) { showToast(error.message); return; }
    setEditing(false);
    load();
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/gems' as any);
  }

  if (loading && !series) {
    return <DesktopShell><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.ink2} /></View></DesktopShell>;
  }
  if (!series) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.bg }}>
          <Text style={[type.callout, { color: c.ink2 }]}>This series isn't available.</Text>
          <Button size="md" variant="secondary" label="Go back" onPress={back} />
        </View>
      </DesktopShell>
    );
  }

  const owner = series.organizations
    ? { name: series.organizations.org_name, avatar: series.organizations.logo_url, go: () => router.push({ pathname: '/org-profile', params: { id: series.organizations!.id } } as any) }
    : series.speakers
    ? { name: series.speakers.display_name, avatar: series.speakers.avatar_url, go: () => router.push(`/speaker/${series.speakers!.id}` as any) }
    : null;
  const cover = series.cover_url || (episodes[0]?.thumbnail_url ?? null);
  const first = episodes[0];

  const header = (
    <View style={[{ gap: space[4] }, isDesktopWeb && { width: 380, flexShrink: 0 }]}>
      <View style={{ aspectRatio: 16 / 9, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.stage, alignItems: 'center', justifyContent: 'center' }}>
        {cover ? <Image source={{ uri: cover }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="albums-outline" size={40} color={c.brandGold} />}
      </View>
      {editing ? (
        <View style={{ gap: 10 }}>
          <TextField label="Series name" value={title} onChangeText={setTitle} maxLength={120} />
          <TextField label="Description" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 110 }} help="New episodes start with this description." />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="md" label="Save" onPress={save} loading={saving} />
            <Button size="md" variant="secondary" label="Cancel" onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : (
        <>
          <View style={{ gap: 4 }}>
            <Text style={[type.micro, { color: c.goldInk, letterSpacing: 0.4 }]}>SERIES · {episodes.length} EPISODE{episodes.length === 1 ? '' : 'S'}</Text>
            <Text style={[type.title1, { color: c.ink }]}>{series.title}</Text>
          </View>
          {owner ? (
            <Pressable onPress={owner.go} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <Avatar name={owner.name} url={owner.avatar} size={32} tone="neutral" square={!!series.organizations} />
              <Text style={[type.callout, font(600), { color: c.ink }]}>{owner.name}</Text>
            </Pressable>
          ) : null}
          {series.description ? (
            <Pressable onPress={() => setDescOpen(o => !o)} accessibilityRole="button">
              <Text style={[type.callout, { color: c.ink2 }]} numberOfLines={descOpen ? undefined : 4}>{series.description}</Text>
              {series.description.length > 180 ? <Text style={[type.subhead, font(700), { color: c.ink, marginTop: 4 }]}>{descOpen ? 'Show less' : 'Show more'}</Text> : null}
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {first ? <Button size="lg" icon="play" label="Play from episode 1" onPress={() => openListVideo(first)} style={{ flexGrow: 1 }} /> : null}
            {canEdit ? <Button size="lg" variant="secondary" icon="create-outline" label="Edit" onPress={() => setEditing(true)} /> : null}
          </View>
        </>
      )}
    </View>
  );

  const list = (
    <View style={[{ gap: space[4] }, isDesktopWeb && { flex: 1, minWidth: 0 }]}>
      {episodes.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>No episodes yet.</Text> : null}
      {episodes.map((v, i) => (
        <VideoRow key={v.id} v={v} label={`Episode ${v.episode_number ?? i + 1}`} />
      ))}
    </View>
  );

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {!isDesktopWeb ? (
          <View style={{ paddingTop: HEADER_TOP_PADDING - 8, paddingHorizontal: space[3], flexDirection: 'row' }}>
            <IconButton icon="chevron-back" label="Back" onPress={back} />
          </View>
        ) : null}
        <ScrollView contentContainerStyle={{ padding: isDesktopWeb ? space[10] : space[5], paddingBottom: 60 }}>
          <View style={[{ gap: space[8], width: '100%', maxWidth: 1200, alignSelf: 'center' }, isDesktopWeb && { flexDirection: 'row', alignItems: 'flex-start' }]}>
            {header}
            {list}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

export default focusedOnly(SeriesScreen);
