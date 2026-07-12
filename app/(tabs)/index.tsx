import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme, type AppColors } from "../../lib/theme";
import { Theme } from "../../constants/theme";

type Video = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  like_count: number;
  comment_count: number;
  view_count: number;
  topics: string[];
  speakers: {
    id: string;
    display_name: string;
    denomination: string | null;
    state: string | null;
  } | null;
};

type Fundraiser = {
  id: string;
  org_id: string | null;
  title: string;
  goal_amount: number;
  raised_amount: number;
  donor_count: number;
  cause_category: string | null;
  organizations: { org_name: string; is_verified: boolean } | null;
};

type Speaker = {
  id: string;
  display_name: string;
  denomination: string | null;
  state: string | null;
  topics: string[];
};

const FILTERS = ["All", "🎬 Gems", "🌿 Seeds", "🎤 Speakers"];

const EVENTS = [
  {
    month: "MAY",
    day: "17",
    title: "Islamic Unity Conference",
    venue: "George R. Brown Convention Center",
    city: "Houston, TX",
    speakers: ["Omar Suleiman", "Yasmin Mogahed"],
    rsvp: 1240,
  },
  {
    month: "JUN",
    day: "7",
    title: "Quran & Sunnah Seminar",
    venue: "ISGH Main Center",
    city: "Houston, TX",
    speakers: ["Yasir Qadhi"],
    rsvp: 430,
  },
];

export default function HomeScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const [videos, setVideos] = useState<Video[]>([]);
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    loadAll();
    checkAuth();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
      checkAuth();
    }, []),
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
      if (data?.full_name) setUserName(data.full_name.split(" ")[0]);
    }
  }

  async function loadAll() {
    const activeStatuses = ["active", "published", "approved", "live"];

    const videosPromise = supabase
      .from("videos")
      .select(
        `id, title, description, video_url, thumbnail_url, like_count, comment_count, view_count, topics, speakers(id, display_name, denomination, state)`,
      )
      .eq("is_published", true)
      .eq("platform", "bunny")
      .not("video_url", "is", null)
      .order("published_at", { ascending: false })
      .limit(6);

    const speakersPromise = supabase
      .from("speakers")
      .select(`id, display_name, denomination, state, topics`)
      .eq("approval_status", "approved")
      .order("follower_count", { ascending: false })
      .limit(6);

    let fundraisersPromise = supabase
      .from("fundraisers")
      .select(
        `id, org_id, title, goal_amount, raised_amount, donor_count, cause_category, status, video_url, bunny_video_url, media_url, cover_image_url, image_url, organizations(org_name, is_verified)`,
      )
      .in("status", activeStatuses)
      .order("created_at", { ascending: false })
      .limit(6);

    const [videosRes, fundraisersResInitial, speakersRes] = await Promise.all([
      videosPromise,
      fundraisersPromise,
      speakersPromise,
    ]);

    let fundraisersRes = fundraisersResInitial;
    if (fundraisersResInitial.error) {
      console.warn(
        "Home Seed query failed; retrying legacy Seed query:",
        fundraisersResInitial.error.message,
      );
      fundraisersRes = await supabase
        .from("fundraisers")
        .select(
          `id, org_id, title, goal_amount, raised_amount, donor_count, cause_category, status, organizations(org_name, is_verified)`,
        )
        .in("status", activeStatuses)
        .order("created_at", { ascending: false })
        .limit(6);
    }

    if (videosRes.data) setVideos(videosRes.data as any);
    if (fundraisersRes.data) setFundraisers(fundraisersRes.data as any);
    if (speakersRes.data) setSpeakers(speakersRes.data);
    setLoading(false);
    setRefreshing(false);
  }

  function fmtMoney(cents: number) {
    const d = cents / 100;
    if (d >= 1000000) return "$" + (d / 1000000).toFixed(1) + "M";
    if (d >= 1000) return "$" + (d / 1000).toFixed(0) + "k";
    return "$" + d.toFixed(0);
  }

  function speakerInitial(name: string) {
    return name
      .replace(/^(Sh\.|Dr\.|Imam|Ustadha|Ustadh)\s+/i, "")
      .charAt(0)
      .toUpperCase();
  }

  function catEmoji(cat: string | null) {
    const map: Record<string, string> = {
      water: "💧",
      education: "📚",
      medical: "🏥",
      masjid: "🕌",
      emergency: "🆘",
    };
    return map[cat?.toLowerCase() ?? ""] ?? "🌿";
  }

  const showGems = activeFilter === "All" || activeFilter === "🎬 Gems";
  const showSeeds = activeFilter === "All" || activeFilter === "🌿 Seeds";
  const showSpeakers = activeFilter === "All" || activeFilter === "🎤 Speakers";
  const showEvents = activeFilter === "All";

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>صِقا</Text>
          <Text style={styles.logoSub}>SIQA</Text>
        </View>
        <TouchableOpacity
          style={styles.authBtn}
          onPress={() =>
            router.push(
              userName ? "/(tabs)/dashboard" : ("/(auth)/login" as any),
            )
          }
        >
          <Text
            style={[styles.authBtnText, userName && styles.authBtnTextActive]}
          >
            {userName ?? "Sign In"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterPill,
              activeFilter === f && styles.filterPillActive,
            ]}
            onPress={() => setActiveFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === f && styles.filterTextActive,
              ]}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feed}
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
      >
        {/* GEMS SECTION */}
        {showGems && videos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Gems</Text>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/gems" as any)}
              >
                <Text style={styles.sectionLink}>View All →</Text>
              </TouchableOpacity>
            </View>
            {videos.map((item) => {
              const speaker = item.speakers;
              const initial = speakerInitial(speaker?.display_name ?? "?");
              return (
                <View key={item.id} style={styles.gemCard}>
                  <View style={styles.gemHeader}>
                    <TouchableOpacity
                      style={styles.avatar}
                      onPress={() =>
                        speaker?.id &&
                        router.push(`/speaker/${speaker.id}` as any)
                      }
                    >
                      <Text style={styles.avatarText}>{initial}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.speakerInfo}
                      onPress={() =>
                        speaker?.id &&
                        router.push(`/speaker/${speaker.id}` as any)
                      }
                    >
                      <Text style={styles.speakerName}>
                        {speaker?.display_name ?? "Speaker"}
                      </Text>
                      <Text style={styles.speakerMeta}>
                        {[speaker?.denomination, speaker?.state]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.followBtn}>
                      <Text style={styles.followBtnText}>Follow</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.thumb}
                    onPress={() => router.push("/(tabs)/gems" as any)}
                    activeOpacity={0.9}
                  >
                    {item.thumbnail_url ? (
                      <Image
                        source={{ uri: item.thumbnail_url }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder} />
                    )}
                    <View style={styles.playBtn}>
                      <Text style={styles.playIcon}>▶</Text>
                    </View>
                    {item.title ? (
                      <Text style={styles.vidLabel} numberOfLines={1}>
                        {item.title}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                  <View style={styles.gemActions}>
                    <TouchableOpacity style={styles.action}>
                      <Text style={styles.actionIcon}>♡</Text>
                      <Text style={styles.actionText}>
                        {item.like_count >= 1000
                          ? `${(item.like_count / 1000).toFixed(1)}k`
                          : item.like_count}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action}>
                      <Text style={styles.actionIcon}>💬</Text>
                      <Text style={styles.actionText}>
                        {item.comment_count}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action}>
                      <Text style={styles.actionIcon}>↗</Text>
                      <Text style={styles.actionText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                  {item.topics?.length > 0 && (
                    <View style={styles.tags}>
                      {item.topics.slice(0, 3).map((t) => (
                        <View key={t} style={styles.tag}>
                          <Text style={styles.tagText}>#{t.toLowerCase()}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* EVENTS SECTION */}
        {showEvents && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Events Near You</Text>
            </View>
            {EVENTS.map((e, i) => (
              <View key={i} style={styles.eventCard}>
                <View style={styles.eventTop}>
                  <View style={styles.eventDateBadge}>
                    <Text style={styles.eventMonth}>{e.month}</Text>
                    <Text style={styles.eventDay}>{e.day}</Text>
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventNearBadge}>📍 {e.city}</Text>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={styles.eventVenue}>{e.venue}</Text>
                  </View>
                </View>
                <View style={styles.eventBottom}>
                  <Text style={styles.eventSpeakers}>
                    {e.speakers.join(", ")}
                  </Text>
                  <TouchableOpacity style={styles.rsvpBtn}>
                    <Text style={styles.rsvpText}>
                      RSVP · {e.rsvp.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* SEEDS SECTION */}
        {showSeeds && fundraisers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Seeds</Text>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/seeds" as any)}
              >
                <Text style={styles.sectionLink}>View All →</Text>
              </TouchableOpacity>
            </View>
            {fundraisers.map((f) => {
              const pct = f.goal_amount
                ? Math.min(
                    Math.round((f.raised_amount / f.goal_amount) * 100),
                    100,
                  )
                : 0;
              const org = f.organizations;
              const emoji = catEmoji(f.cause_category);
              return (
                <View key={f.id} style={styles.seedCard}>
                  <View style={styles.seedOrgRow}>
                    <View style={styles.seedOrgAvatar}>
                      <Text style={styles.seedOrgEmoji}>{emoji}</Text>
                    </View>
                    <View style={styles.seedOrgInfo}>
                      <Text style={styles.seedOrgName}>
                        {org?.org_name ?? "Organization"}
                      </Text>
                      {org?.is_verified && (
                        <Text style={styles.seedVerified}>✓ Verified</Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.seedTitle} numberOfLines={2}>
                    {f.title}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${pct}%` as any }]}
                    />
                  </View>
                  <View style={styles.seedStats}>
                    <View style={styles.seedStat}>
                      <Text style={styles.seedStatVal}>
                        {fmtMoney(f.raised_amount)}
                      </Text>
                      <Text style={styles.seedStatLabel}>RAISED</Text>
                    </View>
                    <View style={styles.seedStat}>
                      <Text style={styles.seedStatVal}>
                        {fmtMoney(f.goal_amount)}
                      </Text>
                      <Text style={styles.seedStatLabel}>GOAL</Text>
                    </View>
                    <View style={styles.seedStat}>
                      <Text style={styles.seedStatVal}>{pct}%</Text>
                      <Text style={styles.seedStatLabel}>FUNDED</Text>
                    </View>
                    <View style={styles.seedStat}>
                      <Text style={styles.seedStatVal}>
                        {(f.donor_count ?? 0).toLocaleString()}
                      </Text>
                      <Text style={styles.seedStatLabel}>DONORS</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.donateBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/donate",
                        params: {
                          fundraiserId: f.id,
                          orgId: f.org_id ?? "",
                          title: f.title,
                          orgStripeAccountId: "",
                        },
                      } as any)
                    }
                  >
                    <Text style={styles.donateBtnText}>💚 Donate Now</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* SPEAKERS SECTION */}
        {showSpeakers && speakers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Speakers Near You</Text>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/discover" as any)}
              >
                <Text style={styles.sectionLink}>View All →</Text>
              </TouchableOpacity>
            </View>
            {speakers.map((s) => {
              const initial = speakerInitial(s.display_name);
              const tags = (s.topics ?? []).slice(0, 2);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.speakerCard}
                  onPress={() => router.push(`/speaker/${s.id}` as any)}
                  activeOpacity={0.8}
                >
                  <View style={styles.speakerCardAvatar}>
                    <Text style={styles.speakerCardInitial}>{initial}</Text>
                  </View>
                  <View style={styles.speakerCardInfo}>
                    <Text style={styles.speakerCardName}>{s.display_name}</Text>
                    <Text style={styles.speakerCardMeta}>
                      {[s.denomination, s.state].filter(Boolean).join(" · ")}
                    </Text>
                    <View style={styles.speakerCardTags}>
                      {tags.map((t) => (
                        <View key={t} style={styles.tag}>
                          <Text style={styles.tagText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: "center",
      justifyContent: "center",
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Theme.spacing.xl,
      paddingTop: Platform.OS === 'web' ? 0 : 60,
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
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    authBtnText: { fontSize: Theme.fontSize.sm, color: C.text2 },
    authBtnTextActive: { color: C.gold },

    filters: {
      paddingHorizontal: Theme.spacing.lg,
      paddingBottom: Theme.spacing.md,
      gap: Theme.spacing.sm,
    },
    filterPill: {
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
    filterPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    filterText: {
      fontSize: Theme.fontSize.sm,
      color: C.text2,
      fontWeight: "500",
    },
    filterTextActive: { color: C.black, fontWeight: "700" },

    feed: { paddingHorizontal: Theme.spacing.md },

    section: { marginBottom: Theme.spacing.xl },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Theme.spacing.md,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: C.text3,
      textTransform: "uppercase",
      letterSpacing: 1.5,
    },
    sectionLink: { fontSize: 12, color: C.gold },

    // Gem card
    gemCard: {
      backgroundColor: C.surface,
      borderRadius: Theme.radius.xl,
      borderWidth: 0.5,
      borderColor: C.border2,
      overflow: "hidden",
      marginBottom: Theme.spacing.lg,
    },
    gemHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Theme.spacing.md,
      padding: Theme.spacing.md,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.surface2,
      borderWidth: 1.5,
      borderColor: C.goldDim,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: C.gold, fontSize: 16, fontWeight: "600" },
    speakerInfo: { flex: 1 },
    speakerName: {
      color: C.text,
      fontSize: Theme.fontSize.base,
      fontWeight: "500",
    },
    speakerMeta: { color: C.text3, fontSize: Theme.fontSize.xs, marginTop: 2 },
    followBtn: {
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: 5,
      borderRadius: Theme.radius.full,
      borderWidth: 0.5,
      borderColor: C.goldDim,
    },
    followBtnText: {
      color: C.gold,
      fontSize: Theme.fontSize.sm,
      fontWeight: "500",
    },
    thumb: {
      height: 195,
      backgroundColor: C.surface2,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    thumbPlaceholder: {
      width: "100%",
      height: "100%",
      backgroundColor: C.surface2,
    },
    playBtn: {
      position: "absolute",
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(201,168,76,0.9)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    playIcon: { color: C.black, fontSize: 18, marginLeft: 3 },
    vidLabel: {
      position: "absolute",
      bottom: 10,
      left: 12,
      right: 60,
      color: "#fff",
      fontSize: 12,
      fontWeight: "500",
      zIndex: 2,
    },
    gemActions: {
      flexDirection: "row",
      gap: Theme.spacing.lg,
      padding: Theme.spacing.md,
    },
    action: { flexDirection: "row", alignItems: "center", gap: 5 },
    actionIcon: { fontSize: 16, color: C.text3 },
    actionText: { fontSize: Theme.fontSize.sm, color: C.text3 },
    tags: {
      flexDirection: "row",
      gap: Theme.spacing.sm,
      paddingHorizontal: Theme.spacing.md,
      paddingBottom: Theme.spacing.md,
      flexWrap: "wrap",
    },
    tag: {
      backgroundColor: C.emeraldBg,
      paddingHorizontal: Theme.spacing.sm,
      paddingVertical: 3,
      borderRadius: Theme.radius.full,
    },
    tagText: { color: C.emeraldLight, fontSize: Theme.fontSize.xs },

    // Event card
    eventCard: {
      backgroundColor: C.surface,
      borderWidth: 0.5,
      borderColor: C.border2,
      borderRadius: Theme.radius.xl,
      overflow: "hidden",
      marginBottom: Theme.spacing.md,
    },
    eventTop: {
      flexDirection: "row",
      gap: Theme.spacing.md,
      padding: Theme.spacing.md,
      paddingBottom: Theme.spacing.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: C.border2,
      backgroundColor: C.bg3,
    },
    eventDateBadge: {
      backgroundColor: C.gold,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: "center",
      minWidth: 44,
      flexShrink: 0,
    },
    eventMonth: {
      fontSize: 9,
      fontWeight: "700",
      color: "#000",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    eventDay: {
      fontSize: 22,
      fontWeight: "800",
      color: "#000",
      lineHeight: 26,
    },
    eventInfo: { flex: 1 },
    eventNearBadge: { fontSize: 10, color: C.emeraldLight, marginBottom: 3 },
    eventTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: C.text,
      marginBottom: 2,
    },
    eventVenue: { fontSize: 11, color: C.text3 },
    eventBottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: Theme.spacing.md,
    },
    eventSpeakers: { fontSize: 11, color: C.text3, flex: 1 },
    rsvpBtn: {
      backgroundColor: C.emeraldBg,
      borderWidth: 0.5,
      borderColor: C.emerald,
      borderRadius: Theme.radius.full,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    rsvpText: { fontSize: 12, fontWeight: "600", color: C.emeraldLight },

    // Seed card
    seedCard: {
      backgroundColor: C.surface,
      borderRadius: Theme.radius.xl,
      borderWidth: 0.5,
      borderColor: C.border2,
      padding: Theme.spacing.lg,
      marginBottom: Theme.spacing.md,
    },
    seedOrgRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Theme.spacing.md,
      marginBottom: Theme.spacing.md,
    },
    seedOrgAvatar: {
      width: 40,
      height: 40,
      borderRadius: Theme.radius.sm,
      backgroundColor: C.emeraldBg,
      alignItems: "center",
      justifyContent: "center",
    },
    seedOrgEmoji: { fontSize: 20 },
    seedOrgInfo: { flex: 1 },
    seedOrgName: {
      fontSize: Theme.fontSize.md,
      fontWeight: "500",
      color: C.text,
    },
    seedVerified: { fontSize: 10, color: C.emeraldLight, marginTop: 2 },
    seedTitle: {
      fontSize: Theme.fontSize.base,
      fontWeight: "600",
      color: C.text,
      lineHeight: 20,
      marginBottom: Theme.spacing.md,
    },
    progressTrack: {
      height: 5,
      backgroundColor: C.surface2,
      borderRadius: 3,
      overflow: "hidden",
      marginBottom: Theme.spacing.md,
    },
    progressFill: {
      height: "100%",
      backgroundColor: C.emeraldLight,
      borderRadius: 3,
    },
    seedStats: { flexDirection: "row", marginBottom: Theme.spacing.md },
    seedStat: { flex: 1, alignItems: "center" },
    seedStatVal: {
      fontSize: Theme.fontSize.base,
      fontWeight: "700",
      color: C.gold,
    },
    seedStatLabel: {
      fontSize: 8,
      color: C.text3,
      marginTop: 2,
      letterSpacing: 0.5,
    },
    donateBtn: {
      backgroundColor: C.gold,
      borderRadius: Theme.radius.md,
      padding: Theme.spacing.md,
      alignItems: "center",
    },
    donateBtnText: {
      color: C.black,
      fontSize: Theme.fontSize.base,
      fontWeight: "700",
    },

    // Speaker card
    speakerCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Theme.spacing.md,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.xl,
      borderWidth: 0.5,
      borderColor: C.border2,
      padding: Theme.spacing.md,
      marginBottom: Theme.spacing.md,
    },
    speakerCardAvatar: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: C.emerald,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    speakerCardInitial: { fontSize: 20, color: C.gold, fontWeight: "700" },
    speakerCardInfo: { flex: 1, minWidth: 0 },
    speakerCardName: {
      fontSize: Theme.fontSize.base,
      fontWeight: "600",
      color: C.text,
    },
    speakerCardMeta: {
      fontSize: Theme.fontSize.xs,
      color: C.text3,
      marginTop: 2,
      marginBottom: 5,
    },
    speakerCardTags: { flexDirection: "row", gap: 4, flexWrap: "wrap" },

  });