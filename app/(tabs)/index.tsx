import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme, type AppColors } from "../../lib/theme";
import { Theme } from "../../constants/theme";
import { useIsDesktopWeb } from "../../components/DesktopShell";
import { SearchIcon, ClearIcon } from "../../components/Siqa";

type LongVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
  speakers: { id: string; display_name: string; is_verified: boolean } | null;
};

type ShortVideo = {
  id: string;
  thumbnail_url: string | null;
  title: string;
};

const CATEGORIES = [
  "All",
  "Islamic Education",
  "Halal Lifestyle",
  "Community Events",
  "Quran & Hadith",
  "Family & Parenting",
  "Finance",
];

const PAGE_SIZE = 12;

function formatDuration(secs: number | null) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} view${n === 1 ? "" : "s"}`;
}

// Fisher-Yates shuffle — shuffles the display order of an already-fetched
// batch without touching which items get fetched, so pagination (via
// .range()) stays correct across "load more" calls.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function timeAgo(ts: string | null) {
  if (!ts) return "";
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function HomeScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const { width: windowWidth } = useWindowDimensions();
  const SIDEBAR_WIDTH = 220;
  const isDesktopWeb = useIsDesktopWeb();
  // On desktop web the sidebar (see app/(tabs)/_layout.tsx) eats a fixed
  // 220px on the left — the FlatList's real available width is the window
  // minus that, not the full window. Using raw window width here previously
  // both overestimated space AND was capped at an arbitrary 1600px, which
  // left a dead empty column on wide monitors instead of filling it.
  const availableWidth = isDesktopWeb ? windowWidth - SIDEBAR_WIDTH : windowWidth;
  const numColumns = availableWidth > 1100 ? 4 : availableWidth > 800 ? 3 : availableWidth > 520 ? 2 : 1;
  const cardWidth =
    numColumns === 1
      ? undefined
      : (availableWidth - Theme.spacing.lg * 2 - Theme.spacing.md * (numColumns - 1)) / numColumns;

  const [userName, setUserName] = useState<string | null>(null);
  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allLoaded, setAllLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearchSubmit() {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/browse?search=${encodeURIComponent(trimmed)}` as any);
    }
  }

  async function checkAuth() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();
      if (data?.full_name) setUserName(data.full_name.split(" ")[0]);
    } else {
      setUserName(null);
    }
  }

  async function loadShorts() {
    const { data } = await supabase
      .from("videos")
      .select("id, thumbnail_url, title")
      .eq("format", "short")
      .eq("is_published", true)
      .not("video_url", "is", null)
      .order("published_at", { ascending: false })
      .limit(10);
    setShorts((data as any[]) ?? []);
  }

  async function loadVideos(reset = true) {
    const { data } = await supabase
      .from("videos")
      .select(
        `id, title, thumbnail_url, duration_secs, view_count, published_at, created_at,
         speakers(id, display_name, is_verified)`
      )
      .eq("format", "long")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .range(reset ? 0 : offset, (reset ? 0 : offset) + PAGE_SIZE - 1);

    const rows = shuffle((data as any[]) ?? []);
    if (reset) {
      setVideos(rows);
      setOffset(PAGE_SIZE);
      setAllLoaded(rows.length < PAGE_SIZE);
    } else {
      setVideos((prev) => [...prev, ...rows]);
      setOffset((prev) => prev + PAGE_SIZE);
      if (rows.length < PAGE_SIZE) setAllLoaded(true);
    }
  }

  async function loadAll() {
    await Promise.all([checkAuth(), loadShorts(), loadVideos(true)]);
    setLoading(false);
    setRefreshing(false);
  }

  async function loadMore() {
    if (loadingMore || allLoaded) return;
    setLoadingMore(true);
    await loadVideos(false);
    setLoadingMore(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      key={numColumns}
      style={styles.container}
      data={videos}
      keyExtractor={(v) => v.id}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? { gap: Theme.spacing.md, paddingHorizontal: Theme.spacing.lg } : undefined}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadAll();
          }}
          tintColor={C.gold}
        />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <View>
              <Text style={styles.logo}>صِقا</Text>
              <Text style={styles.logoSub}>SIQA</Text>
            </View>
            <TouchableOpacity
              style={styles.authBtn}
              onPress={() =>
                router.push(userName ? "/(tabs)/dashboard" : ("/(auth)/login" as any))
              }
            >
              <Text style={[styles.authBtnText, userName && styles.authBtnTextActive]}>
                {userName ?? "Sign In"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <SearchIcon size={16} color={C.text3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search videos"
              placeholderTextColor={C.text3}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <ClearIcon size={16} color={C.text3} />
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
                style={[styles.chip, item === "All" && styles.chipActive]}
                onPress={() => {
                  if (item !== "All") router.push(`/browse?category=${encodeURIComponent(item)}` as any);
                }}
              >
                <Text style={[styles.chipText, item === "All" && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />

          {shorts.length > 0 ? (
            <View style={styles.shortsSection}>
              <Text style={styles.shortsLabel}>⚡ Shorts</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={shorts}
                keyExtractor={(s) => s.id}
                contentContainerStyle={styles.shortsRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.shortCard}
                    onPress={() => router.push(`/(tabs)/gems?videoId=${item.id}` as any)}
                  >
                    {item.thumbnail_url ? (
                      <Image source={{ uri: item.thumbnail_url }} style={styles.shortThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.shortThumb, styles.shortThumbPlaceholder]}>
                        <Text style={{ fontSize: 22, opacity: 0.4 }}>▶</Text>
                      </View>
                    )}
                    <Text style={styles.shortTitle} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.videoCard, numColumns > 1 && { paddingHorizontal: 0, width: cardWidth }]}
          onPress={() => router.push(`/watch/${item.id}` as any)}
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

          <View style={styles.videoMetaRow}>
            <View style={styles.avatarPlaceholder} />
            <View style={{ flex: 1 }}>
              <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.videoMeta}>
                {item.speakers?.display_name ?? "Siqa"}
                {item.speakers?.is_verified ? " ✓" : ""}
              </Text>
              <Text style={styles.videoMeta}>
                {formatViews(item.view_count)} · {timeAgo(item.published_at ?? item.created_at)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptySubtitle}>Check back soon as creators start posting.</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={C.gold} style={{ marginVertical: Theme.spacing.xl }} /> : null
      }
    />
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Theme.spacing.xl,
      paddingTop: Platform.OS === "web" ? Theme.spacing.lg : 60,
      paddingBottom: Theme.spacing.md,
    },
    logo: { fontSize: 28, color: C.gold },
    logoSub: { fontSize: 9, color: C.text3, letterSpacing: 3, marginTop: -4 },
    authBtn: {
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: Theme.spacing.sm,
      borderRadius: Theme.radius.full,
      borderWidth: 0.5,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    authBtnText: { fontSize: Theme.fontSize.sm, color: C.text2 },
    authBtnTextActive: { color: C.gold },

    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: Theme.spacing.lg,
      marginBottom: Theme.spacing.lg,
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: 9,
      borderRadius: Theme.radius.full,
      backgroundColor: C.surface,
      borderWidth: 0.5,
      borderColor: C.border,
      gap: Theme.spacing.sm,
      maxWidth: 380,
    },
    searchInput: { flex: 1, color: C.text, fontSize: Theme.fontSize.base, padding: 0 },

    chipList: { flexGrow: 0, flexShrink: 0 },
    chipRow: {
      paddingHorizontal: Theme.spacing.lg,
      gap: Theme.spacing.sm,
      paddingBottom: Theme.spacing.lg,
      alignItems: "center",
    },
    chip: {
      paddingHorizontal: Theme.spacing.lg,
      paddingVertical: Theme.spacing.sm,
      borderRadius: Theme.radius.full,
      backgroundColor: C.surface2,
    },
    chipActive: { backgroundColor: C.gold },
    chipText: { color: C.text2, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.medium },
    chipTextActive: { color: C.bg, fontWeight: Theme.fontWeight.semibold },

    shortsSection: { marginBottom: Theme.spacing.lg },
    shortsLabel: {
      color: C.text,
      fontSize: Theme.fontSize.base,
      fontWeight: Theme.fontWeight.semibold,
      paddingHorizontal: Theme.spacing.lg,
      marginBottom: Theme.spacing.sm,
    },
    shortsRow: { paddingHorizontal: Theme.spacing.lg, gap: Theme.spacing.sm },
    shortCard: { width: 110 },
    shortThumb: { width: 110, height: 190, borderRadius: Theme.radius.md, backgroundColor: C.surface },
    shortThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    shortTitle: { color: C.text2, fontSize: Theme.fontSize.xs, marginTop: 6 },

    videoCard: { paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.xl },
    thumbWrap: { aspectRatio: 16 / 9, borderRadius: Theme.radius.md, overflow: "hidden", backgroundColor: C.surface },
    thumb: { width: "100%", height: "100%" },
    thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    durationBadge: {
      position: "absolute",
      bottom: 6,
      right: 6,
      backgroundColor: "rgba(0,0,0,0.85)",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Theme.radius.sm,
    },
    durationText: { color: "#fff", fontSize: Theme.fontSize.xs, fontWeight: Theme.fontWeight.medium },

    videoMetaRow: { flexDirection: "row", gap: Theme.spacing.sm, marginTop: Theme.spacing.sm },
    avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.goldSoft },
    videoTitle: { color: C.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold },
    videoMeta: { color: C.text2, fontSize: Theme.fontSize.sm, marginTop: 2 },

    emptyState: { alignItems: "center", paddingTop: Theme.spacing.xxxl * 2 },
    emptyTitle: { color: C.text, fontSize: Theme.fontSize.lg, fontWeight: Theme.fontWeight.semibold },
    emptySubtitle: { color: C.text2, fontSize: Theme.fontSize.base, marginTop: Theme.spacing.xs },
  });
}
