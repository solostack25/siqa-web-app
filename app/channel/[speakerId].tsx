import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useState, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Theme } from '../../constants/theme';

type Speaker = {
  id: string;
  display_name: string;
  bio: string | null;
  is_verified: boolean;
  follower_count: number;
  profile_id: string;
};

type VideoItem = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number;
};

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} view${n === 1 ? '' : 's'}`;
}

export default function ChannelScreen() {
  const { speakerId } = useLocalSearchParams<{ speakerId: string }>();
  const { width } = useWindowDimensions();
  const numColumns = width > 900 ? 4 : width > 600 ? 3 : 2;

  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [tab, setTab] = useState<'videos' | 'gems'>('videos');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!speakerId) return;
    setLoading(true);

    const { data: s } = await supabase
      .from('speakers')
      .select('id, display_name, bio, is_verified, follower_count, profile_id')
      .eq('id', speakerId)
      .single();
    setSpeaker(s as any);

    if (s) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: existing } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', s.profile_id)
          .maybeSingle();
        setFollowing(Boolean(existing));
      }
    }

    const { data: v } = await supabase
      .from('videos')
      .select('id, title, thumbnail_url, view_count')
      .eq('speaker_id', speakerId)
      .eq('format', tab === 'gems' ? 'short' : 'long')
      .eq('is_published', true)
      .order('published_at', { ascending: false });
    setVideos((v as any[]) ?? []);

    setLoading(false);
  }, [speakerId, tab]);

  async function toggleFollow() {
    if (!speaker) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/(auth)/login' as any);
      return;
    }

    if (following) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', speaker.profile_id);
      setFollowing(false);
      setSpeaker((prev) => (prev ? { ...prev, follower_count: Math.max(0, prev.follower_count - 1) } : prev));
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: speaker.profile_id });
      setFollowing(true);
      setSpeaker((prev) => (prev ? { ...prev, follower_count: prev.follower_count + 1 } : prev));
    }

    // Best-effort denormalized count sync — not atomic, fine for now.
    // TODO: move to a Postgres trigger on the follows table if follower_count
    // needs to stay accurate under concurrent follows.
    await supabase
      .from('speakers')
      .update({ follower_count: following ? Math.max(0, speaker.follower_count - 1) : speaker.follower_count + 1 })
      .eq('id', speaker.id);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading && !speaker) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.gold} />
      </View>
    );
  }

  if (!speaker) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.emptyTitle}>Creator not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={numColumns}
        data={videos}
        keyExtractor={(v) => v.id}
        numColumns={numColumns}
        columnWrapperStyle={{ gap: Theme.spacing.sm }}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <>
            <TouchableOpacity onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
              <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>

            <View style={styles.banner} />

            <View style={styles.headerRow}>
              <View style={styles.avatarPlaceholder} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{speaker.display_name}</Text>
                  {speaker.is_verified ? <Text style={styles.verified}>✓</Text> : null}
                </View>
                <Text style={styles.followers}>{speaker.follower_count.toLocaleString()} followers</Text>
              </View>
              <TouchableOpacity
                style={[styles.followBtn, following && styles.followingBtn]}
                onPress={toggleFollow}
              >
                <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            </View>

            {speaker.bio ? <Text style={styles.bio}>{speaker.bio}</Text> : null}

            <View style={styles.tabRow}>
              <TouchableOpacity onPress={() => setTab('videos')} style={styles.tabBtn}>
                <Text style={[styles.tabText, tab === 'videos' && styles.tabTextActive]}>Videos</Text>
                {tab === 'videos' ? <View style={styles.tabIndicator} /> : null}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTab('gems')} style={styles.tabBtn}>
                <Text style={[styles.tabText, tab === 'gems' && styles.tabTextActive]}>Gems</Text>
                {tab === 'gems' ? <View style={styles.tabIndicator} /> : null}
              </TouchableOpacity>
            </View>

            {videos.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No {tab === 'gems' ? 'Gems' : 'videos'} yet</Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) =>
          tab === 'videos' ? (
            <TouchableOpacity style={styles.videoCard} onPress={() => router.push(`/watch/${item.id}`)}>
              <View style={styles.videoThumbWrap}>
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : null}
              </View>
              <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.videoMeta}>{formatViews(item.view_count)}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.gemCard} onPress={() => router.push(`/gems?id=${item.id}`)}>
              <View style={styles.gemThumbWrap}>
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : null}
              </View>
            </TouchableOpacity>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  grid: { padding: Theme.spacing.lg },
  backRow: { marginBottom: Theme.spacing.sm },
  backArrow: { color: Colors.text, fontSize: 28 },
  banner: { height: 120, borderRadius: Theme.radius.md, backgroundColor: Colors.surface2, marginBottom: -40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.sm,
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.goldSoft,
    borderWidth: 4,
    borderColor: Colors.bg,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.xs },
  name: { color: Colors.text, fontSize: Theme.fontSize.xxl, fontWeight: Theme.fontWeight.bold },
  verified: { color: Colors.gold, fontSize: Theme.fontSize.lg },
  followers: { color: Colors.text2, fontSize: Theme.fontSize.sm, marginTop: 2 },
  followBtn: { backgroundColor: Colors.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Theme.radius.full },
  followingBtn: { backgroundColor: Colors.surface2 },
  followBtnText: { color: Colors.bg, fontWeight: Theme.fontWeight.semibold },
  followingBtnText: { color: Colors.text },
  bio: { color: Colors.text2, fontSize: Theme.fontSize.base, marginTop: Theme.spacing.md, paddingHorizontal: Theme.spacing.sm },
  tabRow: {
    flexDirection: 'row',
    gap: Theme.spacing.xl,
    marginTop: Theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Theme.spacing.sm,
  },
  tabBtn: { paddingVertical: Theme.spacing.sm },
  tabText: { color: Colors.text2, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.medium },
  tabTextActive: { color: Colors.text },
  tabIndicator: { height: 2, backgroundColor: Colors.gold, marginTop: Theme.spacing.sm, borderRadius: 1 },
  emptyState: { alignItems: 'center', paddingTop: Theme.spacing.xxxl },
  emptyTitle: { color: Colors.text, fontSize: Theme.fontSize.lg, fontWeight: Theme.fontWeight.semibold },
  videoCard: { flex: 1, marginTop: Theme.spacing.lg, maxWidth: '48%' },
  videoThumbWrap: { aspectRatio: 16 / 9, borderRadius: Theme.radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  thumb: { width: '100%', height: '100%' },
  videoTitle: { color: Colors.text, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium, marginTop: Theme.spacing.xs },
  videoMeta: { color: Colors.text2, fontSize: Theme.fontSize.xs, marginTop: 2 },
  gemCard: { flex: 1, marginTop: Theme.spacing.sm, maxWidth: '48%' },
  gemThumbWrap: { aspectRatio: 9 / 16, borderRadius: Theme.radius.sm, overflow: 'hidden', backgroundColor: Colors.surface },
});
