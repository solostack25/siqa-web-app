import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { Theme } from '../../constants/theme';
import { useTheme, AppColors } from '../../lib/theme';
import { DesktopShell, useIsDesktopWeb, DESKTOP_BREAKPOINT } from '../../components/DesktopShell';
import { uploadFileToBunny } from '../../lib/bunnyUpload';
import { Icon } from '../../components/Icon';
import ImageCropModal from '../../components/ImageCropModal';

async function uploadImageToBunny(uri: string, path: string): Promise<string> {
  return uploadFileToBunny({ uri, fileName: path, mimeType: 'image/jpeg' });
}

const SIDEBAR_WIDTH = 220;

type Speaker = {
  id: string;
  display_name: string;
  denomination: string | null;
  state: string | null;
  topics: string[];
  bio: string | null;
  total_raised: number | null;
  follower_count: number | null;
  events_count: number | null;
  is_available: boolean;
  profile_id: string | null;
  is_verified: boolean;
  avatar_url: string | null;
  banner_url: string | null;
};

type Video = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number | null;
  duration_secs: number | null;
  video_url: string | null;
};

function formatRaised(cents: number | null) {
  if (!cents) return '—';
  const d = cents / 100;
  if (d >= 1000000) return '$' + (d / 1000000).toFixed(1) + 'M';
  if (d >= 1000) return '$' + (d / 1000).toFixed(0) + 'k';
  return '$' + d.toFixed(0);
}

function formatCount(n: number | null) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return n.toString();
}

function formatViews(n: number | null) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return n.toString();
}

function speakerInitial(name: string) {
  return name.replace(/^(Sh\.|Dr\.|Imam|Ustadha|Ustadh)\s+/i, '').charAt(0).toUpperCase();
}

export default function SpeakerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = isDesktopWeb ? windowWidth - SIDEBAR_WIDTH : windowWidth;

  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'avatar' | 'banner' | null>(null);
  // Gems uploaded from the web before the video-thumbnail generation bug
  // was fixed (expo-video-thumbnails is native-only, silently a no-op
  // on web) are stuck with thumbnail_url: null — that fix only applies
  // to new uploads. This is the retroactive per-gem fix.
  const [uploadingThumbFor, setUploadingThumbFor] = useState<string | null>(null);
  const [thumbCropUri, setThumbCropUri] = useState<string | null>(null);
  const [thumbCropGemId, setThumbCropGemId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: true });
    if (id) loadSpeaker(id);
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, [id]);

  async function loadSpeaker(speakerId: string) {
    const { data } = await supabase
      .from('speakers')
      .select(`
        id, display_name, denomination, state, topics,
        bio, total_raised,
        follower_count, events_count, is_available, profile_id,
        is_verified, avatar_url, banner_url
      `)
      .eq('id', speakerId)
      .single();

    if (data) setSpeaker(data);

    const { data: vids } = await supabase
      .from('videos')
      .select('id, title, thumbnail_url, view_count, duration_secs, video_url')
      .eq('speaker_id', speakerId)
      .eq('is_published', true)
      .not('video_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(isDesktopWeb ? 12 : 6);

    if (vids) setVideos(vids);
    setLoading(false);
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      // Was '/(tabs)/discover', a route that no longer exists — Discover
      // was replaced by Marketplace earlier this session. Home is the
      // safer fallback destination when there's nowhere to go back to.
      router.replace('/(tabs)' as any);
    }
  }

  const canEdit = Boolean(userId) && speaker?.profile_id === userId;

  async function requireImagePermission() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow Siqa to access your photos.');
      return false;
    }
    return true;
  }

  async function pickAvatar() {
    if (!(await requireImagePermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (Platform.OS === 'web') {
      setCropTarget('avatar');
      setCropImageUri(asset.uri);
      return;
    }
    await uploadAvatar(asset.uri);
  }

  async function pickBanner() {
    if (!(await requireImagePermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [3, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (Platform.OS === 'web') {
      setCropTarget('banner');
      setCropImageUri(asset.uri);
      return;
    }
    await uploadBanner(asset.uri);
  }

  async function uploadAvatar(uri: string) {
    if (!speaker) return;
    setUploadingAvatar(true);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const path = `speaker-avatars/${speaker.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(uri, path);
      await supabase.from('speakers').update({ avatar_url: url }).eq('id', speaker.id);
      setSpeaker(prev => prev ? { ...prev, avatar_url: url } : prev);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function uploadBanner(uri: string) {
    if (!speaker) return;
    setUploadingBanner(true);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const path = `speaker-banners/${speaker.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(uri, path);
      await supabase.from('speakers').update({ banner_url: url }).eq('id', speaker.id);
      setSpeaker(prev => prev ? { ...prev, banner_url: url } : prev);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingBanner(false);
    }
  }

  function handleCropped(blob: Blob) {
    const target = cropTarget;
    const blobUrl = URL.createObjectURL(blob);
    setCropImageUri(null);
    setCropTarget(null);
    if (target === 'avatar') uploadAvatar(blobUrl);
    else if (target === 'banner') uploadBanner(blobUrl);
  }

  async function pickGemThumbnail(gemId: string) {
    if (!(await requireImagePermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [9, 16], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (Platform.OS === 'web') {
      setThumbCropGemId(gemId);
      setThumbCropUri(asset.uri);
      return;
    }
    await uploadGemThumbnail(gemId, asset.uri);
  }

  async function uploadGemThumbnail(gemId: string, uri: string) {
    setUploadingThumbFor(gemId);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const path = `gem-thumbnails/${gemId}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(uri, path);
      await supabase.from('videos').update({ thumbnail_url: url }).eq('id', gemId);
      setVideos(prev => prev.map(v => (v.id === gemId ? { ...v, thumbnail_url: url } : v)));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingThumbFor(null);
    }
  }

  function handleThumbCropped(blob: Blob) {
    const gemId = thumbCropGemId;
    const blobUrl = URL.createObjectURL(blob);
    setThumbCropUri(null);
    setThumbCropGemId(null);
    if (gemId) uploadGemThumbnail(gemId, blobUrl);
  }

  const styles = makeStyles(C);

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  if (!speaker) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Speaker not found</Text>
        </View>
      </DesktopShell>
    );
  }

  const initial = speakerInitial(speaker.display_name);
  const location = [speaker.denomination, speaker.state].filter(Boolean).join(' · ');

  // Desktop: wider cards, more per row, computed off the actual content
  // width (window minus sidebar) instead of a fixed 2-up mobile grid.
  const GRID_GAP = 12;
  const cols = isDesktopWeb ? Math.max(3, Math.min(6, Math.floor(contentWidth / 200))) : 2;
  const gridPadding = isDesktopWeb ? 32 : 28;
  const clipWidth = (contentWidth - gridPadding - GRID_GAP * (cols - 1)) / cols;

  const statsRow = [
    { val: formatCount(speaker.follower_count), label: 'Followers' },
    { val: formatRaised(speaker.total_raised), label: 'Raised' },
    { val: speaker.events_count?.toString() || '0', label: 'Events/yr' },
    { val: '5.0★', label: 'Rating' },
  ];

  const gemsGrid = videos.length > 0 && (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>GEMS</Text>
          <Text style={styles.sectionLink}>See all →</Text>
        </View>
        <View style={[styles.clipsGrid, { gap: GRID_GAP }]}>
          {videos.map(v => (
            <TouchableOpacity key={v.id} style={[styles.clipCard, { width: clipWidth }]} activeOpacity={0.8}>
              <View style={styles.clipThumb}>
                {v.thumbnail_url ? (
                  <Image
                    source={{ uri: v.thumbnail_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : canEdit ? (
                  <TouchableOpacity
                    style={styles.addThumbBtn}
                    onPress={() => pickGemThumbnail(v.id)}
                    disabled={uploadingThumbFor === v.id}
                  >
                    {uploadingThumbFor === v.id ? (
                      <ActivityIndicator size="small" color={C.text} />
                    ) : (
                      <>
                        <Icon name="image-outline" size={18} color={C.text3} />
                        <Text style={styles.addThumbBtnText}>Add thumbnail</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
                {/* clipPlayOverlay isn't absolutely positioned — it only
                    ever worked as a centered overlay because it was the
                    one normal-flow child sitting on top of the
                    absoluteFill Image behind it. With the new
                    addThumbBtn also a normal-flow child in the no-
                    thumbnail case, showing both would stack them
                    instead of overlapping, and a play button floating
                    over an "add thumbnail" prompt doesn't make sense
                    anyway — only show it when there's actually
                    something to play. */}
                {!(canEdit && !v.thumbnail_url) && (
                  <View style={styles.clipPlayOverlay}>
                    <Text style={styles.clipPlayIcon}>▶</Text>
                  </View>
                )}
              </View>
              <View style={styles.clipInfo}>
                <Text style={styles.clipTitle} numberOfLines={2}>{v.title}</Text>
                <Text style={styles.clipViews}>{formatViews(v.view_count)} views</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.divider} />
    </>
  );

  return (
    <DesktopShell>
      {/* Every other detail page (seed, product, org-profile, cart,
          orders...) wraps its ScrollView in a container with an
          explicit backgroundColor: C.bg — this one went straight from
          DesktopShell to a bare ScrollView with no themed background
          of its own, so it fell back to whatever happened to be
          painted behind it instead of declaring its own, which is why
          everything below the (correctly dark) banner read as plain
          white regardless of theme. */}
      <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
      >
        {isDesktopWeb ? (
          // ---- Desktop channel header: banner, avatar + name + stats in one row ----
          <>
            <TouchableOpacity
              style={styles.coverDesktop}
              activeOpacity={canEdit ? 0.85 : 1}
              onPress={canEdit ? pickBanner : undefined}
            >
              {speaker.banner_url && (
                <Image source={{ uri: speaker.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
              {canEdit && (
                <View style={styles.editBannerBtn}>
                  {uploadingBanner ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="camera-outline" size={14} color="#fff" />
                      <Text style={styles.editBannerText}>Edit Banner</Text>
                    </>
                  )}
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.headerRowDesktop}>
              <TouchableOpacity
                style={[styles.avatar, styles.avatarDesktop]}
                activeOpacity={canEdit ? 0.85 : 1}
                onPress={canEdit ? pickAvatar : undefined}
              >
                {speaker.avatar_url ? (
                  <Image source={{ uri: speaker.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarTextDesktop}>{initial}</Text>
                )}
                {canEdit && (
                  <View style={styles.editAvatarBadge}>
                    {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="camera-outline" size={13} color="#fff" />}
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.headerInfoDesktop}>
                <View style={styles.nameRow}>
                  <Text style={styles.nameDesktop}>{speaker.display_name}</Text>
                  {speaker.is_verified && (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>✓ VERIFIED</Text>
                    </View>
                  )}
                </View>
                {location ? <Text style={styles.handle}>{location}</Text> : null}
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>📡 Fundraising</Text>
                  <Text style={styles.metaText}>📅 {speaker.is_available ? 'Available' : 'Contact'}</Text>
                  <Text style={styles.metaText}>⭐ 5.0</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.followBtn, following && styles.followBtnActive]}
                onPress={() => setFollowing(!following)}
              >
                <Text style={styles.followBtnText}>{following ? 'Following' : 'Follow'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsDesktopRow}>
              {statsRow.map((s, i) => (
                <View key={i} style={styles.statDesktop}>
                  <Text style={styles.statVal}>{s.val}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
              {speaker.bio ? <Text style={styles.bioDesktop} numberOfLines={2}>{speaker.bio}</Text> : null}
            </View>

            {speaker.topics?.length > 0 && (
              <View style={styles.topics}>
                {speaker.topics.map(t => (
                  <View key={t} style={styles.topic}>
                    <Text style={styles.topicText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.divider} />
            {gemsGrid}
          </>
        ) : (
          // ---- Mobile: original stacked layout ----
          <>
            <TouchableOpacity
              style={styles.cover}
              activeOpacity={canEdit ? 0.9 : 1}
              onPress={canEdit ? pickBanner : undefined}
            >
              {speaker.banner_url && (
                <Image source={{ uri: speaker.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
              <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.8}>
                <Text style={styles.backIcon}>←</Text>
              </TouchableOpacity>
              {canEdit && (
                <View style={styles.editBannerBtnMobile}>
                  {uploadingBanner ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Icon name="camera-outline" size={14} color="#fff" />
                  )}
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.profileRow}>
              <TouchableOpacity style={styles.avatar} activeOpacity={canEdit ? 0.85 : 1} onPress={canEdit ? pickAvatar : undefined}>
                {speaker.avatar_url ? (
                  <Image source={{ uri: speaker.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
                {canEdit && (
                  <View style={styles.editAvatarBadge}>
                    {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="camera-outline" size={12} color="#fff" />}
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.profileBtns}>
                <TouchableOpacity
                  style={[styles.followBtn, following && styles.followBtnActive]}
                  onPress={() => setFollowing(!following)}
                >
                  <Text style={styles.followBtnText}>{following ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{speaker.display_name}</Text>
                {speaker.is_verified && (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓ VERIFIED</Text>
                  </View>
                )}
              </View>
              {location ? <Text style={styles.handle}>{location}</Text> : null}
              {speaker.bio ? <Text style={styles.bio}>{speaker.bio}</Text> : null}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>📡 Fundraising</Text>
                <Text style={styles.metaText}>📅 {speaker.is_available ? 'Available' : 'Contact'}</Text>
                <Text style={styles.metaText}>⭐ 5.0</Text>
              </View>
            </View>

            <View style={styles.stats}>
              {statsRow.map((s, i) => (
                <View key={i} style={[styles.stat, i < 3 && styles.statBorder]}>
                  <Text style={styles.statVal}>{s.val}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {speaker.topics?.length > 0 && (
              <View style={styles.topics}>
                {speaker.topics.map(t => (
                  <View key={t} style={styles.topic}>
                    <Text style={styles.topicText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.divider} />
            {gemsGrid}
            <View style={styles.divider} />
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </View>

      {Platform.OS === 'web' && (
        <ImageCropModal
          visible={!!cropImageUri}
          imageUri={cropImageUri}
          aspectRatio={cropTarget === 'banner' ? 3 : 1}
          outputWidth={cropTarget === 'banner' ? 1200 : 600}
          onCancel={() => { setCropImageUri(null); setCropTarget(null); }}
          onCropped={handleCropped}
        />
      )}

      {Platform.OS === 'web' && (
        <ImageCropModal
          visible={!!thumbCropUri}
          imageUri={thumbCropUri}
          aspectRatio={9 / 16}
          outputWidth={720}
          onCancel={() => { setThumbCropUri(null); setThumbCropGemId(null); }}
          onCropped={handleThumbCropped}
        />
      )}
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    errorText: { color: C.text3, fontSize: 14 },
    scroll: { paddingBottom: 20 },

    // Mobile cover/header
    cover: { height: 200, backgroundColor: C.bg3, overflow: 'hidden' },
    backBtn: {
      position: 'absolute', top: 54, left: 14, width: 34, height: 34, borderRadius: 17,
      backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    backIcon: { color: '#fff', fontSize: 18 },
    profileRow: {
      flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
      paddingHorizontal: 16, marginTop: -38, marginBottom: 12, zIndex: 2,
    },
    avatar: {
      width: 78, height: 78, borderRadius: 22, backgroundColor: C.emerald,
      borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { fontSize: 28, color: C.gold, fontWeight: '700' },
    profileBtns: { flexDirection: 'row', gap: 8, paddingBottom: 4 },

    editBannerBtnMobile: {
      position: 'absolute', bottom: 12, right: 12, width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    editAvatarBadge: {
      position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: C.bg,
    },

    // Desktop header
    coverDesktop: { height: 160, backgroundColor: C.bg3, marginHorizontal: 32, marginTop: 24, borderRadius: Theme.radius.xl, overflow: 'hidden' },
    editBannerBtn: {
      position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    },
    editBannerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    headerRowDesktop: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32, marginTop: -32, marginBottom: 16, gap: 20,
    },
    avatarDesktop: { width: 96, height: 96, borderRadius: 24 },
    avatarTextDesktop: { fontSize: 34, color: C.gold, fontWeight: '700' },
    headerInfoDesktop: { flex: 1, gap: 4 },
    nameDesktop: { fontSize: 26, fontWeight: '700', color: C.text },
    statsDesktopRow: {
      flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 32, marginBottom: 16, flexWrap: 'wrap',
    },
    statDesktop: { alignItems: 'flex-start' },
    bioDesktop: { flex: 1, minWidth: 240, fontSize: 13, color: C.text2, lineHeight: 20 },

    followBtn: {
      paddingHorizontal: 18, paddingVertical: 8, borderRadius: 100, borderWidth: 0.5, borderColor: C.goldDim,
    },
    followBtnActive: { backgroundColor: C.goldBg },
    followBtnText: { color: C.gold, fontSize: 13, fontWeight: '600' },

    info: { paddingHorizontal: 16, paddingBottom: 14 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 },
    name: { fontSize: 21, fontWeight: '700', color: C.text },
    verifiedBadge: { backgroundColor: C.gold, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
    verifiedText: { color: '#000', fontSize: 9, fontWeight: '800' },
    handle: { fontSize: 12, color: C.text3, marginBottom: 8 },
    bio: { fontSize: 13, color: C.text2, lineHeight: 20, marginBottom: 10 },
    metaRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
    metaText: { fontSize: 12, color: C.text3 },

    stats: {
      flexDirection: 'row', marginHorizontal: 14, marginBottom: 14, backgroundColor: C.surface,
      borderWidth: 0.5, borderColor: C.border2, borderRadius: Theme.radius.lg, overflow: 'hidden',
    },
    stat: { flex: 1, paddingVertical: 11, paddingHorizontal: 4, alignItems: 'center' },
    statBorder: { borderRightWidth: 0.5, borderRightColor: C.border2 },
    statVal: { fontSize: 16, fontWeight: '700', color: C.gold },
    statLabel: { fontSize: 8, color: C.text3, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },

    topics: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 14 },
    topic: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, backgroundColor: C.emeraldBg,
      borderWidth: 0.5, borderColor: 'rgba(61,190,138,0.15)',
    },
    topicText: { fontSize: 11, color: C.emeraldLight, fontWeight: '500' },
    divider: { height: 0.5, backgroundColor: C.border2, marginHorizontal: 14, marginBottom: 16 },

    section: { paddingHorizontal: 14, marginBottom: 16 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sectionTitle: { fontSize: 10, fontWeight: '700', color: C.text3, letterSpacing: 1.8, textTransform: 'uppercase' },
    sectionLink: { fontSize: 12, color: C.gold },

    clipsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    clipCard: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, overflow: 'hidden' },
    clipThumb: {
      aspectRatio: 9 / 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    addThumbBtn: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
    addThumbBtnText: { fontSize: 10, color: C.text3, fontWeight: '600', textAlign: 'center' },
    clipPlayOverlay: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(201,168,76,0.9)',
      alignItems: 'center', justifyContent: 'center',
    },
    clipPlayIcon: { color: '#000', fontSize: 14, marginLeft: 2 },
    clipInfo: { padding: 10 },
    clipTitle: { fontSize: 11, fontWeight: '500', color: C.text, lineHeight: 15, marginBottom: 3 },
    clipViews: { fontSize: 10, color: C.text3 },
  });
}
