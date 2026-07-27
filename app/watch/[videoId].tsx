import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Theme } from '../../constants/theme';
import { shareVideo } from '../../lib/share';

type VideoDetail = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  category: string | null;
  topics: string[] | null;
  view_count: number;
  comment_count: number;
  published_at: string | null;
  created_at: string;
  speaker_id: string;
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

export default function WatchScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = useIsDesktopWeb();
  const width = isDesktopWeb ? windowWidth - 220 : windowWidth;
  const isWide = width > 900;

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [related, setRelated] = useState<RelatedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);

    const { data: v } = await supabase
      .from('videos')
      .select(
        `id, title, description, video_url, thumbnail_url, category, topics,
         view_count, comment_count, published_at, created_at, speaker_id,
         speakers(id, display_name, is_verified, follower_count, profile_id)`
      )
      .eq('id', videoId)
      .single();

    setVideo(v as any);

    if (v) {
      let relQuery = supabase
        .from('videos')
        .select(`id, title, thumbnail_url, view_count, speakers(display_name)`)
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

      // TODO: view count increment — add a Postgres function (e.g. increment_video_view)
      // or a simple `.update({ view_count: v.view_count + 1 })` call once you decide
      // whether views should count on load or after a watch-time threshold.
    }

    setLoading(false);
  }, [videoId]);

  async function handleShare() {
    if (!video) return;
    const result = await shareVideo(video.id, video.title);
    if (result.copied) {
      Alert.alert('Link copied', 'The video link has been copied to your clipboard.');
    }
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

    await supabase
      .from('speakers')
      .update({
        follower_count: following
          ? Math.max(0, video.speakers.follower_count - 1)
          : video.speakers.follower_count + 1,
      })
      .eq('id', video.speakers.id);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !video) {
    return (
      <DesktopShell>
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={Colors.gold} />
        </View>
      </DesktopShell>
    );
  }

  return (
    <DesktopShell>
    <ScrollView style={styles.container} contentContainerStyle={isWide ? styles.wideLayout : undefined}>
      <View style={isWide ? styles.mainCol : undefined}>
        <View style={styles.playerWrap}>
          <Video
            source={{ uri: video.video_url }}
            posterSource={video.thumbnail_url ? { uri: video.thumbnail_url } : undefined}
            usePoster
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            style={styles.player}
          />
        </View>

        <View style={styles.body}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{video.title}</Text>

          <View style={styles.creatorRow}>
            <TouchableOpacity
              style={styles.creatorInfo}
              onPress={() => router.push(`/channel/${video.speaker_id}`)}
            >
              <View style={styles.avatarPlaceholder} />
              <View>
                <Text style={styles.creatorName}>
                  {video.speakers?.display_name ?? 'Siqa'}
                  {video.speakers?.is_verified ? ' ✓' : ''}
                </Text>
                <Text style={styles.creatorMeta}>
                  {(video.speakers?.follower_count ?? 0).toLocaleString()} followers
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.followBtn, following && styles.followingBtn]}
                onPress={toggleFollow}
              >
                <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnIcon}>↗</Text>
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
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

          <Text style={styles.commentsLabel}>{video.comment_count} comments</Text>
          {/* Reuse the comments sheet component from gems.tsx here */}
        </View>
      </View>

      <View style={isWide ? styles.sideCol : styles.body}>
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
    </ScrollView>
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  wideLayout: { flexDirection: 'row', maxWidth: 1600, alignSelf: 'center', width: '100%' },
  mainCol: { flex: 1 },
  sideCol: { width: 380, padding: Theme.spacing.lg, gap: Theme.spacing.md },
  playerWrap: { aspectRatio: 16 / 9, backgroundColor: Colors.black },
  player: { width: '100%', height: '100%' },
  body: { padding: Theme.spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Theme.spacing.sm },
  backArrow: { color: Colors.text2, fontSize: 22 },
  backLabel: { color: Colors.text2, fontSize: Theme.fontSize.base, marginLeft: 2 },
  title: { color: Colors.text, fontSize: Theme.fontSize.xl, fontWeight: Theme.fontWeight.bold },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Theme.spacing.md,
  },
  creatorInfo: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.goldSoft },
  creatorName: { color: Colors.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold },
  creatorMeta: { color: Colors.text2, fontSize: Theme.fontSize.sm },
  followBtn: { backgroundColor: Colors.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Theme.radius.full },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.radius.full,
  },
  shareBtnIcon: { color: Colors.text, fontSize: 15 },
  shareBtnText: { color: Colors.text, fontWeight: Theme.fontWeight.semibold, fontSize: Theme.fontSize.sm },
  followingBtn: { backgroundColor: Colors.surface2 },
  followBtnText: { color: Colors.bg, fontWeight: Theme.fontWeight.semibold },
  followingBtnText: { color: Colors.text },
  descCard: { backgroundColor: Colors.surface, borderRadius: Theme.radius.md, padding: Theme.spacing.md, marginTop: Theme.spacing.md },
  descMeta: { color: Colors.text2, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium },
  descText: { color: Colors.text, fontSize: Theme.fontSize.base, marginTop: Theme.spacing.sm, lineHeight: 20 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.spacing.sm, marginTop: Theme.spacing.md },
  topicChip: { backgroundColor: Colors.surface2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.full },
  topicText: { color: Colors.text2, fontSize: Theme.fontSize.sm },
  commentsLabel: { color: Colors.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, marginTop: Theme.spacing.xl },
  relatedLabel: { color: Colors.text2, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, marginBottom: Theme.spacing.sm },
  relatedRow: { flexDirection: 'row', gap: Theme.spacing.sm, marginBottom: Theme.spacing.md },
  relatedThumbWrap: { width: 160, aspectRatio: 16 / 9, borderRadius: Theme.radius.sm, overflow: 'hidden', backgroundColor: Colors.surface },
  relatedThumb: { width: '100%', height: '100%' },
  relatedTitle: { color: Colors.text, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium },
  relatedMeta: { color: Colors.text2, fontSize: Theme.fontSize.xs, marginTop: 2 },
});
