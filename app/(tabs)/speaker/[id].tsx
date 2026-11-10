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
  Linking,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { Theme } from '../../../constants/theme';
import { useTheme, AppColors } from '../../../lib/theme';
import { DesktopShell, useIsDesktopWeb } from '../../../components/DesktopShell';
import { uploadFileToBunny } from '../../../lib/bunnyUpload';
import { Icon } from '../../../components/Icon';
import { shareSpeaker } from '../../../lib/share';
import { useBlocked, blockUser, unblockUser } from '../../../lib/blocks';
import ImageCropModal from '../../../components/ImageCropModal';
import { ClaimNotice, UnclaimedBadge } from '../../../components/ClaimNotice';
import { brandStyles, font, buttonStyles, dsStatic } from '../../../lib/ds';
import { Button, BottomSheet, Chip, TextField } from '../../../components/ui';
import { focusedOnly } from '../../../components/FocusedOnly';
import { SeriesGrid, useSeriesFor } from '../../../components/SeriesGrid';
import { ReportButton } from '../../../components/ReportButton';

async function uploadImageToBunny(uri: string, path: string): Promise<string> {
  return uploadFileToBunny({ uri, fileName: path, mimeType: 'image/jpeg' });
}

const SIDEBAR_WIDTH = 220;
const MAX_CONTENT = 1240;

type Speaker = {
  id: string;
  display_name: string;
  state: string | null;
  country: string | null;
  topics: string[] | null;
  languages: string[] | null;
  bio: string | null;
  total_raised: number | null;
  follower_count: number | null;
  events_count: number | null;
  profile_id: string | null;
  is_verified: boolean;
  is_claimed: boolean;
  avatar_url: string | null;
  banner_url: string | null;
  website: string | null;
  youtube_url: string | null;
  instagram_url: string | null;
};

type Video = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  duration_secs: number | null;
  format: string | null;
  published_at: string | null;
  org_id?: string | null;
};

type Tab = 'videos' | 'gems' | 'series' | 'about';

// Content orgs this speaker teaches with (speaker_affiliations).
type Affil = {
  id: string;
  status: 'pending' | 'confirmed' | 'declined' | 'ended';
  title: string | null;
  organizations: { id: string; org_name: string; logo_url: string | null; org_kind: string | null } | null;
};
type Sort = 'latest' | 'popular' | 'oldest';

function formatRaised(cents: number | null) {
  if (!cents) return '$0';
  const d = cents / 100;
  if (d >= 1000000) return '$' + (d / 1000000).toFixed(1) + 'M';
  if (d >= 1000) return '$' + (d / 1000).toFixed(0) + 'k';
  return '$' + d.toFixed(0);
}

function formatCount(n: number | null | undefined) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function formatDuration(secs: number | null) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function timeAgo(ts: string | null) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const y = Math.round(days / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

function speakerInitial(name: string) {
  return name.replace(/^(Sh\.|Dr\.|Imam|Ustadha|Ustadh|Shaykh|Sheikh)\s+/i, '').charAt(0).toUpperCase();
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function SpeakerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const availableWidth = isDesktopWeb ? windowWidth - SIDEBAR_WIDTH : windowWidth;
  const contentWidth = Math.min(availableWidth, MAX_CONTENT);

  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ bio: '', languages: '', website: '', youtube_url: '', instagram_url: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('videos');
  const [affils, setAffils] = useState<Affil[]>([]);
  // 'all' | 'own' | an org id — whose videos to show.
  const [source, setSource] = useState<string>('all');
  const [affilBusy, setAffilBusy] = useState<string | null>(null);
  const speakerSeries = useSeriesFor({ speakerId: id });
  const [sort, setSort] = useState<Sort>('latest');
  const [showCount, setShowCount] = useState(12);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'avatar' | 'banner' | null>(null);
  // Gems uploaded from the web before the thumbnail-generation fix
  // (expo-video-thumbnails is native-only) have thumbnail_url: null.
  // The owner can add one after the fact from the Gems tab.
  const [uploadingThumbFor, setUploadingThumbFor] = useState<string | null>(null);
  const [thumbCropUri, setThumbCropUri] = useState<string | null>(null);
  const [thumbCropGemId, setThumbCropGemId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: true });
    if (id) loadSpeaker(id);
  }, [id]);

  async function loadSpeaker(speakerId: string) {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    setUserId(uid);

    const { data } = await supabase
      .from('speakers')
      .select(`
        id, display_name, state, country, topics, languages,
        bio, total_raised, follower_count, events_count,
        profile_id, is_verified, is_claimed, avatar_url, banner_url,
        website, youtube_url, instagram_url
      `)
      .eq('id', speakerId)
      .maybeSingle();

    if (data) {
      setSpeaker(data as Speaker);
      if (uid && data.profile_id && uid !== data.profile_id) {
        const { data: existing } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', uid)
          .eq('following_id', data.profile_id)
          .maybeSingle();
        setFollowing(Boolean(existing));
      }
    }

    const { data: vids } = await supabase
      .from('videos')
      .select('id, title, thumbnail_url, view_count, like_count, duration_secs, format, published_at, org_id')
      .eq('speaker_id', speakerId)
      .eq('is_published', true)
      .lte('published_at', new Date().toISOString())
      .not('video_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(500);

    const list = (vids as Video[]) ?? [];
    setVideos(list);
    setSource('all');
    const { data: aff } = await supabase
      .from('speaker_affiliations')
      .select('id, status, title, organizations(id, org_name, logo_url, org_kind)')
      .eq('speaker_id', speakerId)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: true });
    setAffils(((aff as any) as Affil[]) ?? []);
    // Land on whichever tab actually has content.
    if (!list.some(v => v.format === 'long') && list.some(v => v.format === 'short')) setTab('gems');
    setLoading(false);
  }

  // Profiles Siqa curated from public lectures aren't run by the speaker
  // until they claim them. Treat a missing column as claimed.
  const unclaimed = speaker ? speaker.is_claimed === false : false;
  const blockedSet = useBlocked();
  const isOwner = Boolean(userId) && speaker?.profile_id === userId && !unclaimed;

  async function toggleFollow() {
    if (!speaker?.profile_id || followBusy) return;
    if (!userId) {
      router.push('/(auth)/sign-in' as any);
      return;
    }
    setFollowBusy(true);
    const next = !following;
    // Optimistic; follower_count itself is maintained by a trigger on follows.
    setFollowing(next);
    setSpeaker(prev => prev ? { ...prev, follower_count: Math.max(0, (prev.follower_count ?? 0) + (next ? 1 : -1)) } : prev);
    const { error } = next
      ? await supabase.from('follows').insert({ follower_id: userId, following_id: speaker.profile_id })
      : await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', speaker.profile_id);
    if (error) {
      setFollowing(!next);
      setSpeaker(prev => prev ? { ...prev, follower_count: Math.max(0, (prev.follower_count ?? 0) + (next ? -1 : 1)) } : prev);
      Alert.alert('Something went wrong', 'Could not update your follow. Please try again.');
    }
    setFollowBusy(false);
  }

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
  }

  function openVideo(v: Video) {
    if (v.format === 'short') {
      router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any);
    } else {
      router.push(`/watch/${v.id}` as any);
    }
  }

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

  const confirmedAffils = affils.filter(a => a.status === 'confirmed' && a.organizations);
  const pendingAffils = affils.filter(a => a.status === 'pending' && a.organizations);
  // Own channel vs. videos an organization owns (videos.org_id).
  const orgNameById = useMemo(() => {
    const m = new Map<string, string>();
    affils.forEach(a => { if (a.organizations) m.set(a.organizations.id, a.organizations.org_name); });
    return m;
  }, [affils]);
  const sourceOptions = useMemo(() => {
    const orgIds = [...new Set(videos.map(v => v.org_id).filter(Boolean) as string[])];
    if (!orgIds.length) return [];
    return [
      { key: 'all', label: 'All' },
      { key: 'own', label: 'Own channel' },
      ...orgIds.map(id => ({ key: id, label: `With ${orgNameById.get(id) ?? 'organization'}` })),
    ];
  }, [videos, orgNameById]);
  const sourceVideos = useMemo(() => (
    source === 'all' ? videos
      : source === 'own' ? videos.filter(v => !v.org_id)
      : videos.filter(v => v.org_id === source)
  ), [videos, source]);
  const longVideos = useMemo(() => sourceVideos.filter(v => v.format !== 'short'), [sourceVideos]);
  const shortVideos = useMemo(() => sourceVideos.filter(v => v.format === 'short'), [sourceVideos]);

  async function respondAffil(a: Affil, accept: boolean) {
    setAffilBusy(a.id);
    const { error } = await supabase
      .from('speaker_affiliations')
      .update({ status: accept ? 'confirmed' : 'declined' })
      .eq('id', a.id);
    setAffilBusy(null);
    if (error) { Alert.alert('Something went wrong', error.message); return; }
    setAffils(prev => accept
      ? prev.map(x => x.id === a.id ? { ...x, status: 'confirmed' } : x)
      : prev.filter(x => x.id !== a.id));
  }
  const totalViews = useMemo(() => videos.reduce((s, v) => s + (v.view_count ?? 0), 0), [videos]);

  const sortedFor = (list: Video[]) => {
    const copy = list.slice();
    if (sort === 'popular') copy.sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
    else if (sort === 'oldest') copy.sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
    return copy;
  };

  const styles = makeStyles(C, isDesktopWeb);

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
  const location = [speaker.state, speaker.country !== 'US' ? speaker.country : null].filter(Boolean).join(' · ');
  const basedIn = location;

  function openEdit() {
    if (!speaker) return;
    setEdit({
      bio: speaker.bio ?? '',
      languages: (speaker.languages ?? []).join(', '),
      website: speaker.website ?? '',
      youtube_url: speaker.youtube_url ?? '',
      instagram_url: speaker.instagram_url ?? '',
    });
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!speaker) return;
    setSavingEdit(true);
    setEditError(null);
    const patch = {
      bio: edit.bio.trim() || null,
      languages: edit.languages.split(',').map(x => x.trim()).filter(Boolean),
      website: edit.website.trim() || null,
      youtube_url: edit.youtube_url.trim() || null,
      instagram_url: edit.instagram_url.trim() || null,
    };
    const { error } = await supabase.from('speakers').update(patch).eq('id', speaker.id);
    setSavingEdit(false);
    if (error) { setEditError(error.message); return; }
    setSpeaker({ ...speaker, ...patch });
    setEditOpen(false);
  }
  const pad = isDesktopWeb ? 32 : 16;
  const innerWidth = contentWidth - pad * 2;

  // 16:9 video grid and 9:16 gem grid — columns derived from real width.
  const GAP = isDesktopWeb ? 20 : 12;
  const vCols = innerWidth >= 1000 ? 4 : innerWidth >= 720 ? 3 : innerWidth >= 460 ? 2 : 1;
  const vCardW = (innerWidth - GAP * (vCols - 1)) / vCols;
  const gCols = isDesktopWeb ? Math.max(3, Math.min(6, Math.floor(innerWidth / 190))) : 2;
  const gCardW = (innerWidth - GAP * (gCols - 1)) / gCols;

  const stats = [
    { val: formatCount(speaker.follower_count), label: 'followers' },
    { val: formatCount(videos.length), label: videos.length === 1 ? 'video' : 'videos' },
    { val: formatCount(totalViews), label: 'views' },
    ...(speaker.total_raised && !unclaimed ? [{ val: formatRaised(speaker.total_raised), label: 'raised' }] : []),
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'videos', label: `Videos · ${longVideos.length}` },
    { key: 'gems', label: `Gems · ${shortVideos.length}` },
    ...(speakerSeries.rows.length ? [{ key: 'series' as Tab, label: `Series · ${speakerSeries.rows.length}` }] : []),
    { key: 'about', label: 'About' },
  ];

  const followButton = speaker.profile_id && !isOwner ? (
    <Button
      size="md"
      variant={following ? 'secondary' : 'gold'}
      icon={following ? 'checkmark' : undefined}
      label={following ? 'Following' : 'Follow'}
      onPress={toggleFollow}
      disabled={followBusy}
    />
  ) : null;

  const actionButtons = (
    <View style={styles.actions}>
      {followButton}
      {isOwner && (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/studio' as any)}>
          <Icon name="stats-chart-outline" size={16} color={dsStatic().c.onPrimary} />
          <Text style={styles.primaryBtnText}>Open Studio</Text>
        </TouchableOpacity>
      )}
      {isOwner && (
        <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/gem-upload' as any)}>
          <Icon name="cloud-upload-outline" size={16} color={C.text} />
          <Text style={styles.ghostBtnText}>Upload</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => shareSpeaker(speaker.id, speaker.display_name)}
        accessibilityLabel={`Share ${speaker.display_name}'s profile`}
      >
        <Icon name="share-outline" size={18} color={C.text} />
      </TouchableOpacity>
      {speaker.profile_id && !isOwner && userId ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (blockedSet.has(speaker.profile_id!) ? unblockUser(speaker.profile_id!) : blockUser(speaker.profile_id, speaker.display_name))}
          accessibilityLabel={blockedSet.has(speaker.profile_id) ? `Unblock ${speaker.display_name}` : `Block ${speaker.display_name}`}
        >
          <Icon name="ban-outline" size={18} color={blockedSet.has(speaker.profile_id) ? C.danger : C.text} />
        </TouchableOpacity>
      ) : null}
      {!isOwner ? (
        <ReportButton targetType="speaker" targetId={speaker.id} reportedUserId={speaker.profile_id} what="this profile" />
      ) : null}
    </View>
  );

  const avatar = (
    <TouchableOpacity
      style={[styles.avatar, isDesktopWeb && styles.avatarDesktop]}
      activeOpacity={isOwner ? 0.85 : 1}
      onPress={isOwner ? pickAvatar : undefined}
      accessibilityLabel={isOwner ? 'Change profile photo' : undefined}
    >
      {speaker.avatar_url ? (
        <Image source={{ uri: speaker.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={[styles.avatarText, isDesktopWeb && styles.avatarTextDesktop]}>{initial}</Text>
      )}
      {isOwner && (
        <View style={styles.editAvatarBadge}>
          {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="camera-outline" size={12} color="#fff" />}
        </View>
      )}
    </TouchableOpacity>
  );

  const renderVideoCard = (v: Video, width: number) => {
    const dur = formatDuration(v.duration_secs);
    return (
      <TouchableOpacity key={v.id} style={{ width }} activeOpacity={0.85} onPress={() => openVideo(v)}>
        <View style={styles.videoThumb}>
          {v.thumbnail_url ? (
            <Image source={{ uri: v.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Icon name="play" size={26} color={C.text3} />
          )}
          {dur && <View style={styles.durChip}><Text style={styles.durText}>{dur}</Text></View>}
        </View>
        <Text style={styles.videoTitle} numberOfLines={2}>{v.title}</Text>
        <Text style={styles.videoMeta}>{formatCount(v.view_count)} views · {timeAgo(v.published_at)}</Text>
      </TouchableOpacity>
    );
  };

  const sortPills = (
    <View style={styles.pillRow}>
      {([['latest', 'Latest'], ['popular', 'Most viewed'], ['oldest', 'Oldest']] as [Sort, string][]).map(([k, label]) => (
        <TouchableOpacity
          key={k}
          style={[styles.pill, sort === k && styles.pillActive]}
          onPress={() => { setSort(k); setShowCount(12); }}
        >
          <Text style={[styles.pillText, sort === k && styles.pillTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const emptyState = (what: string) => (
    <View style={styles.empty}>
      <Icon name="film-outline" size={28} color={C.text3} />
      <Text style={styles.emptyTitle}>No {what} yet</Text>
      {isOwner && (
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={() => router.push('/gem-upload' as any)}>
          <Text style={styles.primaryBtnText}>Upload your first</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  let tabContent: React.ReactNode = null;
  if (tab === 'series') {
    tabContent = <SeriesGrid rows={speakerSeries.rows} loading={speakerSeries.loading} columns={isDesktopWeb ? 3 : 1} />;
  } else if (tab === 'videos') {
    const list = sortedFor(longVideos);
    const featured = sort === 'latest' && isDesktopWeb ? list[0] : null;
    const rest = featured ? list.slice(1) : list;
    tabContent = longVideos.length === 0 ? emptyState('videos') : (
      <>
        {featured && (
          <TouchableOpacity style={styles.featured} activeOpacity={0.9} onPress={() => openVideo(featured)}>
            <View style={[styles.videoThumb, styles.featuredThumb]}>
              {featured.thumbnail_url && (
                <Image source={{ uri: featured.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
              <View style={styles.playCircle}><Icon name="play" size={24} color="#000" /></View>
              {formatDuration(featured.duration_secs) && (
                <View style={styles.durChip}><Text style={styles.durText}>{formatDuration(featured.duration_secs)}</Text></View>
              )}
            </View>
            <View style={styles.featuredInfo}>
              <Text style={styles.eyebrow}>LATEST VIDEO</Text>
              <Text style={styles.featuredTitle} numberOfLines={3}>{featured.title}</Text>
              <Text style={styles.videoMeta}>{formatCount(featured.view_count)} views · {timeAgo(featured.published_at)}</Text>
              <View style={[styles.primaryBtn, { alignSelf: 'flex-start', marginTop: 8 }]}>
                <Text style={styles.primaryBtnText}>Watch now</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All videos</Text>
          {sortPills}
        </View>
        <View style={[styles.grid, { gap: GAP }]}>
          {rest.slice(0, showCount).map(v => renderVideoCard(v, vCardW))}
        </View>
        {rest.length > showCount && (
          <TouchableOpacity style={[styles.ghostBtn, styles.loadMore]} onPress={() => setShowCount(c => c + 12)}>
            <Text style={styles.ghostBtnText}>Load more</Text>
          </TouchableOpacity>
        )}
      </>
    );
  } else if (tab === 'gems') {
    const list = sortedFor(shortVideos);
    tabContent = shortVideos.length === 0 ? emptyState('Gems') : (
      <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gems</Text>
          {sortPills}
        </View>
        <View style={[styles.grid, { gap: GAP }]}>
          {list.slice(0, showCount * 2).map(v => (
            <TouchableOpacity key={v.id} style={[styles.gemCard, { width: gCardW }]} activeOpacity={0.85} onPress={() => openVideo(v)}>
              <View style={styles.gemThumb}>
                {v.thumbnail_url ? (
                  <Image source={{ uri: v.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : isOwner ? (
                  <TouchableOpacity
                    style={styles.addThumbBtn}
                    onPress={(e: any) => { e?.stopPropagation?.(); pickGemThumbnail(v.id); }}
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
                ) : (
                  <Icon name="play" size={22} color={C.text3} />
                )}
                <View style={styles.gemViews}>
                  <Icon name="play" size={10} color="#fff" />
                  <Text style={styles.gemViewsText}>{formatCount(v.view_count)}</Text>
                </View>
              </View>
              <Text style={styles.gemTitle} numberOfLines={2}>{v.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {list.length > showCount * 2 && (
          <TouchableOpacity style={[styles.ghostBtn, styles.loadMore]} onPress={() => setShowCount(c => c + 12)}>
            <Text style={styles.ghostBtnText}>Load more</Text>
          </TouchableOpacity>
        )}
      </>
    );
  } else {
    const links = [
      speaker.website && { label: 'Website', icon: 'globe-outline', url: withProtocol(speaker.website) },
      speaker.youtube_url && { label: 'YouTube', icon: 'logo-youtube', url: withProtocol(speaker.youtube_url) },
      speaker.instagram_url && { label: 'Instagram', icon: 'logo-instagram', url: withProtocol(speaker.instagram_url) },
    ].filter(Boolean) as { label: string; icon: any; url: string }[];
    tabContent = (
      <View style={styles.aboutCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.sectionTitle}>About</Text>
          {isOwner && (
            <TouchableOpacity style={styles.ghostBtn} onPress={openEdit} accessibilityLabel="Edit your profile">
              <Icon name="create-outline" size={16} color={C.text} />
              <Text style={styles.ghostBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
        {speaker.bio ? (
          <Text style={styles.aboutBio}>{speaker.bio}</Text>
        ) : isOwner ? (
          <TouchableOpacity onPress={openEdit} accessibilityRole="button">
            <Text style={[styles.aboutBio, { textDecorationLine: 'underline' }]}>Add a bio so people know who you are and what you teach.</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.aboutBio}>No bio yet.</Text>
        )}
        <View style={styles.aboutGrid}>
          {basedIn ? <AboutRow styles={styles} label="Based in" value={basedIn} /> : null}
          {speaker.languages?.length ? <AboutRow styles={styles} label="Languages" value={speaker.languages.join(', ')} /> : null}
        </View>
        {speaker.topics?.length ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.aboutLabel}>Topics</Text>
            <View style={styles.pillRow}>
              {speaker.topics.map(t => (
                <View key={t} style={styles.topic}><Text style={styles.topicText}>{t}</Text></View>
              ))}
            </View>
          </View>
        ) : null}
        {links.length > 0 && (
          <View style={styles.pillRow}>
            {links.map(l => (
              <TouchableOpacity key={l.label} style={styles.ghostBtn} onPress={() => Linking.openURL(l.url)}>
                <Icon name={l.icon} size={16} color={C.text} />
                <Text style={styles.ghostBtnText}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={[styles.page, { maxWidth: MAX_CONTENT }]}>
            {/* Banner */}
            <View style={styles.coverWrap}>
              <TouchableOpacity
                style={styles.cover}
                activeOpacity={isOwner ? 0.85 : 1}
                onPress={isOwner ? pickBanner : undefined}
                accessibilityLabel={isOwner ? 'Change banner' : undefined}
              >
                {speaker.banner_url && (
                  <Image source={{ uri: speaker.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                )}
                {isOwner && (
                  <View style={styles.editBannerBtn}>
                    {uploadingBanner ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Icon name="camera-outline" size={14} color="#fff" />
                        {isDesktopWeb && <Text style={styles.editBannerText}>Edit banner</Text>}
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
              {!isDesktopWeb && (
                <TouchableOpacity style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back">
                  <Icon name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {/* Identity row */}
            <View style={[styles.identity, { paddingHorizontal: pad }]}>
              {avatar}
              <View style={styles.identityText}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, isDesktopWeb && styles.nameDesktop]}>{speaker.display_name}</Text>
                  {unclaimed && <UnclaimedBadge />}
                  {speaker.is_verified && !unclaimed && (
                    <View style={styles.verifiedBadge}>
                      <Icon name="checkmark-circle" size={14} color={C.emerald} />
                      <Text style={styles.verifiedText}>Verified speaker</Text>
                    </View>
                  )}
                </View>
                {confirmedAffils.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => router.push({ pathname: '/org-profile', params: { id: a.organizations!.id } } as any)}
                    accessibilityRole="link"
                    style={styles.affilRow}
                  >
                    <View style={styles.affilLogo}>
                      {a.organizations!.logo_url
                        ? <Image source={{ uri: a.organizations!.logo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <Text style={styles.affilLogoText}>{a.organizations!.org_name.slice(0, 1)}</Text>}
                    </View>
                    <Text style={styles.subline} numberOfLines={1}>
                      {[a.title, a.organizations!.org_name].filter(Boolean).join(', ')}
                    </Text>
                  </TouchableOpacity>
                ))}
                {location ? <Text style={styles.subline}>{location}</Text> : null}
                <View style={styles.statsRow}>
                  {stats.map(s => (
                    <Text key={s.label} style={styles.statText}>
                      <Text style={styles.statVal}>{s.val}</Text> {s.label}
                    </Text>
                  ))}
                </View>
              </View>
              {isDesktopWeb && actionButtons}
            </View>
            {!isDesktopWeb && <View style={{ paddingHorizontal: pad, marginTop: 12 }}>{actionButtons}</View>}

            {/* Verification strip — Siqa's promise: no impersonation. */}
            {unclaimed && (
              <View style={{ marginHorizontal: pad, marginTop: 20 }}>
                <ClaimNotice entityType="speaker" entityId={speaker.id} name={speaker.display_name} compact={!isDesktopWeb} />
              </View>
            )}

            {speaker.is_verified && !unclaimed && (
              <View style={[styles.verifyStrip, { marginHorizontal: pad }]}>
                <Icon name="shield-checkmark-outline" size={20} color={C.emerald} />
                <Text style={styles.verifyText}>
                  <Text style={{ ...font(700), color: C.text }}>Identity confirmed by Siqa. </Text>
                  Videos here come from {speaker.display_name}'s own Siqa account or their official YouTube channel.
                </Text>
              </View>
            )}

            {/* An organization asked to list this speaker as one of its scholars. */}
            {isOwner && pendingAffils.map(a => (
              <View key={a.id} style={[styles.affilInvite, { marginHorizontal: pad }]}>
                <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
                  <Text style={styles.affilInviteTitle}>{a.organizations!.org_name} added you as a scholar</Text>
                  <Text style={styles.affilInviteSub}>
                    {a.title ? `Role: ${a.title}. ` : ''}If you confirm, you'll show on their page and can post videos under their name.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button size="md" variant="secondary" label="Decline" disabled={affilBusy === a.id} onPress={() => respondAffil(a, false)} />
                  <Button size="md" label="Confirm" loading={affilBusy === a.id} onPress={() => respondAffil(a, true)} />
                </View>
              </View>
            ))}

            {/* Tabs */}
            <View style={[styles.tabRow, { marginHorizontal: pad }]} accessibilityRole="tablist">
              {tabs.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                  onPress={() => { setTab(t.key); setShowCount(12); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.key }}
                >
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {sourceOptions.length && tab !== 'about' && tab !== 'series' ? (
              <View style={[styles.sourceRow, { marginHorizontal: pad }]} accessibilityRole="radiogroup" accessibilityLabel="Whose videos">
                {sourceOptions.map(o => (
                  <Chip key={o.key} label={o.label} selected={source === o.key} onPress={() => { setSource(o.key); setShowCount(12); }} />
                ))}
              </View>
            ) : null}

            <View style={{ paddingHorizontal: pad, paddingTop: 20 }}>{tabContent}</View>
          </View>
          <View style={{ height: 48 }} />
        </ScrollView>
      </View>

      <BottomSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        footer={<Button label="Save changes" loading={savingEdit} onPress={saveEdit} />}
      >
        <View style={{ gap: 16 }}>
          <TextField
            label="About you"
            value={edit.bio}
            onChangeText={(v) => setEdit(e => ({ ...e, bio: v }))}
            placeholder="Who you are, what you teach, where you studied"
            multiline
            maxLength={1000}
            style={{ minHeight: 120 }}
            error={editError}
          />
          <TextField
            label="Languages"
            value={edit.languages}
            onChangeText={(v) => setEdit(e => ({ ...e, languages: v }))}
            placeholder="English, Arabic, Urdu"
            help="Separate with commas."
          />
          <TextField label="Website" value={edit.website} onChangeText={(v) => setEdit(e => ({ ...e, website: v }))} placeholder="yoursite.com" keyboardType="url" autoCapitalize="none" />
          <TextField label="YouTube" value={edit.youtube_url} onChangeText={(v) => setEdit(e => ({ ...e, youtube_url: v }))} placeholder="youtube.com/@yourchannel" keyboardType="url" autoCapitalize="none" />
          <TextField label="Instagram" value={edit.instagram_url} onChangeText={(v) => setEdit(e => ({ ...e, instagram_url: v }))} placeholder="instagram.com/yourname" keyboardType="url" autoCapitalize="none" />
          <Text style={{ fontSize: 13, color: C.text3, lineHeight: 18 }}>Your name is set by Siqa when you're verified. To change it, ask the Siqa team.</Text>
        </View>
      </BottomSheet>

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

function AboutRow({ styles, label, value }: { styles: any; label: string; value: string }) {
  return (
    <View style={styles.aboutRow}>
      <Text style={styles.aboutLabel}>{label}</Text>
      <Text style={styles.aboutValue}>{value}</Text>
    </View>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    errorText: { color: C.text3, fontSize: 14 },
    scroll: { paddingBottom: 20 },
    page: { width: '100%', alignSelf: 'center' },

    coverWrap: { position: 'relative', marginHorizontal: desktop ? 32 : 0, marginTop: desktop ? 24 : 0 },
    cover: {
      height: desktop ? 200 : 170, backgroundColor: C.emerald, overflow: 'hidden',
      borderRadius: desktop ? Theme.radius.xl : 0,
    },
    backBtn: {
      position: 'absolute', top: Platform.OS === 'web' ? 14 : 54, left: 14, width: 40, height: 40, borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    editBannerBtn: {
      position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    },
    editBannerText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    identity: {
      flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'flex-end' : 'flex-start',
      gap: desktop ? 20 : 10, marginTop: desktop ? 12 : 0,
    },
    identityText: { flex: desktop ? 1 : undefined, minWidth: 0, gap: 4, paddingBottom: desktop ? 4 : 0 },
    avatar: {
      width: 88, height: 88, borderRadius: 44, backgroundColor: C.surface2,
      borderWidth: 4, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      // Only the avatar overlaps the banner; the name and stats sit below it.
      marginTop: -44,
    },
    avatarDesktop: { width: 128, height: 128, borderRadius: 64, marginLeft: 0, marginTop: -76 },
    avatarText: { fontSize: 32, color: C.emerald, fontWeight: '700' },
    avatarTextDesktop: { fontSize: 44 },
    editAvatarBadge: {
      position: 'absolute', bottom: 6, right: 6, width: 26, height: 26, borderRadius: 13,
      backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
    },

    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    name: { fontSize: 22, fontWeight: '700', color: C.text },
    nameDesktop: { fontSize: 30, letterSpacing: -0.4 },
    verifiedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.emeraldBg,
      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    },
    verifiedText: { color: C.emerald, fontSize: 12, fontWeight: '700' },
    subline: { fontSize: 14, color: C.text2, flexShrink: 1 },
    affilRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, minHeight: 24 },
    affilLogo: { width: 20, height: 20, borderRadius: 6, backgroundColor: '#0a0f1c', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    affilLogoText: { color: '#d4ac73', fontSize: 11, fontWeight: '800' },
    affilInvite: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: C.goldBg },
    affilInviteTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    affilInviteSub: { fontSize: 13, color: C.text2, lineHeight: 18 },
    sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 },
    statText: { fontSize: 14, color: C.text2 },
    statVal: { fontSize: 15, fontWeight: '700', color: C.text },

    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingBottom: desktop ? 6 : 0 },
    followBtn: {
      height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: C.emerald,
      alignItems: 'center', justifyContent: 'center',
    },
    followBtnActive: { backgroundColor: C.emeraldBg, borderWidth: 1, borderColor: C.emerald },
    followBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    followBtnTextActive: { color: C.emerald },
    primaryBtn: buttonStyles('primary', 'md').box,
    primaryBtnText: buttonStyles('primary', 'md').text,
    ghostBtn: buttonStyles('secondary', 'md').box,
    ghostBtnText: buttonStyles('secondary', 'md').text,
    iconBtn: {
      width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface,
    },

    verifyStrip: {
      flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, padding: 14,
      borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.emeraldSoft, backgroundColor: C.emeraldBg,
    },
    verifyText: { flex: 1, fontSize: 13, color: C.text2, lineHeight: 19 },

    tabRow: { flexDirection: 'row', marginTop: 20, borderBottomWidth: 1, borderBottomColor: C.border2 },
    tabBtn: { height: 46, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: C.emerald },
    tabText: { fontSize: 15, color: C.text2, fontWeight: '500' },
    tabTextActive: { color: C.text, fontWeight: '700' },

    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
      gap: 12, marginBottom: 14,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: C.text },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1, maxWidth: '100%' },
    pill: {
      height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      justifyContent: 'center', backgroundColor: C.surface,
    },
    pillActive: { backgroundColor: C.text, borderColor: C.text },
    pillText: { fontSize: 13, color: C.text, fontWeight: '500' },
    pillTextActive: { color: C.bg, fontWeight: '700' },

    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    videoThumb: {
      aspectRatio: 16 / 9, borderRadius: Theme.radius.md, overflow: 'hidden', backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center',
    },
    durChip: {
      position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.8)',
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
    },
    durText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    videoTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginTop: 8, lineHeight: 19 },
    videoMeta: { fontSize: 12, color: C.text2, marginTop: 3 },

    featured: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 24, padding: 16, marginBottom: 28,
      borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    featuredThumb: { flexGrow: 1, flexShrink: 1, flexBasis: 420 },
    featuredInfo: { flexGrow: 1, flexShrink: 1, flexBasis: 260, justifyContent: 'center', gap: 8 },
    eyebrow: { fontSize: 12, fontWeight: '700', color: C.emerald, letterSpacing: 0.8 },
    featuredTitle: { fontSize: 24, fontWeight: '700', color: C.text, lineHeight: 30 },
    playCircle: {
      width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center', justifyContent: 'center',
    },

    gemCard: {},
    gemThumb: {
      aspectRatio: 9 / 16, borderRadius: Theme.radius.md, overflow: 'hidden', backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center',
    },
    gemViews: {
      position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
    },
    gemViewsText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    gemTitle: { fontSize: 13, fontWeight: '500', color: C.text, marginTop: 6, lineHeight: 17 },
    addThumbBtn: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
    addThumbBtnText: { fontSize: 11, color: C.text3, fontWeight: '600', textAlign: 'center' },
    loadMore: { alignSelf: 'center', marginTop: 24 },

    empty: { alignItems: 'center', paddingVertical: 56, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text },

    aboutCard: {
      gap: 18, padding: desktop ? 24 : 16, maxWidth: 760, borderRadius: Theme.radius.lg,
      borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    aboutBio: { fontSize: 15, color: C.text2, lineHeight: 23 },
    aboutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
    aboutRow: { minWidth: 180, gap: 3 },
    aboutLabel: { fontSize: 12, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    aboutValue: { fontSize: 15, color: C.text, fontWeight: '500' },
    topic: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.emeraldBg },
    topicText: { fontSize: 13, color: C.emerald, fontWeight: '600' },
  }));
}

export default focusedOnly(SpeakerProfileScreen);
