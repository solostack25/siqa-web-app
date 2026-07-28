import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import { Theme } from '../constants/theme';

type Comment = {
  id: string;
  body: string;
  created_at: string;
  profile_id: string | null;
  like_count: number | null;
  profiles: { full_name: string | null; username: string | null } | null;
};

function timeAgo(ts: string) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days === 0) {
    const hours = Math.floor((Date.now() - new Date(ts).getTime()) / 3600000);
    if (hours === 0) return 'Just now';
    return `${hours}h ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function CommentsSection({ videoId }: { videoId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('comments')
      .select('id, body, created_at, profile_id, like_count, profiles!comments_profile_id_fkey(full_name, username)')
      .eq('video_id', videoId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    setComments((data as any[]) ?? []);
    setLoading(false);
  }, [videoId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePost() {
    const trimmed = draft.trim();
    if (!trimmed || posting) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/(auth)/login' as any);
      return;
    }

    setPosting(true);
    const { data: inserted, error } = await supabase
      .from('comments')
      .insert({ video_id: videoId, profile_id: user.id, body: trimmed })
      .select('id, body, created_at, profile_id, like_count, profiles!comments_profile_id_fkey(full_name, username)')
      .single();

    setPosting(false);

    if (error) {
      Alert.alert('Comment not posted', 'Please try again.');
      return;
    }

    setDraft('');
    if (inserted) setComments((prev) => [inserted as any, ...prev]);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{comments.length} comments</Text>

      <View style={styles.composeRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.text3}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          style={[styles.postBtn, (!draft.trim() || posting) && styles.postBtnDisabled]}
          onPress={handlePost}
          disabled={!draft.trim() || posting}
        >
          {posting ? <ActivityIndicator color={Colors.bg} size="small" /> : <Text style={styles.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold} style={{ marginTop: Theme.spacing.lg }} />
      ) : comments.length === 0 ? (
        <Text style={styles.emptyText}>Be the first to comment.</Text>
      ) : (
        comments.map((c) => (
          <View key={c.id} style={styles.commentRow}>
            <View style={styles.avatarPlaceholder} />
            <View style={{ flex: 1 }}>
              <View style={styles.commentMetaRow}>
                <Text style={styles.commentAuthor}>
                  {c.profiles?.full_name || c.profiles?.username || 'Siqa user'}
                </Text>
                <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
              </View>
              <Text style={styles.commentBody}>{c.body}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Theme.spacing.xl },
  label: { color: Colors.text, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, marginBottom: Theme.spacing.md },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Theme.spacing.sm, marginBottom: Theme.spacing.lg },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    color: Colors.text,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 10,
    fontSize: Theme.fontSize.base,
    maxHeight: 100,
  },
  postBtn: {
    backgroundColor: Colors.gold,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: Theme.radius.full,
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { color: Colors.bg, fontWeight: Theme.fontWeight.semibold, fontSize: Theme.fontSize.sm },
  emptyText: { color: Colors.text3, fontSize: Theme.fontSize.base, paddingVertical: Theme.spacing.lg },
  commentRow: { flexDirection: 'row', gap: Theme.spacing.sm, marginBottom: Theme.spacing.lg },
  avatarPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.goldSoft, flexShrink: 0 },
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm },
  commentAuthor: { color: Colors.text, fontSize: Theme.fontSize.sm, fontWeight: Theme.fontWeight.semibold },
  commentTime: { color: Colors.text3, fontSize: Theme.fontSize.xs },
  commentBody: { color: Colors.text2, fontSize: Theme.fontSize.base, marginTop: 2, lineHeight: 20 },
});
