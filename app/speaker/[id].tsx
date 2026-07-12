import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Theme } from '../../constants/theme';

const { width } = Dimensions.get('window');
const CLIP_WIDTH = (width - 28 - 8) / 2;

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
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: true });
    if (id) loadSpeaker(id);
  }, [id]);

  async function loadSpeaker(speakerId: string) {
    const { data } = await supabase
      .from('speakers')
      .select(`
        id, display_name, denomination, state, topics,
        bio, total_raised,
        follower_count, events_count, is_available, profile_id,
        is_verified
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
      .limit(6);

    if (vids) setVideos(vids);
    setLoading(false);
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.replace('/(tabs)/discover');
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (!speaker) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Speaker not found</Text>
      </View>
    );
  }

  const initial = speakerInitial(speaker.display_name);
  const location = [speaker.denomination, speaker.state].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
      >
        {/* Cover */}
        <View style={styles.cover}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.8}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>

        {/* Profile row */}
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.profileBtns}>
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followBtnActive]}
              onPress={() => setFollowing(!following)}
            >
              <Text style={styles.followBtnText}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>

          </View>
        </View>

        {/* Info */}
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

        {/* Stats */}
        <View style={styles.stats}>
          {[
            { val: formatCount(speaker.follower_count), label: 'Followers' },
            { val: formatRaised(speaker.total_raised), label: 'Raised' },
            { val: speaker.events_count?.toString() || '0', label: 'Events/yr' },
            { val: '5.0★', label: 'Rating' },
          ].map((s, i) => (
            <View key={i} style={[styles.stat, i < 3 && styles.statBorder]}>
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Topics */}
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

        {/* Featured Video removed: Siqa now uses Bunny/native Gem videos only. */}

        {/* Gems Grid */}
        {videos.length > 0 && (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>GEMS</Text>
                <Text style={styles.sectionLink}>See all →</Text>
              </View>
              <View style={styles.clipsGrid}>
                {videos.map(v => (
                  <TouchableOpacity key={v.id} style={styles.clipCard} activeOpacity={0.8}>
                    <View style={styles.clipThumb}>
                      {v.thumbnail_url ? (
                        <Image
                          source={{ uri: v.thumbnail_url }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View style={styles.clipPlayOverlay}>
                        <Text style={styles.clipPlayIcon}>▶</Text>
                      </View>
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
        )}
        <View style={styles.divider} />



        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  errorText: { color: Colors.text3, fontSize: 14 },
  scroll: { paddingBottom: 20 },
  cover: {
    height: 200,
    backgroundColor: '#071410',
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top: 54,
    left: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: '#fff', fontSize: 18 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -38,
    marginBottom: 12,
    zIndex: 2,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 22,
    backgroundColor: Colors.emerald,
    borderWidth: 3,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, color: Colors.gold, fontWeight: '700' },
  profileBtns: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: Colors.goldDim,
  },
  followBtnActive: { backgroundColor: Colors.goldBg },
  followBtnText: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  info: { paddingHorizontal: 16, paddingBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 },
  name: { fontSize: 21, fontWeight: '700', color: Colors.text },
  verifiedBadge: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedText: { color: '#000', fontSize: 9, fontWeight: '800' },
  handle: { fontSize: 12, color: Colors.text3, marginBottom: 8 },
  bio: { fontSize: 13, color: Colors.text2, lineHeight: 20, marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: Colors.text3 },
  stats: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    borderRadius: Theme.radius.lg,
    overflow: 'hidden',
  },
  stat: { flex: 1, paddingVertical: 11, paddingHorizontal: 4, alignItems: 'center' },
  statBorder: { borderRightWidth: 0.5, borderRightColor: Colors.border2 },
  statVal: { fontSize: 16, fontWeight: '700', color: Colors.gold },
  statLabel: { fontSize: 8, color: Colors.text3, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },
  topics: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 14 },
  topic: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: Colors.emeraldBg,
    borderWidth: 0.5,
    borderColor: 'rgba(61,190,138,0.15)',
  },
  topicText: { fontSize: 11, color: Colors.emeraldLight, fontWeight: '500' },
  divider: { height: 0.5, backgroundColor: Colors.border2, marginHorizontal: 14, marginBottom: 16 },
  section: { paddingHorizontal: 14, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: Colors.text3, letterSpacing: 1.8, textTransform: 'uppercase' },
  sectionBadge: { fontSize: 11, color: Colors.gold },
  sectionLink: { fontSize: 12, color: Colors.gold },
  featuredCard: { backgroundColor: Colors.surface, borderRadius: Theme.radius.lg, overflow: 'hidden' },
  featuredThumb: {
    aspectRatio: 16 / 9,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  webview: { flex: 1 },
  featuredOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  featuredPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(201,168,76,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredPlayIcon: { color: '#000', fontSize: 20, marginLeft: 3 },
  featuredInfo: { padding: 12 },
  featuredLabel: { fontSize: 9, color: Colors.gold, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  featuredTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  clipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clipCard: { width: CLIP_WIDTH, backgroundColor: Colors.surface, borderRadius: Theme.radius.lg, overflow: 'hidden' },
  clipThumb: {
    aspectRatio: 9 / 16,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clipPlayOverlay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(201,168,76,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipPlayIcon: { color: '#000', fontSize: 14, marginLeft: 2 },
  clipInfo: { padding: 10 },
  clipTitle: { fontSize: 11, fontWeight: '500', color: Colors.text, lineHeight: 15, marginBottom: 3 },
  clipViews: { fontSize: 10, color: Colors.text3 },
});