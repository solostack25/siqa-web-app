import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { focusedOnly } from '../../../components/FocusedOnly';
import { Avatar } from '../../../components/SeedSocial';
import { UnclaimedBadge } from '../../../components/ClaimNotice';
import { Video, ResizeMode } from 'expo-av';
import { supabase } from '../../../lib/supabase';
import { recordView, VIEW_DELAY_MS } from '../../../lib/views';
import { useTheme, type AppColors } from '../../../lib/theme';
import { DesktopShell, useIsDesktopWeb } from '../../../components/DesktopShell';
import { Theme } from '../../../constants/theme';
import { shareVideo } from '../../../lib/share';
import { CastButton } from '../../../components/CastButton';
import { YouTubeEmbed } from '../../../components/YouTubeEmbed';
import { WatchComments } from '../../../components/comments/Comments';
import { Icon } from '../../../components/Icon';
import { brandStyles } from '../../../lib/ds';
import { Button, Chip } from '../../../components/ui';

type VideoDetail = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  category: string | null;
  topics: string[] | null;
  view_count: number;
  like_count?: number | null;
  comment_count: number;
  published_at: string | null;
  created_at: string;
  speaker_id: string;
  platform: string | null;
  platform_video_id: string | null;
  speakers: {
    id: string;
    display_name: string;
    is_verified: boolean;
    follower_count: number;
    profile_id: string;
  } | null;
};

type RelatedVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number;
  published_at?: string | null;
  created_at?: string | null;
  speakers: { display_name: string } | null;
};

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} view${n === 1 ? '' : 's'}`;
}

function timeAgo(ts: string | null) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function WatchScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = useIsDesktopWeb();
  const width = isDesktopWeb ? windowWidth - 220 : windowWidth;
  const isWide = width > 900;

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [related, setRelated] = useState<RelatedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const load = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);

    const { data: v } = await supabase
      .from('videos')
      .select(
        `id, title, description, video_url, thumbnail_url, category, topics,
         view_count, like_count, comment_count, published_at, created_at, speaker_id,
         platform, platform_video_id,
         speakers(id, display_name, is_verified, is_claimed, follower_count, profile_id, avatar_url)`
      )
      .eq('id', videoId)
      .single();

    setVideo(v as any);
    setLikeCount((v as any)?.like_count ?? 0);
    setDescOpen(false);

    if (v) {
      let relQuery = supabase
        .from('videos')
        .select(`id, title, thumbnail_url, view_count, published_at, created_at, speakers(display_name)`)
        .eq('format', 'long')
        .eq('is_published', true)
        .neq('id', videoId)
        .limit(12);

      if (v.category) relQuery = relQuery.eq('category', v.category);
      const { data: rel } = await relQuery;
      setRelated((rel as any[]) ?? []);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const speakerProfileId = (v as any).speakers?.profile_id as string | undefined;
      if (user && speakerProfileId) {
        const { data: existing } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', speakerProfileId)
          .maybeSingle();
        setFollowing(Boolean(existing));
      }
      if (user) {
        const [{ data: l }, { data: sv }] = await Promise.all([
          supabase.from('video_likes').select('video_id').eq('video_id', videoId).eq('profile_id', user.id).maybeSingle(),
          supabase.from('video_saves').select('video_id').eq('video_id', videoId).eq('profile_id', user.id).maybeSingle(),
        ]);
        setLiked(Boolean(l));
        setSaved(Boolean(sv));
      } else {
        setLiked(false);
        setSaved(false);
      }

    }

    setLoading(false);
  }, [videoId]);

  // Count a view once the viewer has stayed VIEW_DELAY_MS on this video.
  useEffect(() => {
    if (!videoId) return;
    const t = setTimeout(() => recordView(videoId), VIEW_DELAY_MS);
    return () => clearTimeout(t);
  }, [videoId]);

  async function handleShare() {
    if (!video) return;
    // shareVideo shows its own "Link copied" toast when it falls back to the clipboard.
    await shareVideo(video.id, video.title, video.speakers?.display_name);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/gems' as any);
  }

  async function toggleLike() {
    if (!video) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/(auth)/login' as any); return; }
    const was = liked;
    setLiked(!was);
    setLikeCount(n => (was ? Math.max(0, n - 1) : n + 1));
    const res = was
      ? await supabase.from('video_likes').delete().eq('video_id', video.id).eq('profile_id', user.id)
      : await supabase.from('video_likes').insert({ video_id: video.id, profile_id: user.id });
    if (res.error) {
      setLiked(was);
      setLikeCount(n => (was ? n + 1 : Math.max(0, n - 1)));
    }
  }

  async function toggleSave() {
    if (!video) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/(auth)/login' as any); return; }
    const was = saved;
    setSaved(!was);
    const res = was
      ? await supabase.from('video_saves').delete().eq('video_id', video.id).eq('profile_id', user.id)
      : await supabase.from('video_saves').upsert({ video_id: video.id, profile_id: user.id }, { onConflict: 'video_id,profile_id' });
    if (res.error) setSaved(was);
  }

  async function toggleFollow() {
    if (!video?.speakers) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/(auth)/login' as any);
      return;
    }

    const profileId = video.speakers.profile_id;

    if (following) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profileId);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: profileId });
      setFollowing(true);
    }
    // follower_count is maintained by the update_follower_count trigger on follows.
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !video) {
    return (
      <DesktopShell>
        <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={C.gold} />
        </View>
      </DesktopShell>
    );
  }

  // Cast to TV (website only): Siqa's own MP4s. YouTube videos have
  // YouTube's own cast button inside the embed.
  const isYouTube = video.platform === 'youtube' && Boolean(video.platform_video_id);
  const castMedia = {
    url: video.video_url,
    title: video.title,
    subtitle: video.speakers?.display_name ?? 'Siqa',
    posterUrl: video.thumbnail_url,
  };
  const getPlayerVideo = () =>
    typeof document === 'undefined'
      ? null
      : (document.getElementById('siqa-player')?.querySelector('video') as HTMLVideoElement | null) ?? null;

  return (
    <DesktopShell>
    <View style={styles.screen}>
      {/* Player is intentionally OUTSIDE the ScrollView below — this is
          what keeps it fixed/playing while everything else scrolls under
          it, rather than scrolling away with the page. */}
      <View style={styles.playerWrapFixed}>
        <View style={styles.playerInner} nativeID="siqa-player">
          {video.platform === 'youtube' && video.platform_video_id ? (
            <YouTubeEmbed videoId={video.platform_video_id} autoplay />
          ) : (
            <Video
              source={{ uri: video.video_url }}
              posterSource={video.thumbnail_url ? { uri: video.thumbnail_url } : undefined}
              usePoster
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              style={styles.player}
              shouldPlay
            />
          )}
          {!isYouTube && <CastButton variant="overlay" media={castMedia} getVideoElement={getPlayerVideo} />}
          {!isWide && (
            <TouchableOpacity onPress={goBack} style={styles.playerBack} accessibilityLabel="Back" hitSlop={8}>
              <Icon name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!isWide ? (
      <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Title + meta */}
        <View style={styles.mSection}>
          <Text style={styles.mTitle}>{video.title}</Text>
          <Text style={styles.mMeta}>
            {formatViews(video.view_count)} · {timeAgo(video.published_at ?? video.created_at)}
            {video.category ? ` · ${video.category}` : ''}
          </Text>
        </View>

        {/* Actions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mPills}>
          <Chip icon={liked ? 'thumbs-up' : 'thumbs-up-outline'} label={likeCount > 0 ? likeCount.toLocaleString() : 'Like'} selected={liked} onPress={toggleLike} />
          <Chip icon={saved ? 'bookmark' : 'bookmark-outline'} label={saved ? 'Saved' : 'Save'} selected={saved} onPress={toggleSave} />
          <Chip icon="share-outline" label="Share" onPress={handleShare} />
        </ScrollView>

        <View style={styles.mBand} />

        {/* Speaker */}
        <View style={[styles.mSection, { gap: 10 }]}>
          <View style={styles.mSpeakerRow}>
            <TouchableOpacity
              style={styles.mSpeakerInfo}
              onPress={() => router.push(`/speaker/${video.speaker_id}` as any)}
            >
              <Avatar name={video.speakers?.display_name ?? 'Siqa'} url={(video.speakers as any)?.avatar_url ?? null} size={44} />
              <View style={{ flexShrink: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {video.speakers?.display_name ?? 'Siqa'}
                  {video.speakers?.is_verified && (video.speakers as any)?.is_claimed ? ' ✓' : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.creatorMeta} numberOfLines={1}>{(video.speakers?.follower_count ?? 0).toLocaleString()} followers</Text>
                  {video.speakers && (video.speakers as any).is_claimed === false && <UnclaimedBadge />}
                </View>
              </View>
            </TouchableOpacity>
            <Button size="md" variant={following ? 'secondary' : 'gold'} label={following ? 'Following' : 'Follow'} icon={following ? 'checkmark' : undefined} onPress={toggleFollow} />
          </View>
          {video.speakers && (video.speakers as any).is_claimed === false && (
            <Text style={styles.mClaim}>
              Siqa set up this profile from public videos.{' '}
              <Text
                style={styles.mClaimLink}
                onPress={() => router.push({ pathname: '/claim', params: { type: 'speaker', id: video.speaker_id } } as any)}
              >
                Is this you? Claim it
              </Text>
            </Text>
          )}
        </View>

        {(video.description || (video.topics && video.topics.length > 0)) ? (
          <>
            <View style={styles.mBand} />
            <View style={[styles.mSection, { gap: 10 }]}>
              <Text style={styles.mH2}>About this video</Text>
              {video.description ? (
                <TouchableOpacity activeOpacity={0.8} style={styles.mDescCard} onPress={() => setDescOpen(o => !o)}>
                  <Text style={styles.mDescText} numberOfLines={descOpen ? undefined : 3}>{video.description}</Text>
                  {video.description.length > 140 && (
                    <Text style={styles.mShowMore}>{descOpen ? 'Show less' : 'Show more'}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              {video.topics && video.topics.length > 0 ? (
                <View style={styles.topicRow}>
                  {video.topics.map((t) => (
                    <View key={t} style={styles.mTag}><Text style={styles.mTagText}>{t}</Text></View>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={styles.mBand} />
        <WatchComments videoId={video.id} wide={false} />

        {related.length > 0 && (
          <>
            <View style={styles.mBand} />
            <View style={[styles.mSection, { gap: 14 }]}>
              <Text style={styles.mH2}>Up next</Text>
              {related.map((r, i) => (
                <View key={r.id} style={{ gap: 14 }}>
                  <TouchableOpacity style={styles.mRelRow} onPress={() => router.push(`/watch/${r.id}`)}>
                    <View style={styles.mRelThumb}>
                      {r.thumbnail_url ? <Image source={{ uri: r.thumbnail_url }} style={styles.relatedThumb} resizeMode="cover" /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text style={styles.mRelTitle} numberOfLines={3}>{r.title}</Text>
                      <Text style={styles.creatorMeta} numberOfLines={1}>
                        {r.speakers?.display_name}{r.view_count ? ` · ${formatViews(r.view_count)}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {i < related.length - 1 && <View style={styles.mDivider} />}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      ) : (
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          <View style={isWide ? styles.wideContent : undefined}>
            <View style={isWide ? styles.body : styles.bodyStacked}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
                <Text style={styles.backArrow}>‹</Text>
                <Text style={styles.backLabel}>Back</Text>
              </TouchableOpacity>
  
              <Text style={styles.title}>{video.title}</Text>
  
              <View style={[styles.creatorRow, !isWide && styles.creatorRowStacked]}>
                <TouchableOpacity
                  style={[styles.creatorInfo, !isWide && { alignSelf: 'stretch' }]}
                  onPress={() => router.push(`/speaker/${video.speaker_id}` as any)}
                >
                  <Avatar name={video.speakers?.display_name ?? 'Siqa'} url={(video.speakers as any)?.avatar_url ?? null} size={44} />
                  <View style={{ flexShrink: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={[styles.creatorName, { flexShrink: 1 }]} numberOfLines={1}>
                        {video.speakers?.display_name ?? 'Siqa'}
                        {video.speakers?.is_verified && (video.speakers as any)?.is_claimed ? ' ✓' : ''}
                      </Text>
                      {video.speakers && (video.speakers as any).is_claimed === false && <UnclaimedBadge />}
                    </View>
                    <Text style={styles.creatorMeta}>
                      {(video.speakers?.follower_count ?? 0).toLocaleString()} followers
                    </Text>
                  </View>
                </TouchableOpacity>
  
                <View style={[styles.actionsRow, !isWide && { alignSelf: 'stretch' }]}>
                  <TouchableOpacity
                    style={[styles.followBtn, following && styles.followingBtn, !isWide && { flex: 1, alignItems: 'center' }]}
                    onPress={toggleFollow}
                  >
                    <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                      {following ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
  
                  <TouchableOpacity style={[styles.shareBtn, !isWide && { flex: 1, justifyContent: 'center' }]} onPress={handleShare}>
                    <Text style={styles.shareBtnIcon}>↗</Text>
                    <Text style={styles.shareBtnText}>Share</Text>
                  </TouchableOpacity>
  
                  {/* Phones use the cast icon on the player instead (no room here). */}
                  {!isYouTube && isWide && <CastButton media={castMedia} getVideoElement={getPlayerVideo} />}
                </View>
              </View>
  
              <View style={styles.descCard}>
                <Text style={styles.descMeta}>
                  {formatViews(video.view_count)} · {timeAgo(video.published_at ?? video.created_at)}
                </Text>
                {video.description ? <Text style={styles.descText}>{video.description}</Text> : null}
                {video.topics && video.topics.length > 0 ? (
                  <View style={styles.topicRow}>
                    {video.topics.map((t) => (
                      <View key={t} style={styles.topicChip}>
                        <Text style={styles.topicText}>#{t}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
  
              <View style={{ marginTop: 24 }}>
                <WatchComments videoId={video.id} wide />
              </View>
            </View>
  
            <View style={isWide ? styles.relatedWideCol : styles.bodyStacked}>
              <Text style={styles.relatedLabel}>Related videos</Text>
              {related.map((r) => (
                <TouchableOpacity key={r.id} style={styles.relatedRow} onPress={() => router.push(`/watch/${r.id}`)}>
                  <View style={styles.relatedThumbWrap}>
                    {r.thumbnail_url ? (
                      <Image source={{ uri: r.thumbnail_url }} style={styles.relatedThumb} resizeMode="cover" />
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.relatedTitle} numberOfLines={2}>{r.title}</Text>
                    <Text style={styles.relatedMeta}>{r.speakers?.display_name}</Text>
                    <Text style={styles.relatedMeta}>{formatViews(r.view_count)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
  screen: { flex: 1, backgroundColor: C.bg },
  // Fixed player wrapper — never scrolls. Capped width on wide screens so
  // it doesn't stretch to an absurd size on an ultrawide monitor; centered.
  playerWrapFixed: { backgroundColor: C.black, alignItems: 'center' },
  playerInner: { width: '100%', maxWidth: 1000, aspectRatio: 16 / 9 },
  playerBack: {
    position: 'absolute', top: 10, left: 10, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  mSection: { paddingHorizontal: 16, paddingVertical: 14 },
  mTitle: { color: C.text, fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  mMeta: { color: C.text2, fontSize: 13, lineHeight: 18, marginTop: 6 },
  mPills: { gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 16 },
  mPill: {
    height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.bg2,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  mPillOn: { backgroundColor: C.goldSoft },
  mPillText: { color: C.text, fontSize: 13, fontWeight: '600' },
  mBand: { height: 8, backgroundColor: C.bg2 },
  mSpeakerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mSpeakerInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mFollow: { backgroundColor: C.gold, height: 38, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center' },
  mClaim: { color: C.text2, fontSize: 12, lineHeight: 17 },
  mClaimLink: { color: C.goldDim, fontWeight: '700' },
  mH2: { color: C.text, fontSize: 15, fontWeight: '700' },
  mDescCard: { backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  mDescText: { color: C.text, fontSize: 14, lineHeight: 21 },
  mShowMore: { color: C.text, fontSize: 13, fontWeight: '700' },
  mTag: { backgroundColor: C.goldBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  mTagText: { color: C.goldDim, fontSize: 12, fontWeight: '600' },
  mRelRow: { flexDirection: 'row', gap: 12 },
  mRelThumb: { width: 156, aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface3 },
  mRelTitle: { color: C.text, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  mDivider: { height: 1, backgroundColor: C.border },
  scrollArea: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  wideLayout: { flexDirection: 'row', maxWidth: 1600, alignSelf: 'center', width: '100%' },
  wideContent: { flexDirection: 'row', maxWidth: 1400, alignSelf: 'center', width: '100%' },
  mainCol: { flex: 1 },
  sideCol: { width: 380, padding: Theme.spacing.lg, gap: Theme.spacing.md },
  relatedWideCol: { width: 380, padding: Theme.spacing.lg, gap: Theme.spacing.md },
  playerWrap: { aspectRatio: 16 / 9, backgroundColor: C.black },
  player: { width: '100%', height: '100%' },
  body: { padding: Theme.spacing.lg, flex: 1 },
  // Phones: sections stack at their natural height. flex: 1 here squeezed
  // the details and Related videos into each other over the comments.
  bodyStacked: { padding: Theme.spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Theme.spacing.sm },
  backArrow: { color: C.text2, fontSize: 22 },
  backLabel: { color: C.text2, fontSize: Theme.fontSize.base, marginLeft: 2 },
  title: { color: C.text, fontSize: Theme.fontSize.xl, fontWeight: Theme.fontWeight.bold },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Theme.spacing.md,
  },
  creatorRowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: Theme.spacing.md },
  creatorInfo: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm, flexShrink: 1, minWidth: 0 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.goldSoft },
  creatorName: { color: C.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold },
  creatorMeta: { color: C.text2, fontSize: Theme.fontSize.sm },
  followBtn: { backgroundColor: C.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Theme.radius.full },
  actionsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Theme.spacing.sm },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.radius.full,
  },
  shareBtnIcon: { color: C.text, fontSize: 15 },
  shareBtnText: { color: C.text, fontWeight: Theme.fontWeight.semibold, fontSize: Theme.fontSize.sm },
  followingBtn: { backgroundColor: C.surface2 },
  followBtnText: { color: C.bg, fontWeight: Theme.fontWeight.semibold },
  followingBtnText: { color: C.text },
  descCard: { backgroundColor: C.surface, borderRadius: Theme.radius.md, padding: Theme.spacing.md, marginTop: Theme.spacing.md },
  descMeta: { color: C.text2, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium },
  descText: { color: C.text, fontSize: Theme.fontSize.base, marginTop: Theme.spacing.sm, lineHeight: 20 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.spacing.sm, marginTop: Theme.spacing.md },
  topicChip: { backgroundColor: C.surface2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.full },
  topicText: { color: C.text2, fontSize: Theme.fontSize.sm },
  commentsLabel: { color: C.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, marginTop: Theme.spacing.xl },
  relatedLabel: { color: C.text2, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, marginBottom: Theme.spacing.sm },
  relatedRow: { flexDirection: 'row', gap: Theme.spacing.sm, marginBottom: Theme.spacing.md },
  relatedThumbWrap: { width: 160, aspectRatio: 16 / 9, borderRadius: Theme.radius.sm, overflow: 'hidden', backgroundColor: C.surface },
  relatedThumb: { width: '100%', height: '100%' },
  relatedTitle: { color: C.text, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium },
  relatedMeta: { color: C.text2, fontSize: Theme.fontSize.xs, marginTop: 2 },
}));
}


// In the tab group so the bottom menu stays; see components/FocusedOnly.
export default focusedOnly(WatchScreen);
