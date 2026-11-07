import { Redirect } from 'expo-router';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Pressable,
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
import { Glyph } from "../../components/Glyph";
import { Theme } from "../../constants/theme";
import { useIsDesktopWeb } from "../../components/DesktopShell";
import { SearchIcon, ClearIcon, GemIcon } from "../../components/Siqa";
import { useSearchContext } from "../../contexts/SearchContext";
import { brandStyles } from '../../lib/ds';
import { guardTabSwipe } from '../../components/useTabSwipe';
import { FeaturedVideoCard, TodaysChai, ChaiHeroCard, SeedsCloseToGoal, FromTheShop, SectionHeader, useHomeChai } from '../../components/home/HomeSections';

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

type Feed = "foryou" | "following";

const CATEGORIES = [
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

function HomeScreenInner() {
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
  // Content stops growing past CONTENT_MAX_WIDTH and centers, so cards
  // don't keep stretching on big monitors.
  const CONTENT_MAX_WIDTH = 1680;
  const availableWidth = isDesktopWeb ? Math.min(windowWidth - SIDEBAR_WIDTH, CONTENT_MAX_WIDTH) : windowWidth;
  // Was a fixed "4 columns above 1100px, forever" rule — cards kept
  // getting narrower as the window grew past that, instead of getting
  // roomier the way YouTube's actual grid does (it's still only 3-4
  // per row on a large monitor, not 6-7, because each card has a
  // minimum width it won't shrink below). This computes columns from
  // a target minimum card width instead of a hardcoded column count,
  // so it naturally lands on fewer, wider cards at typical desktop
  // sizes and still scales up sensibly on very large displays.
  // 320 → 3 per row on a laptop (1440px), 4 on a 1920px monitor —
  // about YouTube's density. 420 gave only 2 huge cards per row.
  const CARD_MIN_WIDTH = 320;
  const GRID_GAP = Theme.spacing.xl;
  const numColumns = isDesktopWeb
    ? Math.max(1, Math.floor((availableWidth - Theme.spacing.lg * 2 + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)))
    : availableWidth > 520 ? 2 : 1;
  const cardWidth =
    numColumns === 1
      ? undefined
      : (availableWidth - Theme.spacing.lg * 2 - GRID_GAP * (numColumns - 1)) / numColumns;

  const [userName, setUserName] = useState<string | null>(null);
  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allLoaded, setAllLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [feed, setFeed] = useState<Feed>("foryou");
  const [signedIn, setSignedIn] = useState(false);
  const [followsNone, setFollowsNone] = useState(false);
  const chaiState = useHomeChai();

  function handleSearchSubmit() {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/browse?search=${encodeURIComponent(trimmed)}` as any);
    }
  }

  const { registerSearch, unregisterSearch } = useSearchContext();
  useFocusEffect(
    useCallback(() => {
      if (!isDesktopWeb) return;
      // Home's own search box did exactly the same thing as the global
      // top bar (navigate to /browse?search=...) — this hands that
      // behavior to the top bar instead of keeping a second identical
      // box on screen.
      registerSearch({
        placeholder: 'Search videos',
        value: searchQuery,
        onChangeText: setSearchQuery,
        onSubmit: handleSearchSubmit,
      });
      return () => unregisterSearch();
    }, [isDesktopWeb, searchQuery])
  );

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
      // Signed in even when the profile has no name yet — fall back to
      // the sign-up name, then the email, so the header never says
      // "Sign In" to someone who is.
      const name =
        data?.full_name?.trim() ||
        String(session.user.user_metadata?.full_name ?? "").trim() ||
        session.user.email?.split("@")[0] ||
        "Account";
      setUserName(name.split(" ")[0]);
      setSignedIn(true);
    } else {
      setUserName(null);
      setSignedIn(false);
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

  async function followedSpeakerIds(): Promise<string[] | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", session.user.id).limit(500);
    const profileIds = (f ?? []).map((r: any) => r.following_id);
    if (!profileIds.length) return [];
    const { data: sp } = await supabase.from("speakers").select("id").in("profile_id", profileIds);
    return (sp ?? []).map((r: any) => r.id);
  }

  async function loadVideos(reset = true, which: Feed = feed) {
    let q = supabase
      .from("videos")
      .select(
        `id, title, thumbnail_url, duration_secs, view_count, published_at, created_at,
         speakers(id, display_name, is_verified)`
      )
      .eq("format", "long")
      .eq("is_published", true);
    if (which === "following") {
      const ids = await followedSpeakerIds();
      if (!ids || !ids.length) {
        setFollowsNone(!!ids);
        setVideos([]); setAllLoaded(true);
        return;
      }
      setFollowsNone(false);
      q = q.in("speaker_id", ids);
    }
    const { data } = await q
      .order("published_at", { ascending: false })
      .range(reset ? 0 : offset, (reset ? 0 : offset) + PAGE_SIZE - 1);

    // Following stays in date order; For you shuffles each batch.
    const rows = which === "following" ? ((data as any[]) ?? []) : shuffle((data as any[]) ?? []);
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

  function switchFeed(next: Feed) {
    if (next === feed) return;
    setFeed(next);
    setVideos([]);
    setAllLoaded(false);
    loadVideos(true, next);
  }

  const pad = Theme.spacing.lg;
  const isForYou = feed === "foryou";
  // For you: the first video is the featured hero, the next two rows sit
  // above the Seeds and Shop sections, and the rest scroll in the list.
  const featured = isForYou ? videos[0] : undefined;
  const topCount = isForYou ? Math.max(2, numColumns * 2) : 0;
  const topVideos = isForYou ? videos.slice(1, 1 + topCount) : [];
  const listVideos = isForYou ? videos.slice(1 + topCount) : videos;

  const renderVideo = (item: LongVideo) => (
    // Hover (lift + thumbnail zoom) comes from the data-hover="card"
    // CSS in public/index.html, which works on every web card.
    <Pressable
      key={item.id}
      style={[styles.videoCard, numColumns > 1 && { paddingHorizontal: 0, width: cardWidth }]}
      onPress={guardTabSwipe(() => router.push(`/watch/${item.id}` as any))}
      {...({ dataSet: { hover: 'card' } } as any)}
    >
      <View style={styles.thumbWrap}>
        {item.thumbnail_url ? (
          <View style={StyleSheet.absoluteFill} {...({ dataSet: { hoverMedia: '1' } } as any)}>
            <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Glyph name="play" size={28} color={C.text3} />
          </View>
        )}
        {item.duration_secs ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration_secs)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.videoMetaRow}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{(item.speakers?.display_name ?? "S").trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.videoMeta}>
            {item.speakers?.display_name ?? "Siqa"}
            {item.speakers?.is_verified ? <Text>{" "}<Glyph name="checkmark-circle" size={13} color={C.text3} /></Text> : null}
          </Text>
          <Text style={styles.videoMeta}>
            {formatViews(item.view_count)} · {timeAgo(item.published_at ?? item.created_at)}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  const chips: { key: string; label: string; active: boolean; onPress: () => void }[] = [
    { key: "foryou", label: "For you", active: feed === "foryou", onPress: () => switchFeed("foryou") },
    { key: "following", label: "Following", active: feed === "following", onPress: () => switchFeed("following") },
    ...CATEGORIES.map((cat) => ({ key: cat, label: cat, active: false, onPress: () => router.push(`/browse?category=${encodeURIComponent(cat)}` as any) })),
  ];

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
      contentContainerStyle={isDesktopWeb ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } : undefined}
      data={listVideos}
      keyExtractor={(v) => v.id}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? { gap: GRID_GAP, paddingHorizontal: Theme.spacing.lg } : undefined}
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
          {/* Both of these duplicate what's already permanently on
              screen once the desktop top bar/sidebar exist: the Siqa
              wordmark is always in the sidebar, the account pill is
              now the avatar in the top bar, and the search box below
              is registered into the top bar's search instead. Mobile
              has none of that, so it still needs all three. */}
          {!isDesktopWeb && (
            <View style={styles.header}>
              <View>
                <Text style={styles.logo}>صِقا</Text>
                <Text style={styles.logoSub}>SIQA</Text>
              </View>
              <TouchableOpacity
                style={styles.authBtn}
                onPress={guardTabSwipe(() =>
                  router.push(userName ? "/(tabs)/dashboard" : ("/(auth)/login" as any))
                )}
              >
                <Text style={[styles.authBtnText, userName && styles.authBtnTextActive]}>
                  {userName ?? "Sign In"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!isDesktopWeb && (
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
          )}

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.chipList, isDesktopWeb && { marginTop: Theme.spacing.lg }]}
            data={chips}
            keyExtractor={(c) => c.key}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item, index }) => (
              <View style={{ flexDirection: "row", alignItems: "center", gap: Theme.spacing.sm }}>
                {index === 2 ? <View style={{ width: 1, height: 20, backgroundColor: C.border }} /> : null}
                <TouchableOpacity
                  style={[styles.chip, item.active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.active }}
                  {...({ dataSet: item.active ? undefined : { hover: 'row' } } as any)}
                  onPress={guardTabSwipe(item.onPress)}
                >
                  <Text style={[styles.chipText, item.active && styles.chipTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              </View>
            )}
          />

          {featured ? (
            isDesktopWeb ? (
              <View style={{ flexDirection: "row", gap: Theme.spacing.xl, paddingHorizontal: pad, marginBottom: Theme.spacing.xxl, alignItems: "flex-start" }}>
                <View style={{ flex: 1.55, minWidth: 0 }}><FeaturedVideoCard video={featured} pad={0} /></View>
                {chaiState.posts.length ? <View style={{ flex: 1, minWidth: 0, maxWidth: 520 }}><ChaiHeroCard chaiState={chaiState} /></View> : null}
              </View>
            ) : (
              <View style={{ marginBottom: Theme.spacing.xl }}><FeaturedVideoCard video={featured} pad={pad} /></View>
            )
          ) : null}

          {isForYou && shorts.length > 0 ? (
            <View style={styles.shortsSection}>
              <View style={styles.shortsLabelRow}>
                <GemIcon size={19} color={C.gold} />
                <Text style={styles.shortsLabel}>Gems</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={shorts}
                keyExtractor={(s) => s.id}
                contentContainerStyle={styles.shortsRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.shortCard, isDesktopWeb && styles.shortCardDesktop]}
                    onPress={guardTabSwipe(() => router.push(`/(tabs)/gems?videoId=${item.id}` as any))}
                    {...({ dataSet: { hover: 'card' } } as any)}
                  >
                    <View style={[styles.shortThumb, isDesktopWeb && styles.shortThumbDesktop, styles.shortThumbClip]}>
                      {item.thumbnail_url ? (
                        <View style={StyleSheet.absoluteFill} {...({ dataSet: { hoverMedia: '1' } } as any)}>
                          <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        </View>
                      ) : (
                        <View style={[StyleSheet.absoluteFill, styles.shortThumbPlaceholder]}>
                          <Glyph name="play" size={22} color={C.text3} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.shortTitle} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : null}

          {isForYou && !isDesktopWeb ? <TodaysChai chaiState={chaiState} pad={pad} /> : null}

          {isForYou && topVideos.length ? (
            <>
              <SectionHeader title="Latest videos" pad={pad} />
              <View style={numColumns > 1 ? { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP, paddingHorizontal: pad } : undefined}>
                {topVideos.map(renderVideo)}
              </View>
            </>
          ) : null}
          {isForYou ? (
            <>
              <SeedsCloseToGoal pad={pad} cardWidth={isDesktopWeb ? 280 : 240} />
              <FromTheShop pad={pad} cardWidth={isDesktopWeb ? 190 : 150} />
              {listVideos.length ? <SectionHeader title="More videos" pad={pad} /> : null}
            </>
          ) : null}

          {!isForYou && videos.length === 0 && !signedIn ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>See videos from people you follow</Text>
              <Text style={styles.emptySubtitle}>Sign in and follow speakers to fill this feed.</Text>
              <TouchableOpacity style={[styles.chip, styles.chipActive, { marginTop: Theme.spacing.lg }]} onPress={() => router.push("/(auth)/sign-in" as any)}>
                <Text style={[styles.chipText, styles.chipTextActive]}>Sign in</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      }
      renderItem={({ item }) => renderVideo(item)}
      ListEmptyComponent={
        !isForYou && !signedIn ? null : isForYou && topVideos.length ? null : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{!isForYou ? (followsNone ? "You're not following anyone yet" : "No new videos from people you follow") : "No videos yet"}</Text>
            <Text style={styles.emptySubtitle}>{!isForYou ? "Follow speakers from their profile to see their videos here." : "Check back soon as creators start posting."}</Text>
          </View>
        )
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={C.gold} style={{ marginVertical: Theme.spacing.xl }} /> : null
      }
    />
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
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
    // Same chip spec as Shop and Seeds: 13px text, ink fill when active.
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: Theme.radius.full,
      backgroundColor: C.surface2,
    },
    chipActive: { backgroundColor: C.text },
    chipText: { color: C.text2, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium },
    chipTextActive: { color: C.bg, fontWeight: Theme.fontWeight.semibold },

    shortsSection: { marginBottom: Theme.spacing.lg },
    shortsLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Theme.spacing.lg,
      marginBottom: Theme.spacing.md,
    },
    shortsLabel: {
      color: C.text,
      fontSize: Theme.fontSize.lg,
      fontWeight: Theme.fontWeight.bold,
      letterSpacing: -0.2,
    },
    shortsRow: { paddingHorizontal: Theme.spacing.lg, gap: Theme.spacing.sm },
    shortCard: { width: 110 },
    shortCardDesktop: { width: 150 },
    shortThumb: { width: 110, height: 190, borderRadius: Theme.radius.md, backgroundColor: C.surface2 },
    shortThumbDesktop: { width: 150, height: 266 },
    shortThumbClip: { overflow: "hidden" },
    shortThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    shortTitle: { color: C.text, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.medium, marginTop: 8, lineHeight: 18 },

    videoCard: { paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.xxl },
    thumbWrap: { aspectRatio: 16 / 9, borderRadius: Theme.radius.lg, overflow: "hidden", backgroundColor: C.surface2 },
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
    avatarPlaceholder: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: C.goldSoft,
      alignItems: "center", justifyContent: "center",
    },
    avatarInitial: { color: C.goldDim, fontSize: 15, fontWeight: Theme.fontWeight.bold },
    videoTitle: { color: C.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, lineHeight: 22, letterSpacing: -0.1 },
    videoMeta: { color: C.text2, fontSize: Theme.fontSize.sm, marginTop: 2 },

    emptyState: { alignItems: "center", paddingTop: Theme.spacing.xxxl * 2 },
    emptyTitle: { color: C.text, fontSize: Theme.fontSize.lg, fontWeight: Theme.fontWeight.semibold },
    emptySubtitle: { color: C.text2, fontSize: Theme.fontSize.base, marginTop: Theme.spacing.xs },
  }));
}

// Not part of the Marketplace site (marketplace.thesiqaapp.com): go to the Shop.
export default function HomeScreen() {
  if (IS_MARKETPLACE_SITE) return <Redirect href={'/marketplace' as any} />;
  return <HomeScreenInner />;
}
