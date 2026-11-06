/**
 * Nonprofit profile videos.
 *
 * Reads/writes public.org_videos — a table that exists ONLY for org profile
 * pages. Gems, home, browse and watch all read public.videos, so nothing here
 * can show up in the main content feed. Don't move these into public.videos.
 *
 * Each video can optionally be attached to one of the org's Seeds; the player
 * then shows a "Support this Seed" button.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, TextInput, ScrollView,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { brandStyles, font } from '../lib/ds';
import { uploadVideoToBunny, uploadThumbnailToBunny } from '../lib/bunnyUpload';
import { Card, CardTitle, PrimaryButton } from './SeedSocial';
import { Button } from './ui';
import { Icon } from './Icon';
import { showToast } from './Toast';
import { YouTubeEmbed } from './YouTubeEmbed';
import { SeedVideo } from './SeedVideo';

export type OrgVideo = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  platform: 'bunny' | 'youtube';
  video_url: string | null;
  platform_video_id: string | null;
  thumbnail_url: string | null;
  fundraiser_id: string | null;
  is_published: boolean;
  view_count: number;
  created_at: string;
};

type SeedLite = { id: string; title: string; status: string };

const LIVE_SEED = ['active', 'published', 'approved', 'live'];

/** Accepts youtu.be/ID, watch?v=ID, /shorts/ID, /embed/ID, /live/ID or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtube\.com\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function thumbFor(v: OrgVideo) {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.platform === 'youtube' && v.platform_video_id) return `https://i.ytimg.com/vi/${v.platform_video_id}/hqdefault.jpg`;
  return null;
}

function confirm(title: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onYes },
  ]);
}

// ── Main block ───────────────────────────────────────────────────────────

export function OrgVideos({
  orgId, canEdit, limit, onSeeAll, onCount,
}: {
  orgId: string;
  canEdit: boolean;
  /** Overview shows a few; the Videos tab shows all. */
  limit?: number;
  onSeeAll?: () => void;
  onCount?: (n: number) => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [videos, setVideos] = useState<OrgVideo[]>([]);
  const [seeds, setSeeds] = useState<SeedLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<OrgVideo | null>(null);
  const [editing, setEditing] = useState<OrgVideo | 'new' | null>(null);

  const load = useCallback(async () => {
    const [vRes, sRes] = await Promise.all([
      supabase.from('org_videos').select('*').eq('org_id', orgId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('fundraisers').select('id,title,status').eq('org_id', orgId).order('created_at', { ascending: false }),
    ]);
    const list = ((vRes.data as OrgVideo[]) || []).filter(v => canEdit || v.is_published);
    setVideos(list);
    setSeeds((sRes.data as SeedLite[]) || []);
    onCount?.(list.filter(v => v.is_published).length);
    setLoading(false);
  }, [orgId, canEdit]);

  useEffect(() => { load(); }, [load]);

  const seedById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const shown = limit ? videos.slice(0, limit) : videos;

  // Owners with no videos see the empty state + Add; visitors see nothing on Overview.
  if (!loading && !videos.length && !canEdit && limit) return null;

  function open(v: OrgVideo) {
    setPlaying(v);
    supabase.rpc('org_video_viewed', { p_id: v.id }).then(() => {});
  }

  return (
    <Card>
      <CardTitle
        icon="play-circle-outline"
        right={
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {limit && videos.length > limit && onSeeAll ? (
              <TouchableOpacity onPress={onSeeAll} style={styles.textBtn}><Text style={styles.link}>See all</Text></TouchableOpacity>
            ) : null}
            {canEdit ? (
              <TouchableOpacity onPress={() => setEditing('new')} style={styles.textBtn}><Text style={styles.link}>Add video</Text></TouchableOpacity>
            ) : null}
          </View>
        }
      >
        Videos
      </CardTitle>
      {canEdit ? (
        <Text style={styles.muted}>Videos here appear only on this page, not in Gems or the main feed.</Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={C.gold} />
      ) : videos.length === 0 ? (
        <Text style={styles.muted}>
          {canEdit ? 'Add your first video. Paste a YouTube link or upload a file.' : 'No videos yet.'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {shown.map(v => {
            const seed = v.fundraiser_id ? seedById[v.fundraiser_id] : null;
            const thumb = thumbFor(v);
            return (
              <View key={v.id} style={styles.card}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => open(v)} accessibilityRole="button" accessibilityLabel={`Play ${v.title}`}>
                  <View style={styles.thumb}>
                    {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    <View style={styles.playBadge}><Icon name="play" size={20} color="#fff" /></View>
                    {!v.is_published ? <Text style={styles.draftPill}>Hidden</Text> : null}
                  </View>
                  <View style={{ padding: 12, gap: 6 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{v.title}</Text>
                    {seed ? (
                      <View style={styles.seedPill}>
                        <Icon name="leaf-outline" size={12} color={C.emerald} />
                        <Text style={styles.seedPillText} numberOfLines={1}>{seed.title}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {canEdit ? (
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => setEditing(v)} style={styles.textBtn}><Text style={styles.link}>Edit</Text></TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirm('Remove this video?', async () => {
                        const { error } = await supabase.from('org_videos').delete().eq('id', v.id);
                        if (error) showToast(error.message); else load();
                      })}
                      style={styles.textBtn}
                    >
                      <Text style={styles.danger}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <PlayerModal
        video={playing}
        seed={playing?.fundraiser_id ? seedById[playing.fundraiser_id] : null}
        onClose={() => setPlaying(null)}
      />
      {canEdit && editing ? (
        <EditorModal
          orgId={orgId}
          video={editing === 'new' ? null : editing}
          seeds={seeds}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      ) : null}
    </Card>
  );
}

// ── Player ───────────────────────────────────────────────────────────────

function PlayerModal({ video, seed, onClose }: { video: OrgVideo | null; seed: SeedLite | null; onClose: () => void }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const seedLive = seed && LIVE_SEED.includes(seed.status);
  return (
    <Modal visible={!!video} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.playerSheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={2}>{video?.title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Icon name="close" size={22} color={C.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.playerBox}>
            {video?.platform === 'youtube' && video.platform_video_id ? (
              <YouTubeEmbed videoId={video.platform_video_id} autoplay />
            ) : video?.video_url ? (
              <SeedVideo uri={video.video_url} poster={video.thumbnail_url} fit="contain" />
            ) : null}
          </View>
          <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: 12 }}>
            {video?.description ? <Text style={styles.body}>{video.description}</Text> : null}
          </ScrollView>
          {seed && seedLive ? (
            <Button
              variant="gold"
              icon="leaf-outline"
              label="Support this Seed"
              onPress={() => { onClose(); router.push({ pathname: '/seed/[id]', params: { id: seed.id } } as any); }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ── Add / edit ───────────────────────────────────────────────────────────

type Picked = { uri: string; fileName: string; mimeType: string };

function EditorModal({ orgId, video, seeds, onClose, onSaved }: {
  orgId: string; video: OrgVideo | null; seeds: SeedLite[]; onClose: () => void; onSaved: () => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isNew = !video;

  const [source, setSource] = useState<'youtube' | 'bunny'>(video?.platform ?? 'youtube');
  const [ytLink, setYtLink] = useState(video?.platform_video_id ? `https://youtu.be/${video.platform_video_id}` : '');
  const [file, setFile] = useState<Picked | null>(null);
  const [thumb, setThumb] = useState<Picked | null>(null);
  const [title, setTitle] = useState(video?.title ?? '');
  const [description, setDescription] = useState(video?.description ?? '');
  const [seedId, setSeedId] = useState<string | null>(video?.fundraiser_id ?? null);
  const [published, setPublished] = useState(video?.is_published ?? true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const ytId = source === 'youtube' ? parseYouTubeId(ytLink) : null;
  const hasSource = source === 'youtube' ? !!ytId : !!(file || video?.video_url);
  const canSave = !!title.trim() && hasSource && !saving;

  async function pickVideo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your videos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setFile({ uri: a.uri, fileName: a.fileName || 'video.mp4', mimeType: a.mimeType || 'video/mp4' });
  }

  async function pickThumb() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your photos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setThumb({ uri: a.uri, fileName: a.fileName || 'thumb.jpg', mimeType: a.mimeType || 'image/jpeg' });
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const stamp = Date.now();
      let videoUrl = source === 'bunny' ? video?.video_url ?? null : null;
      let thumbUrl = video?.thumbnail_url ?? null;

      if (source === 'bunny' && file) {
        const ext = file.fileName.split('.').pop() || 'mp4';
        videoUrl = await uploadVideoToBunny({
          uri: file.uri, mimeType: file.mimeType,
          fileName: `org-videos/${orgId}/${stamp}.${ext}`,
          onProgress: p => setProgress(`${p.label} ${p.pct}%`),
        });
      }
      if (thumb) {
        const ext = thumb.fileName.split('.').pop() || 'jpg';
        thumbUrl = await uploadThumbnailToBunny({
          uri: thumb.uri, mimeType: thumb.mimeType,
          fileName: `org-videos/${orgId}/thumbs/${stamp}.${ext}`,
        });
      }
      // Switching an existing video to YouTube drops the old custom thumbnail
      // unless a new one was picked; YouTube's own is used instead.
      if (source === 'youtube' && !thumb && video?.platform !== 'youtube') thumbUrl = null;

      const row = {
        org_id: orgId,
        title: title.trim(),
        description: description.trim() || null,
        platform: source,
        video_url: source === 'bunny' ? videoUrl : null,
        platform_video_id: source === 'youtube' ? ytId : null,
        thumbnail_url: thumbUrl,
        fundraiser_id: seedId,
        is_published: published,
      };
      const res = isNew
        ? await supabase.from('org_videos').insert(row)
        : await supabase.from('org_videos').update(row).eq('id', video!.id);
      if (res.error) throw res.error;
      showToast(isNew ? 'Video added' : 'Video updated');
      onSaved();
    } catch (e: any) {
      showToast(e?.message || 'Could not save video');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlayBottom} activeOpacity={1} onPress={saving ? undefined : onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.editSheet}>
          <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>{isNew ? 'Add a video' : 'Edit video'}</Text>
            <Text style={styles.muted}>This video shows only on your organization's page. It won't appear in Gems.</Text>

            <Text style={styles.label}>Source</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['youtube', 'bunny'] as const).map(s => (
                <TouchableOpacity key={s} style={[styles.segment, source === s && styles.segmentOn]} onPress={() => setSource(s)}>
                  <Text style={[styles.segmentText, source === s && styles.segmentTextOn]}>{s === 'youtube' ? 'YouTube link' : 'Upload file'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {source === 'youtube' ? (
              <>
                <TextInput
                  style={styles.input} value={ytLink} onChangeText={setYtLink}
                  placeholder="https://www.youtube.com/watch?v=…" placeholderTextColor={C.text3}
                  autoCapitalize="none" keyboardType="url"
                />
                {ytLink.trim() && !ytId ? <Text style={styles.danger}>That doesn't look like a YouTube video link.</Text> : null}
                {ytId ? (
                  <Image source={{ uri: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` }} style={styles.preview} resizeMode="cover" />
                ) : null}
              </>
            ) : (
              <TouchableOpacity style={styles.pickBox} onPress={pickVideo}>
                <Icon name="cloud-upload-outline" size={20} color={C.text2} />
                <Text style={styles.muted} numberOfLines={1}>
                  {file ? file.fileName : video?.video_url ? 'Current video kept. Tap to replace.' : 'Choose a video file'}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={140} placeholder="e.g. Our winter food drive" placeholderTextColor={C.text3} />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription}
              maxLength={2000} multiline placeholder="What's this video about?" placeholderTextColor={C.text3}
            />

            <Text style={styles.label}>Thumbnail (optional)</Text>
            <TouchableOpacity style={styles.pickBox} onPress={pickThumb}>
              <Icon name="image-outline" size={20} color={C.text2} />
              <Text style={styles.muted} numberOfLines={1}>
                {thumb ? thumb.fileName : source === 'youtube' ? "Uses YouTube's thumbnail unless you pick one" : video?.thumbnail_url ? 'Current thumbnail kept. Tap to replace.' : 'Choose an image'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Attach to a Seed (optional)</Text>
            <Text style={styles.muted}>Viewers get a "Support this Seed" button under the video.</Text>
            <View style={styles.chips}>
              <TouchableOpacity style={[styles.chip, !seedId && styles.chipOn]} onPress={() => setSeedId(null)}>
                <Text style={[styles.chipText, !seedId && styles.chipTextOn]}>No Seed</Text>
              </TouchableOpacity>
              {seeds.map(s => (
                <TouchableOpacity key={s.id} style={[styles.chip, seedId === s.id && styles.chipOn]} onPress={() => setSeedId(s.id)}>
                  <Text style={[styles.chipText, seedId === s.id && styles.chipTextOn]} numberOfLines={1}>
                    {s.title}{LIVE_SEED.includes(s.status) ? '' : ` (${s.status})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Visibility</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[true, false].map(p => (
                <TouchableOpacity key={String(p)} style={[styles.segment, published === p && styles.segmentOn]} onPress={() => setPublished(p)}>
                  <Text style={[styles.segmentText, published === p && styles.segmentTextOn]}>{p ? 'Show on profile' : 'Hidden'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {progress ? <Text style={styles.muted}>{progress}</Text> : null}
            <PrimaryButton label={isNew ? 'Add video' : 'Save changes'} onPress={save} busy={saving} disabled={!canSave} style={{ marginTop: 8 }} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    card: { flexGrow: 1, flexBasis: 240, maxWidth: 420, borderRadius: 12, borderWidth: 1, borderColor: C.border2, overflow: 'hidden', backgroundColor: C.bg },
    thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    playBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
    draftPill: { position: 'absolute', top: 8, left: 8, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 11, ...font(700), paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    seedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: C.emeraldBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    seedPillText: { color: C.emerald, fontSize: 12, ...font(600), flexShrink: 1 },
    cardActions: { flexDirection: 'row', gap: 16, paddingHorizontal: 12, paddingBottom: 8 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center' },
    playerSheet: { width: '100%', maxWidth: 900, backgroundColor: C.surface, borderRadius: 18, padding: 16, gap: 12 },
    playerBox: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    editSheet: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    sheetTitle: { flex: 1, color: C.text, fontSize: 19, ...font(800) },

    preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: C.surface2 },
    pickBox: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { maxWidth: '100%', minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    chipOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    chipText: { color: C.text2, fontSize: 13, ...font(600) },
    chipTextOn: { color: C.emerald },
    segment: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    segmentOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    segmentText: { color: C.text2, ...font(600), fontSize: 14 },
    segmentTextOn: { color: C.emerald },

    body: { color: C.text, fontSize: 15, lineHeight: 23 },
    muted: { color: C.text2, fontSize: 14, lineHeight: 20, flexShrink: 1 },
    link: { color: C.emerald, fontSize: 14, ...font(700) },
    danger: { color: C.danger, fontSize: 13, ...font(600) },
    textBtn: { minHeight: 36, justifyContent: 'center' },
    rowTitle: { color: C.text, fontSize: 15, ...font(700) },
    label: { color: C.text, fontSize: 14, ...font(700), marginTop: 8 },
    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15 },
  }));
}
