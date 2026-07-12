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
  Share,
  Animated,
  Easing,
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useEffect, useRef, useState, useCallback } from "react";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { Theme } from "../../constants/theme";
import { useTheme, type AppColors } from "../../lib/theme";
import { Audio } from "expo-av";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const TAB_BAR_HEIGHT = 80;
const GEM_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;
const REACTIONS = ["❤️", "🔥", "🤲", "😂", "💯", "👍"];
const AUTH_SENTINELS = {
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
  speakers: {
    id: string;
    display_name: string;
    denomination: string | null;
    state: string | null;
  } | null;
  // Future CTA fields: these can be added to the videos table later.
  // Until they exist, Gems will not force a fundraising CTA on every clip.
  cta_type?: "plant_seed" | "none" | null;
  fundraiser_id?: string | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  profile_id: string;
  like_count: number;
  is_liked: boolean;
  author_name: string;
  reactions: Record<string, number>;
  my_reaction: string | null;
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

// ─── COMMENTS SHEET ───────────────────────────────────────────
function CommentsSheet({
  visible,
  videoId,
  commentsEnabled,
  onClose,
  onCountChange,
  onAuthRequired,
}: {
  visible: boolean;
  videoId: string;
  commentsEnabled: boolean;
  onClose: () => void;
  onCountChange: (n: number) => void;
  onAuthRequired: (intent: "comment" | "reaction") => void;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [emojiTarget, setEmojiTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scrollOffsetRef = useRef(0);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  function handlePanMove(_: any, gesture: any) {
    if (gesture.dy > 0) sheetTranslateY.setValue(gesture.dy);
  }

  function handlePanRelease(_: any, gesture: any) {
    if (gesture.dy > 80 || gesture.vy > 0.6) {
      Animated.timing(sheetTranslateY, {
        toValue: 600,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        sheetTranslateY.setValue(0);
        onCloseRef.current();
      });
    } else {
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    }
  }

  // Header pan — always intercepts downward swipe
  const headerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6,
      onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.dy > 6,
      onPanResponderMove: handlePanMove,
      onPanResponderRelease: handlePanRelease,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // Sheet body pan — only intercepts when list is scrolled to top
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 10 && scrollOffsetRef.current <= 4,
      onPanResponderMove: handlePanMove,
      onPanResponderRelease: handlePanRelease,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  useEffect(() => {
    if (visible && videoId) {
      sheetTranslateY.setValue(0);
      scrollOffsetRef.current = 0;
      loadComments();
    } else {
      setComments([]);
      setInput("");
      setReplyTo(null);
      setEmojiTarget(null);
    }
  }, [visible, videoId]);

  async function loadComments() {
    setLoading(true);
    try {
      const result = await supabase
        .from("comments")
        .select(
          "id, body, created_at, parent_id, profile_id, like_count, profiles!comments_profile_id_fkey(full_name, username)",
        )
        .eq("video_id", videoId)
        .order("created_at", { ascending: false });

      if (!result.data) {
        setLoading(false);
        return;
      }

      const rawComments = result.data;

      // Fetch reactions
      const ids = rawComments.map((c: any) => c.id);
      let rxnMap: Record<string, Record<string, number>> = {};
      let myRxnMap: Record<string, string> = {};

      let myLikesSet: Set<string> = new Set();

      if (ids.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const rxnResult = await supabase
          .from("comment_reactions")
          .select("comment_id, emoji, profile_id")
          .in("comment_id", ids);

        if (rxnResult.data) {
          rxnResult.data.forEach((r: any) => {
            if (!rxnMap[r.comment_id]) rxnMap[r.comment_id] = {};
            rxnMap[r.comment_id][r.emoji] =
              (rxnMap[r.comment_id][r.emoji] ?? 0) + 1;
            if (user && r.profile_id === user.id) {
              myRxnMap[r.comment_id] = r.emoji;
            }
          });
        }

        if (user) {
          const likesResult = await supabase
            .from("comment_likes")
            .select("comment_id")
            .in("comment_id", ids)
            .eq("profile_id", user.id);
          if (likesResult.data) {
            likesResult.data.forEach((l: any) => myLikesSet.add(l.comment_id));
          }
        }
      }

      const enriched: Comment[] = rawComments.map((c: any) => {
        const profile = c.profiles;
        return {
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          parent_id: c.parent_id,
          profile_id: c.profile_id,
          like_count: c.like_count ?? 0,
          is_liked: myLikesSet.has(c.id),
          author_name: profile?.full_name || profile?.username || "Anonymous",
          reactions: rxnMap[c.id] ?? {},
          my_reaction: myRxnMap[c.id] ?? null,
        };
      });

      setComments(enriched);
      onCountChange(enriched.length);
    } catch (e) {
      console.log("loadComments error:", e);
    }
    setLoading(false);
  }

  async function submitComment() {
    const body = input.trim();
    if (!body || submitting) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      onAuthRequired("comment");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const parentId = replyTo?.id ?? null;
    const optimisticComment: Comment = {
      id: tempId,
      body,
      created_at: new Date().toISOString(),
      parent_id: parentId,
      profile_id: user.id,
      like_count: 0,
      is_liked: false,
      author_name: "You",
      reactions: {},
      my_reaction: null,
    };

    setInput("");
    setReplyTo(null);
    setSubmitting(true);
    setComments((prev) => [optimisticComment, ...prev]);
    onCountChange(comments.length + 1);

    const payload: any = {
      video_id: videoId,
      profile_id: user.id,
      body,
    };
    if (parentId) payload.parent_id = parentId;

    const { data, error } = await supabase
      .from("comments")
      .insert(payload)
      .select(
        "id, body, created_at, parent_id, profile_id, like_count, profiles!comments_profile_id_fkey(full_name, username)",
      )
      .single();

    setSubmitting(false);

    if (error || !data) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      onCountChange(Math.max(0, comments.length));
      alert("Comment did not post. Please try again.");
      return;
    }

    const profile: any = (data as any).profiles;
    const savedComment: Comment = {
      id: (data as any).id,
      body: (data as any).body,
      created_at: (data as any).created_at,
      parent_id: (data as any).parent_id,
      profile_id: (data as any).profile_id,
      like_count: (data as any).like_count ?? 0,
      is_liked: false,
      author_name: profile?.full_name || profile?.username || "You",
      reactions: {},
      my_reaction: null,
    };

    setComments((prev) =>
      prev.map((c) => (c.id === tempId ? savedComment : c)),
    );
  }

  async function toggleCommentLike(commentId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      onAuthRequired("reaction");
      return;
    }

    let previousComments: Comment[] = [];
    setComments((prev) => {
      previousComments = prev;
      return prev.map((comment) => {
        if (comment.id !== commentId) return comment;
        const wasLiked = comment.is_liked;
        return {
          ...comment,
          is_liked: !wasLiked,
          like_count: wasLiked
            ? Math.max(0, comment.like_count - 1)
            : comment.like_count + 1,
        };
      });
    });

    const existing = await supabase
      .from("comment_likes")
      .select("id")
      .eq("comment_id", commentId)
      .eq("profile_id", user.id)
      .maybeSingle();

    const result = existing.data
      ? await supabase.from("comment_likes").delete().eq("id", existing.data.id)
      : await supabase
          .from("comment_likes")
          .insert({ comment_id: commentId, profile_id: user.id });

    if (result.error) {
      setComments(previousComments);
      alert("Comment like did not save. Please try again.");
    }
  }

  async function toggleReaction(commentId: string, emoji: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      onAuthRequired("reaction");
      return;
    }

    let previousComments: Comment[] = [];
    let previousReaction: string | null = null;
    let nextReaction: string | null = emoji;

    setEmojiTarget(null);
    setComments((prev) => {
      previousComments = prev;
      return prev.map((comment) => {
        if (comment.id !== commentId) return comment;

        previousReaction = comment.my_reaction;
        nextReaction = previousReaction === emoji ? null : emoji;
        const reactions = { ...comment.reactions };

        if (previousReaction) {
          reactions[previousReaction] = Math.max(
            0,
            (reactions[previousReaction] ?? 1) - 1,
          );
          if (reactions[previousReaction] === 0)
            delete reactions[previousReaction];
        }

        if (nextReaction) {
          reactions[nextReaction] = (reactions[nextReaction] ?? 0) + 1;
        }

        return { ...comment, reactions, my_reaction: nextReaction };
      });
    });

    const existing = await supabase
      .from("comment_reactions")
      .select("id, emoji")
      .eq("comment_id", commentId)
      .eq("profile_id", user.id)
      .maybeSingle();

    let error: any = null;
    if (existing.data) {
      const deleteResult = await supabase
        .from("comment_reactions")
        .delete()
        .eq("id", existing.data.id);
      error = deleteResult.error;

      if (!error && existing.data.emoji !== emoji) {
        const insertResult = await supabase
          .from("comment_reactions")
          .insert({ comment_id: commentId, profile_id: user.id, emoji });
        error = insertResult.error;
      }
    } else {
      const insertResult = await supabase
        .from("comment_reactions")
        .insert({ comment_id: commentId, profile_id: user.id, emoji });
      error = insertResult.error;
    }

    if (error) {
      setComments(previousComments);
      alert("Reaction did not save. Please try again.");
    }
  }

  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesMap: Record<string, Comment[]> = {};
  comments
    .filter((c) => c.parent_id)
    .forEach((c) => {
      if (!repliesMap[c.parent_id!]) repliesMap[c.parent_id!] = [];
      repliesMap[c.parent_id!].push(c);
    });

  function renderComment(c: Comment, isReply = false) {
    const initial = c.author_name.charAt(0).toUpperCase();
    const cReplies = repliesMap[c.id] ?? [];

    return (
      <View>
        <View style={[styles.commentRow, isReply && styles.commentReply]}>
          <View style={styles.commentAvatar}>
            <Text style={styles.commentAvatarText}>{initial}</Text>
          </View>
          <View style={styles.commentBody}>
            <Text style={styles.commentAuthor}>{c.author_name}</Text>
            <Text style={styles.commentText}>{c.body}</Text>

            {/* Reactions */}
            <View style={styles.reactionRow}>
              {Object.entries(c.reactions).map(([emoji, count]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.reactionChip,
                    c.my_reaction === emoji && styles.reactionChipMine,
                  ]}
                  onPress={() => toggleReaction(c.id, emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text
                    style={[
                      styles.reactionCount,
                      c.my_reaction === emoji && styles.reactionCountMine,
                    ]}
                  >
                    {count as number}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.reactionAddBtn}
                onPress={() =>
                  setEmojiTarget(emojiTarget === c.id ? null : c.id)
                }
              >
                <Text style={styles.reactionAddText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Emoji picker */}
            {emojiTarget === c.id && (
              <View style={styles.emojiPicker}>
                {REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiOption}
                    onPress={() => toggleReaction(c.id, emoji)}
                  >
                    <Text style={styles.emojiOptionText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.commentMeta}>
              <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
              {!isReply && (
                <TouchableOpacity
                  onPress={() => {
                    setReplyTo({ id: c.id, name: c.author_name });
                    inputRef.current?.focus();
                  }}
                >
                  <Text style={styles.replyBtn}>Reply</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => toggleCommentLike(c.id)}
                style={styles.commentLikeBtn}
              >
                <Text
                  style={[
                    styles.commentLikeIcon,
                    c.is_liked && styles.commentLikeIconActive,
                  ]}
                >
                  {c.is_liked ? "♥" : "♡"}
                </Text>
                {c.like_count > 0 && (
                  <Text style={styles.commentLikeCount}>{c.like_count}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {cReplies.map((r) => renderComment(r, true))}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[
          styles.commentsSheet,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
        {...panResponder.panHandlers}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={SCREEN_HEIGHT * 0.14}
          style={styles.commentsSheetInner}
        >
          <View style={styles.sheetHeader} {...headerPanResponder.panHandlers}>
            <View style={styles.sheetHandleRow}>
              <View style={styles.sheetHandle} />
            </View>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>
                {comments.length} Comment{comments.length !== 1 ? "s" : ""}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

        <View style={styles.sheetContent} {...panResponder.panHandlers}>
        {loading ? (
          <View style={styles.sheetLoading}>
            <ActivityIndicator color={C.gold} />
          </View>
        ) : !commentsEnabled ? (
          <View style={styles.sheetLoading}>
            <Text style={styles.disabledText}>
              Comments are turned off for this video.
            </Text>
          </View>
        ) : topLevel.length === 0 ? (
          <View style={styles.sheetLoading}>
            <Text style={styles.emptyCommentsText}>
              No comments yet. Be the first!
            </Text>
          </View>
        ) : (
          <FlatList
            data={topLevel}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderComment(item)}
            style={styles.commentsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListFooterComponent={<View style={{ height: 20 }} />}
            removeClippedSubviews
            initialNumToRender={10}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
          />
        )}

        </View>
        {replyTo && (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText}>
              Replying to {replyTo.name}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Text style={styles.replyBannerCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {commentsEnabled && (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.commentInput}
              placeholder={
                replyTo ? `Reply to ${replyTo.name}...` : "Add a comment..."
              }
              placeholderTextColor={C.text3}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                input.trim().length > 0 && styles.sendBtnActive,
              ]}
              onPress={submitComment}
              disabled={submitting}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

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
              <Text style={styles.nudgePerkIcon}>★</Text>
              <Text style={styles.nudgePerkText}>Save Gems</Text>
            </View>
            <View style={styles.nudgePerk}>
              <Text style={styles.nudgePerkIcon}>✓</Text>
              <Text style={styles.nudgePerkText}>Follow speakers</Text>
            </View>
            <View style={styles.nudgePerk}>
              <Text style={styles.nudgePerkIcon}>🌿</Text>
              <Text style={styles.nudgePerkText}>Support Seeds</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.nudgePrimary}
            onPress={() => {
              onClose();
              router.push("/(auth)/sign-up" as any);
            }}
          >
            <Text style={styles.nudgePrimaryText}>Create account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nudgeSecondary}
            onPress={() => {
              onClose();
              router.push("/(auth)/login" as any);
            }}
          >
            <Text style={styles.nudgeSecondaryText}>
              I already have an account
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.nudgeSkip}>
            <Text style={styles.nudgeSkipText}>Keep watching for now</Text>
          </TouchableOpacity>
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
  intent: "comment" | "reaction" | "report" | "save";
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const actionText =
    intent === "reaction" ? "react to Gems" :
    intent === "report" ? "report content" :
    intent === "save" ? "save Gems" :
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
          <TouchableOpacity style={styles.authPromptPrimary} onPress={() => goTo("/(auth)/login")}>
            <Text style={styles.authPromptPrimaryText}>Log in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.authPromptSecondary} onPress={() => goTo("/(auth)/sign-up")}>
            <Text style={styles.authPromptSecondaryText}>Create account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.authPromptSkip} onPress={onClose}>
            <Text style={styles.authPromptSkipText}>Not now</Text>
          </TouchableOpacity>
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
}: {
  item: VideoItem;
  isActive: boolean;
  isPreloaded: boolean;
  onCommentOpen: (videoId: string, enabled: boolean) => void;
  gemHeight: number;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const videoRef = useRef<Video>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
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
  }, [item.id]);

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
    try {
      await Share.share({
        message: `${speaker?.display_name ?? "Speaker"} — ${item.title ?? ""} | Siqa`,
      });
    } catch (e) {}
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
    <View style={[styles.clip, { height: gemHeight }]}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setPaused((p) => !p)}
      >
        {isPreloaded ? (
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
            onPress={() =>
              speaker?.id && router.push(`/speaker/${speaker.id}` as any)
            }
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.speakerMeta}
            onPress={() =>
              speaker?.id && router.push(`/speaker/${speaker.id}` as any)
            }
          >
            <View style={styles.speakerNameRow}>
              <Text style={styles.speakerName}>{speaker?.display_name}</Text>
              <Text style={styles.verifiedBadge}>✓</Text>
            </View>
            <Text style={styles.speakerSub}>
              {[speaker?.denomination, speaker?.state]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.followBtn}>
            <Text style={styles.followBtnText}>Follow</Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            style={styles.plantSeedCta}
            onPress={() => {
              const fundraiserId = (item as any).fundraiser_id;
              if (fundraiserId) {
                router.push({
                  pathname: "/donate" as any,
                  params: { fundraiserId, title: item.title },
                });
              } else {
                router.push("/(tabs)/seeds" as any);
              }
            }}
          >
            <Text style={styles.plantSeedCtaText}>Plant a Seed</Text>
          </TouchableOpacity>
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
        <TouchableOpacity style={styles.action} onPress={handleLike}>
          <Animated.Text
            style={[
              styles.actionIcon,
              liked && styles.actionIconLiked,
              { transform: [{ scale: likeScale }] },
            ]}
          >
            {liked ? "♥" : "♡"}
          </Animated.Text>
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() =>
            onCommentOpen(item.id, item.comments_enabled !== false)
          }
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{formatCount(commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={handleShare}>
          <Text style={styles.actionIcon}>↗</Text>
          <Text style={styles.actionCount}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={handleSave}
          disabled={savingVideo}
        >
          <Text style={[styles.actionIcon, saved && styles.actionIconSaved]}>{saved ? "★" : "☆"}</Text>
          <Text style={styles.actionCount}>{saved ? "Saved" : "Save"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={handleReport}>
          <Text style={styles.actionIcon}>⚑</Text>
          <Text style={styles.actionCount}>Report</Text>
        </TouchableOpacity>

        {plantSeedEnabled && (
          <TouchableOpacity
            style={styles.actionCta}
            onPress={() => router.push("/(tabs)/seeds" as any)}
          >
            <Text style={styles.actionCtaText}>Seed</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

// ─── GEMS SCREEN ──────────────────────────────────────────────
export default function GemsScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  // Use useWindowDimensions so height is correct on web (reactive, not module-load snapshot)
  const { height: screenHeight } = useWindowDimensions();
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
  const [authPromptIntent, setAuthPromptIntent] = useState<"comment" | "reaction" | "report" | "save">("comment");
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

  useEffect(() => {
    if (!pendingScrollVideoId || !videos.length) return;
    const targetIndex = videos.findIndex((video) => video.id === pendingScrollVideoId);
    if (targetIndex < 0) return;

    setActiveIndex(targetIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: targetIndex, animated: true });
      setPendingScrollVideoId(null);
    });
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
        id, title, video_url, thumbnail_url,
        like_count, comment_count, view_count, topics, comments_enabled,
        speakers(id, display_name, denomination, state)
      `,
      )
      .eq("is_published", true)
      .eq("platform", "bunny")
      .not("video_url", "is", null)
      .range(0, BATCH_SIZE - 1);

    if (result.data) {
      const shuffled = [...result.data].sort(() => Math.random() - 0.5) as any[];
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
        id, title, video_url, thumbnail_url,
        like_count, comment_count, view_count, topics, comments_enabled,
        speakers(id, display_name, denomination, state)
      `,
      )
      .eq("is_published", true)
      .eq("platform", "bunny")
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

  function requireAuth(intent: "comment" | "reaction" | "report" | "save" = "comment") {
    setCommentsOpen(false);
    setAuthPromptIntent(intent);
    setAuthPromptVisible(true);
  }

  function openComments(videoId: string, enabled: boolean) {
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

  const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

  function onViewableItemsChanged({ viewableItems }: any) {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }

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
    <View style={styles.container}>
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
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
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
        removeClippedSubviews
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={50}
        windowSize={5}
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
  return StyleSheet.create({
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
  });
}