import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme, type AppColors } from "../../lib/theme";
import { Theme, HEADER_TOP_PADDING } from "../../constants/theme";
import { useIsDesktopWeb } from "../../components/DesktopShell";

type Fundraiser = {
  id: string;
  title: string;
  goal_amount: number;
  raised_amount: number;
  donor_count: number;
  status: string;
  org_id: string | null;
  cause_category: string | null;
  end_date: string | null;
  video_url?: string | null;
  bunny_video_url?: string | null;
  media_url?: string | null;
  cover_image_url?: string | null;
  image_url?: string | null;
  description?: string | null;
  story?: string | null;
  organizations: {
    org_name: string;
    org_type: string | null;
    is_verified: boolean;
  } | null;
};

const CATEGORIES = [
  "All",
  "Water",
  "Education",
  "Medical",
  "Masjid",
  "Emergency",
];

export default function SeedsScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  // These cards are content-heavy (video, org row, story text, 5 stats,
  // a button) — much richer than a simple product tile — so even on a
  // wide desktop screen this stays at 2-3 columns rather than the 4+ a
  // lighter card could support, or the cards themselves get cramped.
  const numColumns = isDesktopWeb ? (windowWidth > 1500 ? 3 : 2) : 1;
  const styles = makeStyles(C);

  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [filtered, setFiltered] = useState<Fundraiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [playingSeedId, setPlayingSeedId] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [userOrgIds, setUserOrgIds] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    loadFundraisers();
    checkCreateAccess();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFundraisers();
    }, []),
  );

  async function checkCreateAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || "";
    setUserRole(role);
    const privileged = ["admin", "owner", "moderator", "super_admin"].includes(role);
    const orgRole = ["org", "organization", "nonprofit", "masjid"].includes(role);

    if (privileged || orgRole) {
      setCanCreate(true);
      const { data: orgsData } = await supabase.from('organizations').select('id').eq('profile_id', user.id).limit(10);
      if (orgsData) setUserOrgIds(orgsData.map((o: any) => o.id));
      if (!privileged) return;
    }

    // Also allow if user has a linked org (even without org role)
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1);

    if (orgs && orgs.length > 0) {
      setCanCreate(true);
      setUserOrgIds(orgs.map((o: any) => o.id));
    }
  }

  useEffect(() => {
    if (activeCategory === "All") {
      setFiltered(fundraisers);
    } else {
      setFiltered(
        fundraisers.filter(
          (f) =>
            f.cause_category?.toLowerCase() === activeCategory.toLowerCase(),
        ),
      );
    }
  }, [activeCategory, fundraisers]);

  async function loadFundraisers() {
    setLoading(true);

    const activeStatuses = ["active", "published", "approved", "live"];

    async function runQuery(selectFields: string) {
      return supabase
        .from("fundraisers")
        .select(selectFields)
        .in("status", activeStatuses)
        .order("created_at", { ascending: false })
        .limit(30);
    }

    const fullSelect = `
      id, org_id, title, description, story, goal_amount, raised_amount,
      donor_count, status, cause_category, end_date, video_url, bunny_video_url, media_url, cover_image_url, image_url,
      organizations(org_name, org_type, is_verified)
    `;

    const safeSelect = `
      id, org_id, title, goal_amount, raised_amount,
      donor_count, status, cause_category, end_date,
      organizations(org_name, org_type, is_verified)
    `;

    let { data, error } = await runQuery(fullSelect);

    // Some existing Supabase fundraisers tables may not have the new video-first Seed columns yet.
    // Fall back to the older schema so active Seeds still show instead of showing an empty list.
    if (error) {
      console.warn(
        "Seeds full query failed; retrying legacy Seed query:",
        error.message,
      );
      const fallback = await runQuery(safeSelect);
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && data) {
      setFundraisers(data as any);
      setFiltered(data as any);
    } else if (error) {
      console.warn("Could not load active Seeds:", error.message);
      setFundraisers([]);
      setFiltered([]);
    }
    setLoading(false);
  }

  function formatMoney(cents: number) {
    const d = cents / 100;
    if (d >= 1000000) return "$" + (d / 1000000).toFixed(1) + "M";
    if (d >= 1000) return "$" + (d / 1000).toFixed(0) + "k";
    return "$" + d.toFixed(0);
  }

  function daysLeft(endDate: string | null): number | null {
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    const d = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return d > 0 ? d : null;
  }

  function getCategoryEmoji(cat: string | null) {
    const map: Record<string, string> = {
      water: "💧",
      education: "📚",
      medical: "🏥",
      masjid: "🕌",
      emergency: "🆘",
    };
    return map[cat?.toLowerCase() ?? ""] ?? "🌿";
  }

  function getSeedVideoUrl(item: Fundraiser) {
    return item.video_url || item.bunny_video_url || item.media_url || null;
  }

  async function deleteSeed(id: string) {
    Alert.alert(
      'Delete Seed?',
      'This will permanently delete this campaign. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('fundraisers').delete().eq('id', id);
            if (error) {
              Alert.alert('Error', 'Could not delete seed. Please try again.');
              return;
            }
            setFundraisers(prev => prev.filter(f => f.id !== id));
          },
        },
      ]
    );
  }

  function renderCard({ item }: { item: Fundraiser }) {
    const org = item.organizations;
    const pct = item.goal_amount
      ? Math.min(Math.round((item.raised_amount / item.goal_amount) * 100), 100)
      : 0;
    const emoji = getCategoryEmoji(item.cause_category);
    const left = daysLeft(item.end_date);
    const videoUrl = getSeedVideoUrl(item);
    const hasVideo = Boolean(videoUrl);
    const coverUrl = item.cover_image_url || item.image_url || null;
    const isPlaying = playingSeedId === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.orgRow}>
          <View style={styles.orgAvatar}>
            <Text style={styles.orgAvatarText}>{emoji}</Text>
          </View>
          <View style={styles.orgInfo}>
            <Text style={styles.orgName}>
              {org?.org_name ?? "Organization"}
            </Text>
            <View style={styles.orgMeta}>
              {org?.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              )}
              {item.cause_category && (
                <Text style={styles.categoryText}>{item.cause_category}</Text>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.videoCard}
          onPress={() => {
            if (!videoUrl) return;
            setPlayingSeedId((prev) => (prev === item.id ? null : item.id));
          }}
        >
          {videoUrl ? (
            <Video
              key={item.id}
              source={{ uri: videoUrl }}
              style={styles.videoCover}
              resizeMode={ResizeMode.COVER}
              shouldPlay={isPlaying}
              isLooping
              useNativeControls={false}
              onError={(error) =>
                console.warn("Seed video playback error:", error)
              }
            />
          ) : coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.videoCover} />
          ) : null}
          <View style={styles.videoScrim} />
          {!isPlaying && (
            <View style={styles.playCircle}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          )}
          <Text style={styles.videoLabel}>
            {hasVideo
              ? isPlaying
                ? "Playing Appeal"
                : "Tap to play appeal"
              : "Video pending"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push({ pathname: "/seed/[id]", params: { id: item.id } } as any)}
        >
          <Text style={[styles.title, numColumns > 1 && styles.titleCompact]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.story || item.description ? (
            <Text style={[styles.story, numColumns > 1 && styles.storyCompact]} numberOfLines={3}>
              {item.story || item.description}
            </Text>
          ) : null}
        </TouchableOpacity>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statVal, numColumns > 1 && styles.statValCompact]}>
              {formatMoney(item.raised_amount)}
            </Text>
            <Text style={styles.statLabel}>RAISED</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, numColumns > 1 && styles.statValCompact]}>{formatMoney(item.goal_amount)}</Text>
            <Text style={styles.statLabel}>GOAL</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, numColumns > 1 && styles.statValCompact]}>{pct}%</Text>
            <Text style={styles.statLabel}>FUNDED</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, numColumns > 1 && styles.statValCompact]}>
              {(item.donor_count ?? 0).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>DONORS</Text>
          </View>
          {left !== null && (
            <View style={styles.stat}>
              <Text
                style={[styles.statVal, numColumns > 1 && styles.statValCompact, { color: left <= 7 ? C.live : C.gold }]}
              >
                {left}
              </Text>
              <Text style={styles.statLabel}>DAYS LEFT</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.donateBtn}
          onPress={() =>
            router.push({
              pathname: "/seed/[id]",
              params: { id: item.id },
            } as any)
          }
        >
          <Text style={styles.donateBtnText}>🌱 Plant a Seed</Text>
        </TouchableOpacity>
        {(userRole === 'admin' || (item.org_id && userOrgIds.includes(item.org_id))) && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteSeed(item.id)}
          >
            <Text style={styles.deleteBtnText}>Delete Seed</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Seeds</Text>
          <Text style={styles.headerSub}>Plant your seeds</Text>
        </View>
        {canCreate && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push("/seed-create" as any)}
          >
            <Text style={styles.createBtnText}>＋ New Seed</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={CATEGORIES}
        keyExtractor={(c) => c}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesList}
        contentContainerStyle={styles.categories}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[
              styles.catPill,
              activeCategory === cat && styles.catPillActive,
            ]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text
              style={[
                styles.catText,
                activeCategory === cat && styles.catTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: Theme.spacing.lg } : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌿</Text>
              <Text style={styles.emptyTitle}>No active seeds</Text>
              <Text style={styles.emptySub}>
                Check back soon for active fundraising campaigns.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 60,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Theme.spacing.xl,
      paddingTop: HEADER_TOP_PADDING,
      paddingBottom: Theme.spacing.md,
    },
    headerTitle: {
      fontSize: Theme.fontSize.xxl,
      fontWeight: Theme.fontWeight.semibold,
      color: C.text,
    },
    headerSub: {
      fontSize: Theme.fontSize.xs,
      color: C.text3,
      marginTop: 2,
    },
    createBtn: {
      backgroundColor: C.gold,
      borderRadius: Theme.radius.full,
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: 8,
    },
    createBtnText: {
      color: C.black,
      fontSize: Theme.fontSize.sm,
      fontWeight: Theme.fontWeight.bold,
    },
    categoriesList: {
      flexGrow: 0,
      flexShrink: 0,
      height: 32 + Theme.spacing.md,
    },
    categories: {
      paddingHorizontal: Theme.spacing.lg,
      paddingBottom: Theme.spacing.md,
      gap: Theme.spacing.sm,
      alignItems: 'center',
    },
    catPill: {
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: 6,
      height: 32,
      borderRadius: Theme.radius.full,
      backgroundColor: C.surface,
      borderWidth: 0.5,
      borderColor: C.border2,
      alignItems: "center",
      justifyContent: "center",
    },
    catPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    catText: {
      fontSize: Theme.fontSize.sm,
      color: C.text2,
      fontWeight: Theme.fontWeight.medium,
    },
    catTextActive: { color: C.black, fontWeight: Theme.fontWeight.bold },
    list: {
      padding: Theme.spacing.lg,
      gap: Theme.spacing.lg,
      paddingBottom: 100,
      maxWidth: 1400,
      width: '100%',
      alignSelf: 'center',
    },
    card: {
      flex: 1,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.xl,
      borderWidth: 0.5,
      borderColor: C.border2,
      padding: Theme.spacing.lg,
    },
    videoCard: {
      height: 180,
      borderRadius: Theme.radius.lg,
      backgroundColor: C.bg,
      overflow: "hidden",
      borderWidth: 0.5,
      borderColor: C.border2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Theme.spacing.md,
    },
    videoCover: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
    },
    videoScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.38)",
    },
    playCircle: {
      width: 54,
      height: 54,
      borderRadius: 999,
      backgroundColor: C.gold,
      alignItems: "center",
      justifyContent: "center",
    },
    playIcon: {
      color: C.black,
      fontSize: 22,
      fontWeight: "900",
      marginLeft: 3,
    },
    videoLabel: {
      position: "absolute",
      left: 12,
      bottom: 10,
      color: "white",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    orgRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Theme.spacing.md,
      marginBottom: Theme.spacing.md,
    },
    orgAvatar: {
      width: 40,
      height: 40,
      borderRadius: Theme.radius.sm,
      backgroundColor: C.emeraldBg,
      alignItems: "center",
      justifyContent: "center",
    },
    orgAvatarText: { fontSize: 20 },
    orgInfo: { flex: 1 },
    orgName: {
      fontSize: Theme.fontSize.lg,
      fontWeight: Theme.fontWeight.semibold,
      color: C.text,
    },
    orgMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: Theme.spacing.sm,
      marginTop: 2,
    },
    verifiedBadge: {
      backgroundColor: C.emeraldBg,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    verifiedText: {
      color: C.emeraldLight,
      fontSize: 11,
      fontWeight: Theme.fontWeight.bold,
    },
    categoryText: {
      fontSize: Theme.fontSize.sm,
      color: C.text3,
      textTransform: "capitalize",
    },
    title: {
      // Was Theme.fontSize.base (14) — LaunchGood's campaign titles run
      // closer to 26-28px bold, and everything below (story text, stat
      // numbers, labels) was sized down to match that same small base,
      // which is why the whole card read smaller/flatter than theirs.
      fontSize: Theme.fontSize.xxl,
      fontWeight: Theme.fontWeight.bold,
      color: C.text,
      lineHeight: 28,
      marginBottom: Theme.spacing.sm,
    },
    // Card width dropped a lot once Seeds went to a multi-column desktop
    // grid (each card now shares a row instead of taking the full page
    // width), but the font sizes above didn't account for that — they'd
    // also just been bumped a second time by the separate app-wide type
    // scale increase, on top of the LaunchGood-inspired bump already
    // applied here. That compounding is what made a 25px bold title
    // wrapping to 2 lines feel oversized in a ~450px column. These only
    // apply when the grid is actually multi-column (numColumns > 1);
    // mobile's full-width single card keeps the larger sizes.
    titleCompact: { fontSize: Theme.fontSize.lg, lineHeight: 23 },
    storyCompact: { fontSize: Theme.fontSize.sm, lineHeight: 18 },
    story: {
      fontSize: Theme.fontSize.base,
      color: C.text2,
      lineHeight: 22,
      marginBottom: Theme.spacing.md,
    },
    progressWrap: { marginBottom: Theme.spacing.md },
    progressTrack: {
      height: 5,
      backgroundColor: C.surface2,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: C.emeraldLight,
      borderRadius: 3,
    },
    stats: { flexDirection: "row", marginBottom: Theme.spacing.md },
    stat: { flex: 1, alignItems: "center" },
    statVal: {
      // Was Theme.fontSize.base (14) — LaunchGood's raised-amount figure
      // is the single most prominent number on the card, closer to
      // 32-36px. This isn't quite that large since Siqa fits 5 stats in
      // a row rather than one big standalone figure, but it needed to
      // read as a real number, not a caption.
      fontSize: Theme.fontSize.xl,
      fontWeight: Theme.fontWeight.bold,
      color: C.gold,
    },
    statValCompact: { fontSize: Theme.fontSize.base },
    statLabel: {
      fontSize: Theme.fontSize.xs,
      color: C.text3,
      marginTop: 3,
      letterSpacing: 0.5,
    },
    deleteBtn: {
      marginTop: 8,
      paddingVertical: 10,
      borderRadius: Theme.radius.md,
      borderWidth: 0.5,
      borderColor: 'rgba(232,69,69,0.4)',
      alignItems: 'center',
    },
    deleteBtnText: {
      color: '#e84545',
      fontSize: Theme.fontSize.sm,
      fontWeight: '600',
    },
    donateBtn: {
      backgroundColor: C.gold,
      borderRadius: Theme.radius.md,
      paddingVertical: Theme.spacing.lg,
      paddingHorizontal: Theme.spacing.md,
      alignItems: "center",
    },
    donateBtnText: {
      color: C.black,
      fontSize: Theme.fontSize.lg,
      fontWeight: Theme.fontWeight.bold,
    },
    empty: { alignItems: "center", paddingTop: 60, gap: Theme.spacing.md },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: {
      fontSize: Theme.fontSize.lg,
      fontWeight: Theme.fontWeight.semibold,
      color: C.text2,
    },
    emptySub: {
      fontSize: Theme.fontSize.md,
      color: C.text3,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: Theme.spacing.xl,
    },
  });
}