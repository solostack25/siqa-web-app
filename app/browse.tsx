import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import { Theme } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';

const CATEGORIES = [
  'All',
  'Islamic Education',
  'Halal Lifestyle',
  'Community Events',
  'Quran & Hadith',
  'Family & Parenting',
  'Finance',
];

type VideoItem = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
  speakers: {
    id: string;
    display_name: string;
    is_verified: boolean;
  } | null;
};

function formatDuration(secs: number | null) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function BrowseScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = useIsDesktopWeb();
  const width = isDesktopWeb ? windowWidth - 220 : windowWidth;
  const numColumns = width > 1100 ? 4 : width > 800 ? 3 : width > 520 ? 2 : 1;
  const cardWidth = (width - Theme.spacing.lg * 2 - Theme.spacing.md * (numColumns - 1)) / numColumns;

  const params = useLocalSearchParams<{ category?: string; search?: string }>();
  // category/search arrive as URL params from Home's chip taps, Discover's
  // popup, and the search bar — previously this screen never read them at
  // all, so every entry point silently landed on the unfiltered "All" view.
  const [category, setCategory] = useState(params.category ?? 'All');
  const [searchQuery, setSearchQuery] = useState(params.search ?? '');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVideos = useCallback(async (cat: string, search: string) => {
    setLoading(true);
    let query = supabase
      .from('videos')
      .select(
        `id, title, thumbnail_url, duration_secs, view_count, published_at, created_at,
         speakers(id, display_name, is_verified)`
      )
      .eq('format', 'long')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(40);

    if (cat !== 'All') query = query.eq('category', cat);
    if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);

    const { data } = await query;
    setVideos((data as any[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVideos(category, searchQuery);
      // Only re-run this on focus/category change — searchQuery changes
      // are handled by the debounced effect below instead, so typing
      // doesn't refire this on every keystroke via a focus dependency.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category])
  );

  // useFocusEffect only fires on focus events, not on state changes while
  // the screen is already focused — so without this, typing in the search
  // box would silently do nothing until you navigated away and back.
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadVideos(category, searchQuery);
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  return (
    <DesktopShell>
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Videos</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search videos"
          placeholderTextColor={Colors.text3}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipList}
        data={CATEGORIES}
        keyExtractor={(c) => c}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setCategory(item)}
            style={[styles.chip, category === item && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator color={Colors.gold} style={{ marginTop: Theme.spacing.xxxl }} />
      ) : videos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No videos here yet</Text>
          <Text style={styles.emptySubtitle}>Check back soon, or try a different category.</Text>
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={videos}
          keyExtractor={(v) => v.id}
          numColumns={numColumns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={numColumns > 1 ? { gap: Theme.spacing.md } : undefined}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { width: cardWidth }]}
              onPress={() => router.push(`/watch/${item.id}`)}
            >
              <View style={styles.thumbWrap}>
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Text style={{ fontSize: 28, opacity: 0.3 }}>▶</Text>
                  </View>
                )}
                {item.duration_secs ? (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{formatDuration(item.duration_secs)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.speakers?.display_name ?? 'Siqa'}
                {item.speakers?.is_verified ? ' ✓' : ''}
              </Text>
              <Text style={styles.cardMeta}>
                {formatViews(item.view_count)} · {timeAgo(item.published_at ?? item.created_at)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.xl,
    paddingBottom: Theme.spacing.md,
  },
  backArrow: { color: Colors.text, fontSize: 28, fontWeight: Theme.fontWeight.medium },
  headerTitle: { color: Colors.text, fontSize: Theme.fontSize.xl, fontWeight: Theme.fontWeight.bold },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 10,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.border,
    gap: Theme.spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: Colors.text, fontSize: Theme.fontSize.base, padding: 0 },
  searchClear: { color: Colors.text3, fontSize: 14, paddingHorizontal: 4 },
  chipList: { flexGrow: 0, flexShrink: 0 },
  chipRow: {
    paddingHorizontal: Theme.spacing.lg,
    gap: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.surface2,
  },
  chipActive: { backgroundColor: Colors.gold },
  chipText: { color: Colors.text2, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.medium },
  chipTextActive: { color: Colors.bg, fontWeight: Theme.fontWeight.semibold },
  grid: { padding: Theme.spacing.lg, gap: Theme.spacing.xl },
  card: { marginBottom: Theme.spacing.xl },
  thumbWrap: { aspectRatio: 16 / 9, borderRadius: Theme.radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Theme.radius.sm,
  },
  durationText: { color: Colors.white, fontSize: Theme.fontSize.xs, fontWeight: Theme.fontWeight.medium },
  cardTitle: {
    color: Colors.text,
    fontSize: Theme.fontSize.base,
    fontWeight: Theme.fontWeight.semibold,
    marginTop: Theme.spacing.sm,
  },
  cardMeta: { color: Colors.text2, fontSize: Theme.fontSize.sm, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: Theme.spacing.xxxl * 2 },
  emptyTitle: { color: Colors.text, fontSize: Theme.fontSize.lg, fontWeight: Theme.fontWeight.semibold },
  emptySubtitle: { color: Colors.text2, fontSize: Theme.fontSize.base, marginTop: Theme.spacing.xs },
});
