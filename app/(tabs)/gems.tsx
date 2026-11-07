import { openDonation } from "../../lib/donateLink";
import { Redirect } from 'expo-router';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
  Image,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { YouTubeShortEmbed, type YouTubeShortHandle } from "../../components/YouTubeShortEmbed";
import { useEffect, useRef, useState, useCallback } from "react";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { recordView, VIEW_DELAY_MS } from "../../lib/views";
import { shareShort } from "../../lib/share";
import { Theme } from "../../constants/theme";
import { useTheme, type AppColors } from "../../lib/theme";
import { Audio } from "expo-av";
import { useIsDesktopWeb } from "../../components/DesktopShell";
import { Glyph } from '../../components/Glyph';
import { brandStyles } from '../../lib/ds';
import { Button } from '../../components/ui';
import { CommentsSheet } from '../../components/comments/Comments';
import { Icon } from '../../components/Icon';
import { guardTabSwipe } from '../../components/useTabSwipe';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const TAB_BAR_HEIGHT = 80;
const GEM_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;
const AUTH_SENTINELS = {
  follow: "__AUTH_FOLLOW__",
  reaction: "__AUTH_REQUIRED__",
  report: "__AUTH_REPORT__",
  save: "__AUTH_SAVE__",
} as const;

if (Platform.OS !== 'web') {
  Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

type VideoItem = {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  like_count: number;
  comment_count: number;
  view_count: number;
  topics: string[];
  comments_enabled: boolean;
  platform?: string | null;
  platform_video_id?: string | null;
  speakers: {
    id: string;
    display_name: string;
    denomination: string | null;
    state: string | null;
    profile_id?: string | null;
    avatar_url?: string | null;
    is_verified?: boolean | null;
    is_claimed?: boolean | null;
  } | null;
  // Future CTA fields: these can be added to the videos table later.
  // Until they exist, Gems will not force a fundraising CTA on every clip.
  cta_type?: "plant_seed" | "none" | null;
  fundraiser_id?: string | null;
};


function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function formatCount(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

// Comments: the shared sheet in components/comments (same as the Watch page).

// ─── SIGNUP NUDGE ─────────────────────────────────────────────
function SignupNudge({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.nudgeBackdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.nudgeSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.nudgeArabic}>صِقا</Text>
          <Text style={styles.nudgeTitle}>Keep your Gems close</Text>
          <Text style={styles.nudgeSub}>
            Create your Siqa account to follow verified speakers, save
            beneficial reminders, and support trusted causes.
          </Text>

          <View style={styles.nudgePerks}>
            <View style={styles.nudgePerk}>
              <Glyph name="bookmark-outline" style={styles.nudgePerkIcon} />
              <Text style={styles.nudgePerkText}>Save Gems</Text>
            </View>
            <View style={styles.nudgePerk}>
              <Glyph name="person-add-outline" style={styles.nudgePerkIcon} />
              <Text style={styles.nudgePerkText}>Follow speakers</Text>
            </View>
            <View style={styles.nudgePerk}>
              <Glyph name="leaf-outline" style={styles.nudgePerkIcon} />
              <Text style={styles.nudgePerkText}>Support Seeds</Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Button
              label="Create account"
              onPress={() => {
                onClose();
                router.push("/(auth)/sign-up" as any);
              }}
            />
            <Button
              label="I already have an account"
              variant="secondary"
              onPress={() => {
                onClose();
                router.push("/(auth)/login" as any);
              }}
            />
            <Button label="Keep watching for now" variant="ghost" size="md" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── AUTH REQUIRED PROMPT ─────────────────────────────────────
function AuthRequiredPrompt({
  visible,
  intent,
  onClose,
}: {
  visible: boolean;
  intent: "comment" | "reaction" | "report" | "save" | "follow";
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const actionText =
    intent === "reaction" ? "react to Gems" :
    intent === "report" ? "report content" :
    intent === "save" ? "save Gems" :
    intent === "follow" ? "follow speakers" :
    "join the conversation";

  function goTo(path: string) {
    onClose();
    router.push(path as any);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.authPromptBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.authPromptCard}>
          <Text style={styles.authPromptArabic}>صِقا</Text>
          <Text style={styles.authPromptTitle}>Sign in to continue</Text>
          <Text style={styles.authPromptSub}>
            Create or sign in to your Siqa account to {actionText}, follow verified speakers, and save beneficial reminders.
          </Text>
          <View style={{ gap: 10, alignSelf: "stretch" }}>
            <Button label="Log in" onPress={() => goTo("/(auth)/login")} />
            <Button label="Create account" variant="secondary" onPress={() => goTo("/(auth)/sign-up")} />
            <Button label="Not now" variant="ghost" size="md" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── GEM CLIP ─────────────────────────────────────────────────
function GemClip({
  item,
  isActive,
  isPreloaded,
  onCommentOpen,
  gemHeight,
  gemWidth,
}: {
  item: VideoItem;
  isActive: boolean;
  isPreloaded: boolean;
  onCommentOpen: (videoId: string, enabled: boolean) => void;
  gemHeight: number;
  gemWidth: number;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const videoRef = useRef<any>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [likeCount, setLikeCount] = useState(item.like_count || 0);
  const [commentCount, setCommentCount] = useState(item.comment_count || 0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);
  const likeScale = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(12)).current;

  const speaker = item.speakers;
  const plantSeedEnabled =
    (item as any).cta_type === "plant_seed" ||
    Boolean((item as any).fundraiser_id);
  const initial =
    speaker?.display_name
      ?.replace(/^(Sh\.|Dr\.|Imam|Ustadha|Ustadh)\s+/i, "")
      .charAt(0)
      .toUpperCase() ?? "?";

  useEffect(() => {
    checkLiked();
    checkSaved();
    checkFollowing();
  }, [item.id]);

  async function checkFollowing() {
    const profileId = speaker?.profile_id;
    if (!profileId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", profileId)
      .maybeSingle();
    setFollowing(Boolean(data));
  }

  // Was a dead button (no handler). Same follows table the watch page uses;
  // follower_count is kept up to date by a trigger on follows.
  async function handleFollow() {
    const profileId = speaker?.profile_id;
    if (!profileId || followBusy) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      onCommentOpen(AUTH_SENTINELS.follow, true);
      return;
    }
    const was = following;
    setFollowing(!was);
    setFollowBusy(true);
    const result = was
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profileId)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: profileId });
    setFollowBusy(false);
    if (result.error) setFollowing(was);
  }

  useEffect(() => {
    if (!isActive) return;
    contentOpacity.setValue(0);
    contentTranslate.setValue(12);
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslate, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  // Count a view once this Gem has been on screen for VIEW_DELAY_MS.
  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => recordView(item.id), VIEW_DELAY_MS);
    return () => clearTimeout(t);
  }, [isActive, item.id]);

  useEffect(() => {
    if (!videoRef.current || !isPreloaded) return;
    if (isActive && !paused) {
      videoRef.current.playAsync().catch(() => {});
    } else {
      videoRef.current.pauseAsync().catch(() => {});
    }
  }, [isActive, paused, isPreloaded]);

  useEffect(() => {
    return () => {
      videoRef.current?.pauseAsync().catch(() => {});
      videoRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  async function checkSaved() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaved(false);
      return;
    }
    const result = await supabase
      .from("video_saves")
      .select("video_id")
      .eq("video_id", item.id)
      .eq("profile_id", user.id)
      .maybeSingle();
    setSaved(Boolean(result.data));
  }

  async function checkLiked() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const result = await supabase
      .from("video_likes")
      .select("video_id")
      .eq("video_id", item.id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (result.data) setLiked(true);
  }

  async function handleLike() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      onCommentOpen(AUTH_SENTINELS.reaction, true);
      return;
    }

    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((p) => (wasLiked ? Math.max(0, p - 1) : p + 1));

    Animated.sequence([
      Animated.spring(likeScale, {
        toValue: 1.18,
        useNativeDriver: true,
        friction: 5,
      }),
      Animated.spring(likeScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
      }),
    ]).start();

    const result = wasLiked
      ? await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", item.id)
          .eq("profile_id", user.id)
      : await supabase
          .from("video_likes")
          .insert({ video_id: item.id, profile_id: user.id });

    if (result.error) {
      setLiked(wasLiked);
      setLikeCount((p) => (wasLiked ? p + 1 : Math.max(0, p - 1)));
      alert("Like did not save. Please try again.");
    }
  }

  async function handleShare() {
    await shareShort(item.id, item.title, speaker?.display_name);
  }

  async function handleSave() {
    if (savingVideo) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      onCommentOpen(AUTH_SENTINELS.save, true);
      return;
    }

    const wasSaved = saved;
    setSaved(!wasSaved);
    setSavingVideo(true);

    const result = wasSaved
      ? await supabase
          .from("video_saves")
          .delete()
          .eq("video_id", item.id)
          .eq("profile_id", user.id)
      : await supabase
          .from("video_saves")
          .upsert(
            { video_id: item.id, profile_id: user.id },
            { onConflict: "video_id,profile_id" },
          );

    setSavingVideo(false);

    if (result.error) {
      setSaved(wasSaved);
      Alert.alert(
        "Save did not work",
        "Ask Claude to confirm the video_saves table exists with video_id, profile_id, created_at, and a unique constraint on video_id/profile_id.",
      );
    }
  }

  async function handleReport() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      onCommentOpen(AUTH_SENTINELS.report, true);
      return;
    }

    Alert.alert(
      "Report this Gem?",
      "A Siqa moderator will review it. Reports help keep the platform trustworthy.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            const result = await supabase.from("content_reports").insert({
              video_id: item.id,
              profile_id: user.id,
              reason: "Gem reported by viewer",
              status: "open",
            });
            if (result.error) {
              Alert.alert(
                "Report not saved",
                "Reporting is not fully configured yet. Ask Claude to create the content_reports table and RLS policy.",
              );
              return;
            }
            Alert.alert("Reported", "Thank you. A moderator will review this Gem.");
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.clip, { height: gemHeight, width: gemWidth }, Platform.OS === 'web' && { scrollSnapAlign: 'start' } as any]}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={guardTabSwipe(() => setPaused((p) => !p))}
      >
        {isPreloaded ? (
          item.platform === 'youtube' && item.platform_video_id ? (
            <YouTubeShortEmbed
              ref={videoRef}
              videoId={item.platform_video_id}
              loop
              onReadyForDisplay={() => setVideoLoading(false)}
            />
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: item.video_url }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={isActive && !paused}
              isMuted={false}
              volume={1.0}
              posterSource={
                item.thumbnail_url ? { uri: item.thumbnail_url } : undefined
              }
              usePoster={!!item.thumbnail_url}
              onLoadStart={() => setVideoLoading(true)}
              onReadyForDisplay={() => setVideoLoading(false)}
              onPlaybackStatusUpdate={(status) => {
                if (!status.isLoaded || !status.durationMillis) return;
                setProgress(status.positionMillis / status.durationMillis);
                if (status.isPlaying) setVideoLoading(false);
              }}
            />
          )
        ) : (
          <View style={styles.videoColdPlaceholder} />
        )}
      </TouchableOpacity>

      {videoLoading && isPreloaded && (
        <View style={styles.videoLoader} pointerEvents="none">
          <ActivityIndicator color={C.gold} />
        </View>
      )}

      {paused && (
        <View style={styles.pauseIcon} pointerEvents="none">
          <Text style={styles.pauseText}>▐▐</Text>
        </View>
      )}

      <View style={styles.overlay} pointerEvents="none" />

      <View style={styles.gemsTopBar} pointerEvents="box-none">
        <View style={styles.gemsBrandWrap}>
          <Text style={styles.gemsArabic}>صِقا</Text>
          <Text style={styles.gemsBrand}>SIQA GEMS</Text>
        </View>
        <View style={styles.gemsLivePill}>
          <Text style={styles.gemsLiveText}>Verified reminders</Text>
        </View>
      </View>

      <View style={styles.clipProgressTrack} pointerEvents="none">
        <View
          style={[
            styles.clipProgressFill,
            { width: `${Math.min(100, Math.max(0, progress * 100))}%` },
          ]}
        />
      </View>

      {/* Bottom info */}
      <Animated.View
        style={[
          styles.bottomInfo,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslate }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.speakerRow}>
          <TouchableOpacity
            style={styles.avatar}
            onPress={guardTabSwipe(() =>
              speaker?.id && router.push(`/speaker/${speaker.id}` as any)
            )}
          >
            {speaker?.avatar_url ? (
              <Image source={{ uri: speaker.avatar_url }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.speakerMeta}
            onPress={guardTabSwipe(() =>
              speaker?.id && router.push(`/speaker/${speaker.id}` as any)
            )}
          >
            <View style={styles.speakerNameRow}>
              <Text style={styles.speakerName}>{speaker?.display_name}</Text>
              {speaker?.is_verified && speaker?.is_claimed !== false ? (
                <Icon name="checkmark-circle" size={16} color={C.gold} />
              ) : null}
            </View>
            <Text style={styles.speakerSub}>
              {[speaker?.denomination, speaker?.state]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </TouchableOpacity>
          {speaker?.profile_id ? (
            <Button
              size="sm"
              variant={following ? "light" : "gold"}
              label={following ? "Following" : "Follow"}
              onPress={handleFollow}
              disabled={followBusy}
              style={following ? { backgroundColor: "rgba(0,0,0,0.45)" } : undefined}
            />
          ) : null}
        </View>

        {item.title ? (
          <Text style={styles.clipTitle} numberOfLines={2}>
            {item.title}
          </Text>
        ) : null}

        {item.topics?.length > 0 && (
          <View style={styles.topics}>
            {item.topics.slice(0, 3).map((t) => (
              <View key={t} style={styles.topicTag}>
                <Text style={styles.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {plantSeedEnabled && (
          <Button
            size="sm"
            variant="gold"
            icon="leaf"
            label="Plant a Seed"
            style={{ alignSelf: "flex-start", marginTop: 4 }}
            onPress={guardTabSwipe(() => {
              const fundraiserId = (item as any).fundraiser_id;
              if (fundraiserId) {
                // Only the id: the donate screen looks up the org's payment
                // setup itself. iOS opens siqa.us in Safari (App Store rules).
                openDonation({ fundraiserId });
              } else {
                router.push("/(tabs)/seeds" as any);
              }
            })}
          />
        )}
      </Animated.View>

      {/* Right actions */}
      <Animated.View
        style={[
          styles.actions,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslate }],
          },
        ]}
      >
        <TouchableOpacity style={styles.action} onPress={guardTabSwipe(handleLike)}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Glyph
              name={liked ? "heart" : "heart-outline"}
              style={[styles.actionIcon, liked && styles.actionIconLiked]}
            />
          </Animated.View>
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={guardTabSwipe(() =>
            onCommentOpen(item.id, item.comments_enabled !== false)
          )}
        >
          <Glyph name="chatbubble-outline" style={styles.actionIcon} />
          <Text style={styles.actionCount}>{formatCount(commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={guardTabSwipe(handleShare)}>
          <Glyph name="arrow-redo-outline" style={styles.actionIcon} />
          <Text style={styles.actionCount}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={guardTabSwipe(handleSave)}
          disabled={savingVideo}
        >
          <Glyph name={saved ? "bookmark" : "bookmark-outline"} style={[styles.actionIcon, saved && styles.actionIconSaved]} />
          <Text style={styles.actionCount}>{saved ? "Saved" : "Save"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={guardTabSwipe(handleReport)}>
          <Glyph name="flag-outline" style={styles.actionIcon} />
          <Text style={styles.actionCount}>Report</Text>
        </TouchableOpacity>

        {plantSeedEnabled && (
          <TouchableOpacity
            style={styles.actionCta}
            onPress={guardTabSwipe(() => router.push("/(tabs)/seeds" as any))}
          >
            <Text style={styles.actionCtaText}>Seed</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

// ─── GEMS SCREEN ──────────────────────────────────────────────
function GemsScreenInner() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  // Use useWindowDimensions so both are correct on web (reactive, not
  // module-load snapshot) — width also needs to subtract the desktop
  // sidebar's 220px, which the old SCREEN_WIDTH constant never accounted
  // for at all, so this was wrong even before considering resize.
  const { width: windowWidth, height: screenHeight } = useWindowDimensions();
  const isDesktopWeb = useIsDesktopWeb();
  const gemWidth = isDesktopWeb ? windowWidth - 220 : windowWidth;
  const gemHeight = screenHeight - TAB_BAR_HEIGHT;
  const params = useLocalSearchParams<{ videoId?: string }>();
  const targetVideoId = typeof params.videoId === "string" ? params.videoId : undefined;
  const listRef = useRef<FlatList<VideoItem>>(null);
  const [pendingScrollVideoId, setPendingScrollVideoId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState("");
  const [activeCommentsEnabled, setActiveCommentsEnabled] = useState(true);
  const [signupNudgeVisible, setSignupNudgeVisible] = useState(false);
  const [hasNudged, setHasNudged] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  const [authPromptIntent, setAuthPromptIntent] = useState<"comment" | "reaction" | "report" | "save" | "follow">("comment");
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      if (!videos.length) loadVideos();
      return () => {
        setScreenFocused(false);
        setCommentsOpen(false);
        setSignupNudgeVisible(false);
        setAuthPromptVisible(false);
      };
    }, [videos.length]),
  );

  useEffect(() => {
    if (targetVideoId) setPendingScrollVideoId(targetVideoId);
  }, [targetVideoId]);

  // Open the exact Gem that was tapped (Home, a profile, a shared link).
  // The feed is a random batch, so the Gem may not be in it, and the Gems tab
  // stays loaded between visits; fetch it if needed and put it up next.
  const fetchingTarget = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingScrollVideoId;
    if (!target || !videos.length) return; // first load handles it itself
    const targetIndex = videos.findIndex((video) => video.id === target);
    if (targetIndex >= 0) {
      setActiveIndex(targetIndex);
      setPendingScrollVideoId(null);
      // Clear the param so tapping the same Gem again works next time.
      router.setParams({ videoId: undefined } as any);
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      });
      return;
    }
    if (fetchingTarget.current === target) return;
    fetchingTarget.current = target;
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select(
          `
          id, title, video_url, thumbnail_url, platform, platform_video_id,
          like_count, comment_count, view_count, topics, comments_enabled,
          speakers(id, display_name, denomination, state, profile_id, avatar_url, is_verified, is_claimed)
        `,
        )
        .eq("id", target)
        .eq("is_published", true)
        .maybeSingle();
      fetchingTarget.current = null;
      if (!data) {
        setPendingScrollVideoId(null);
        return;
      }
      // Put it right where the viewer is, so it plays immediately.
      setVideos((prev) => {
        const at = Math.min(activeIndex, prev.length);
        return [...prev.slice(0, at), data as any, ...prev.slice(at)];
      });
    })();
  }, [pendingScrollVideoId, videos]);

  useEffect(() => {
    async function maybeNudge() {
      if (hasNudged || activeIndex < 2) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setHasNudged(true);
        setSignupNudgeVisible(true);
      }
    }
    maybeNudge();
  }, [activeIndex, hasNudged]);

  const BATCH_SIZE = 20;

  async function loadVideos() {
    const result = await supabase
      .from("videos")
      .select(
        `
        id, title, video_url, thumbnail_url, platform, platform_video_id,
        like_count, comment_count, view_count, topics, comments_enabled,
        speakers(id, display_name, denomination, state, profile_id, avatar_url, is_verified, is_claimed)
      `,
      )
      .eq("is_published", true)
      .eq("format", "short")
      // Both YouTube shorts and Gems uploaded in the app (Bunny MP4s).
      // This used to be YouTube-only, so uploaded Gems never showed here.
      .not("video_url", "is", null)
      .range(0, BATCH_SIZE - 1);

    if (result.data) {
      const shuffled = [...result.data].sort(() => Math.random() - 0.5) as any[];
      // A shared link (/gems?videoId=…) has to open that exact short, but
      // the first batch is only 20 videos. If it isn't in there, fetch it
      // and put it first so shared links always land on the right Gem.
      if (targetVideoId && !shuffled.some((video: any) => video.id === targetVideoId)) {
        const { data: target } = await supabase
          .from("videos")
          .select(
            `
            id, title, video_url, thumbnail_url, platform, platform_video_id,
            like_count, comment_count, view_count, topics, comments_enabled,
            speakers(id, display_name, denomination, state, profile_id, avatar_url, is_verified, is_claimed)
          `,
          )
          .eq("id", targetVideoId)
          .eq("is_published", true)
          .eq("format", "short")
          .maybeSingle();
        if (target) shuffled.unshift(target as any);
      }
      setVideos(shuffled);
      setOffset(BATCH_SIZE);
      setAllLoaded(result.data.length < BATCH_SIZE);
      const requestedIndex = targetVideoId
        ? shuffled.findIndex((video: any) => video.id === targetVideoId)
        : -1;
      setActiveIndex(requestedIndex >= 0 ? requestedIndex : 0);
      if (targetVideoId && requestedIndex >= 0) setPendingScrollVideoId(targetVideoId);
    }
    setLoading(false);
  }

  async function loadMoreVideos() {
    if (loadingMore || allLoaded) return;
    setLoadingMore(true);

    const result = await supabase
      .from("videos")
      .select(
        `
        id, title, video_url, thumbnail_url, platform, platform_video_id,
        like_count, comment_count, view_count, topics, comments_enabled,
        speakers(id, display_name, denomination, state, profile_id, avatar_url, is_verified, is_claimed)
      `,
      )
      .eq("is_published", true)
      .eq("format", "short")
      // Both YouTube shorts and Gems uploaded in the app (Bunny MP4s).
      // This used to be YouTube-only, so uploaded Gems never showed here.
      .not("video_url", "is", null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (result.data && result.data.length > 0) {
      const shuffled = [...result.data].sort(() => Math.random() - 0.5) as any[];
      setVideos((prev) => [...prev, ...shuffled]);
      setOffset((prev) => prev + BATCH_SIZE);
      if (result.data.length < BATCH_SIZE) setAllLoaded(true);
    } else {
      // No more rows — loop back to start for an endless feel
      setOffset(0);
      setAllLoaded(false);
    }
    setLoadingMore(false);
  }

  function requireAuth(intent: "comment" | "reaction" | "report" | "save" | "follow" = "comment") {
    setCommentsOpen(false);
    setAuthPromptIntent(intent);
    setAuthPromptVisible(true);
  }

  function openComments(videoId: string, enabled: boolean) {
    if (videoId === AUTH_SENTINELS.follow) {
      requireAuth("follow");
      return;
    }
    if (videoId === AUTH_SENTINELS.reaction) {
      requireAuth("reaction");
      return;
    }
    if (videoId === AUTH_SENTINELS.report) {
      requireAuth("report");
      return;
    }
    if (videoId === AUTH_SENTINELS.save) {
      requireAuth("save");
      return;
    }
    setActiveVideoId(videoId);
    setActiveCommentsEnabled(enabled);
    setCommentsOpen(true);
  }

  const playbackEnabled =
    screenFocused && !commentsOpen && !signupNudgeVisible && !authPromptVisible;

  // FlatList throws a hard invariant violation if either of these change
  // identity while mounted ("Changing onViewableItemsChanged on the fly is
  // not supported") — they were previously plain declarations recreated on
  // every render, which crashes the moment any state update happens while
  // scrolled (e.g. activeIndex changing), not something specific to the
  // YouTube integration. useRef keeps both stable for the component's
  // entire lifetime, which is what FlatList requires.
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  const onViewableItemsChangedRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  });

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const nextIndex = Math.round(y / gemHeight);
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!videos.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No gems yet</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, Platform.OS === 'web' && { overflow: 'hidden', height: gemHeight }]}>
      <FlatList
        ref={listRef}
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <GemClip
            item={item}
            isActive={playbackEnabled && index === activeIndex}
            isPreloaded={Math.abs(index - activeIndex) <= 1}
            onCommentOpen={openComments}
            gemHeight={gemHeight}
            gemWidth={gemWidth}
          />
        )}
        pagingEnabled
        bounces={false}
        showsVerticalScrollIndicator={false}
        snapToInterval={gemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={handleMomentumEnd}
        initialNumToRender={2}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfigRef.current}
        getItemLayout={(_, index) => ({
          length: gemHeight,
          offset: gemHeight * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true });
          }, 250);
        }}
        onEndReached={loadMoreVideos}
        onEndReachedThreshold={0.3}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        style={Platform.OS === 'web' ? { height: gemHeight } : { flex: 1 }}
      />

      <SignupNudge
        visible={signupNudgeVisible}
        onClose={() => setSignupNudgeVisible(false)}
      />

      <AuthRequiredPrompt
        visible={authPromptVisible}
        intent={authPromptIntent}
        onClose={() => setAuthPromptVisible(false)}
      />

      <CommentsSheet
        visible={commentsOpen}
        videoId={activeVideoId}
        commentsEnabled={activeCommentsEnabled}
        onClose={() => setCommentsOpen(false)}
        onAuthRequired={requireAuth}
        onCountChange={(n) => {
          setVideos((prev) =>
            prev.map((v) =>
              v.id === activeVideoId ? { ...v, comment_count: n } : v,
            ),
          );
        }}
      />
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    container: { flex: 1, backgroundColor: C.black },
    centered: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { color: C.text3, fontSize: Theme.fontSize.base },

    clip: { width: SCREEN_WIDTH, height: GEM_HEIGHT, backgroundColor: C.black },
    overlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: SCREEN_HEIGHT * 0.6,
      backgroundColor: "transparent",
    },
    videoColdPlaceholder: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.black,
    },
    videoLoader: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: [{ translateX: -18 }, { translateY: -18 }],
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.34)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9,
    },
    pauseIcon: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: [{ translateX: -30 }, { translateY: -30 }],
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    },
    pauseText: { color: C.white, fontSize: 22 },
    gemsTopBar: {
      position: "absolute",
      top: Platform.OS === "ios" ? 56 : 28,
      left: 16,
      right: 16,
      zIndex: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    gemsBrandWrap: { alignItems: "flex-start" },
    gemsLivePill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 100,
      backgroundColor: "rgba(0,0,0,0.46)",
      borderWidth: 0.5,
      borderColor: "rgba(255,255,255,0.16)",
    },
    gemsLiveText: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 13,
      fontWeight: "700",
    },
    gemsArabic: {
      color: C.gold,
      fontSize: 26,
      fontWeight: "700",
      lineHeight: 28,
    },
    gemsBrand: {
      color: "rgba(255,255,255,0.74)",
      fontSize: 13,
      letterSpacing: 2,
      fontWeight: "700",
    },

    clipProgressTrack: {
      position: "absolute",
      top: Platform.OS === "ios" ? 104 : 76,
      left: 18,
      right: 18,
      height: 3,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.18)",
      zIndex: 30,
    },
    clipProgressFill: {
      height: "100%",
      borderRadius: 10,
      backgroundColor: C.gold,
    },

    bottomInfo: {
      position: "absolute",
      bottom: 14,
      left: 0,
      right: 86,
      paddingLeft: 18,
      paddingRight: 8,
      paddingBottom: 8,
      gap: 8,
    },
    speakerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Theme.spacing.sm,
      marginBottom: Theme.spacing.sm,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.gold,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.3)",
      overflow: "hidden",
    },
    avatarText: { color: C.black, fontSize: 16, fontWeight: "700" },
    speakerMeta: { flex: 1 },
    speakerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    speakerName: {
      color: C.white,
      fontSize: Theme.fontSize.base,
      fontWeight: "600",
    },
    speakerSub: {
      color: "rgba(255,255,255,0.65)",
      fontSize: Theme.fontSize.xs,
      marginTop: 1,
    },
    verifiedBadge: {
      color: C.black,
      backgroundColor: C.gold,
      width: 16,
      height: 16,
      borderRadius: 8,
      overflow: "hidden",
      textAlign: "center",
      fontSize: 13,
      lineHeight: 16,
      fontWeight: "900",
    },
    followBtn: {
      borderWidth: 1.5,
      borderColor: C.white,
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: 4,
      borderRadius: 4,
    },
    followBtnText: {
      color: C.white,
      fontSize: Theme.fontSize.sm,
      fontWeight: "600",
    },
    clipTitle: {
      color: C.white,
      fontSize: Theme.fontSize.base,
      lineHeight: 20,
    },
    topics: { flexDirection: "row", flexWrap: "wrap", gap: Theme.spacing.sm },
    topicTag: {
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: Theme.spacing.sm,
      paddingVertical: 3,
      borderRadius: 20,
    },
    topicText: { color: C.white, fontSize: Theme.fontSize.xs },
    plantSeedCta: {
      alignSelf: "flex-start",
      backgroundColor: C.gold,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 100,
      marginTop: 4,
    },
    plantSeedCtaText: { color: C.black, fontSize: 13, fontWeight: "900" },

    actions: {
      position: "absolute",
      right: Theme.spacing.md,
      bottom: 38,
      alignItems: "center",
      gap: 13,
    },
    action: { alignItems: "center", gap: 4 },
    actionIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      textAlign: "center",
      lineHeight: 46,
      fontSize: 25,
      color: C.white,
      backgroundColor: "rgba(0,0,0,0.42)",
      overflow: "hidden",
      borderWidth: 0.5,
      borderColor: "rgba(255,255,255,0.14)",
    },
    actionIconLiked: { color: "#e74c3c" },
    actionIconSaved: { color: C.gold, borderColor: C.gold, backgroundColor: "rgba(201,168,76,0.16)" },
    actionCount: {
      color: C.white,
      fontSize: Theme.fontSize.xs,
      fontWeight: "500",
    },
    actionCta: {
      backgroundColor: C.gold,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 100,
      shadowColor: C.gold,
      shadowOpacity: 0.28,
      shadowRadius: 12,
    },
    actionCtaText: { color: C.black, fontSize: 13, fontWeight: "800" },

    // Signup nudge
    nudgeBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.58)",
    },
    nudgeSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: Platform.OS === "ios" ? 38 : 24,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    nudgeArabic: {
      color: C.gold,
      fontSize: 42,
      fontWeight: "700",
      textAlign: "center",
      lineHeight: 48,
      marginTop: 6,
    },
    nudgeTitle: {
      color: C.text,
      fontSize: 21,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 6,
    },
    nudgeSub: {
      color: C.text2,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 20,
    },
    nudgePerks: { flexDirection: "row", gap: 8, marginBottom: 20 },
    nudgePerk: {
      flex: 1,
      backgroundColor: C.bg2,
      borderWidth: 0.5,
      borderColor: C.border2,
      borderRadius: 14,
      padding: 12,
      alignItems: "center",
    },
    nudgePerkIcon: { fontSize: 18, color: C.gold, marginBottom: 5 },
    nudgePerkText: {
      color: C.text2,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
    },
    nudgePrimary: {
      backgroundColor: C.gold,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
    },
    nudgePrimaryText: { color: C.black, fontSize: 15, fontWeight: "800" },
    nudgeSecondary: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 10,
    },
    nudgeSecondaryText: { color: C.text, fontSize: 14, fontWeight: "700" },
    nudgeSkip: { alignItems: "center", paddingVertical: 14 },
    nudgeSkipText: { color: C.text3, fontSize: 13, fontWeight: "600" },

    // Auth required prompt
    authPromptBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.62)",
      alignItems: "center",
      justifyContent: "center",
      padding: 22,
    },
    authPromptCard: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: C.surface,
      borderRadius: 24,
      padding: 22,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.black,
      shadowOpacity: 0.3,
      shadowRadius: 20,
    },
    authPromptArabic: {
      color: C.gold,
      fontSize: 40,
      fontWeight: "700",
      textAlign: "center",
      lineHeight: 46,
      marginBottom: 6,
    },
    authPromptTitle: {
      color: C.text,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
    },
    authPromptSub: {
      color: C.text2,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 18,
    },
    authPromptPrimary: {
      backgroundColor: C.gold,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    authPromptPrimaryText: { color: C.black, fontSize: 15, fontWeight: "800" },
    authPromptSecondary: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 10,
    },
    authPromptSecondaryText: { color: C.text, fontSize: 14, fontWeight: "700" },
    authPromptSkip: { alignItems: "center", paddingTop: 14 },
    authPromptSkipText: { color: C.text3, fontSize: 13, fontWeight: "600" },

    // Comments modal
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
    commentsSheet: {
      backgroundColor: C.bg2,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: SCREEN_HEIGHT * 0.86,
      borderTopWidth: 0.5,
      borderTopColor: C.border,
      overflow: "hidden",
    },
    commentsSheetInner: {
      flex: 1,
      backgroundColor: C.bg2,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border2,
      alignSelf: "center",
    },
    sheetHandleRow: {
      alignItems: "center",
      paddingTop: 10,
      paddingBottom: 6,
    },
    sheetHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    sheetHeader: {
      borderBottomWidth: 0.5,
      borderBottomColor: C.border2,
    },
    sheetTitle: { fontSize: 14, fontWeight: "600", color: C.text },
    sheetClose: { color: C.text2, fontSize: 16, padding: 4 },
    sheetLoading: { padding: 40, alignItems: "center" },
    disabledText: { color: C.text3, fontSize: 13, fontStyle: "italic" },
    emptyCommentsText: { color: C.text3, fontSize: 13 },
    sheetContent: { flex: 1 },
    commentsList: { flex: 1 },

    commentRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    commentReply: { paddingLeft: 52 },
    commentAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.surface2,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    commentAvatarText: { color: C.gold, fontSize: 13, fontWeight: "600" },
    commentBody: { flex: 1 },
    commentAuthor: { fontSize: 13, fontWeight: "600", color: C.text },
    commentText: { fontSize: 13, color: C.text2, lineHeight: 18, marginTop: 2 },
    commentMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 5,
    },
    commentTime: { fontSize: 13, color: C.text3 },
    replyBtn: { fontSize: 13, color: C.text3, fontWeight: "500" },
    commentLikeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      marginLeft: "auto",
    },
    commentLikeIcon: { fontSize: 14, color: C.text3 },
    commentLikeIconActive: { color: C.gold },
    commentLikeCount: { fontSize: 13, color: C.gold },

    reactionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
      marginTop: 6,
    },
    reactionChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 100,
      backgroundColor: C.surface2,
      borderWidth: 1,
      borderColor: C.border2,
    },
    reactionChipMine: { backgroundColor: C.goldBg, borderColor: C.goldDim },
    reactionEmoji: { fontSize: 14 },
    reactionCount: { fontSize: 13, color: C.text2, fontWeight: "600" },
    reactionCountMine: { color: C.gold },
    reactionAddBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border2,
      alignItems: "center",
      justifyContent: "center",
    },
    reactionAddText: { color: C.text3, fontSize: 16, fontWeight: "700" },
    emojiPicker: {
      flexDirection: "row",
      gap: 4,
      marginTop: 6,
      backgroundColor: C.surface,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderWidth: 0.5,
      borderColor: C.border2,
      alignSelf: "flex-start",
    },
    emojiOption: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    emojiOptionText: { fontSize: 20 },

    replyBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: C.surface,
      borderTopWidth: 0.5,
      borderTopColor: C.border2,
    },
    replyBannerText: { fontSize: 13, color: C.text2 },
    replyBannerCancel: { fontSize: 13, color: C.gold },

    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: 0.5,
      borderTopColor: C.border2,
      backgroundColor: C.bg2,
    },
    commentInput: {
      flex: 1,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border2,
      borderRadius: 100,
      paddingHorizontal: 16,
      paddingVertical: 10,
      color: C.text,
      fontSize: 14,
      maxHeight: 100,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnActive: { backgroundColor: C.gold },
    sendBtnText: { color: C.black, fontSize: 16, fontWeight: "700" },
  }));
}
// Not part of the Marketplace site (marketplace.thesiqaapp.com): go to the Shop.
export default function GemsScreen() {
  if (IS_MARKETPLACE_SITE) return <Redirect href={'/marketplace' as any} />;
  return <GemsScreenInner />;
}
