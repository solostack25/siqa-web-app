// The discussion under a Chai poll or quiz: newest or top comments, each
// with the commenter's vote or result as a badge, likes, one level of
// replies, delete for your own comments, and Report or Block on others'.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { chai, chaiFont, chunky, fetchComments, addComment, toggleLike, deleteComment, shortName, ago, type ChaiComment } from '../../lib/chai';
import { Squiggle } from './ChaiUI';
import { Icon } from '../Icon';
import { BottomSheet, OptionRow } from '../ui';
import { useBlocked, blockUser, reportContent, REPORT_REASONS } from '../../lib/blocks';
import { showToast } from '../Toast';

const BADGE_COLORS = [chai.saffron, chai.rose, chai.cardamom, chai.masala, chai.plum];
function badgeColor(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

export function ChaiDiscussion({ postId, title = 'The debate', placeholder = 'Add to the discussion', enabled = true, refreshKey }: {
  postId: string; title?: string; placeholder?: string; enabled?: boolean; refreshKey?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ChaiComment[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChaiComment | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<ChaiComment | null>(null);
  const [reporting, setReporting] = useState<ChaiComment | null>(null);
  const blocked = useBlocked();

  const load = useCallback(async () => {
    const r = await fetchComments(postId);
    setComments(r.comments); setLiked(r.liked); setBadges(r.badges); setMe(r.me);
    setLoading(false);
  }, [postId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const visible = useMemo(() => comments.filter(c => !blocked.has(c.profile_id)), [comments, blocked]);
  const { tops, replies } = useMemo(() => {
    const tops = visible.filter(c => !c.parent_id);
    const replies: Record<string, ChaiComment[]> = {};
    visible.filter(c => c.parent_id).forEach(c => { (replies[c.parent_id!] ??= []).push(c); });
    Object.values(replies).forEach(l => l.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)));
    tops.sort((a, b) => sort === 'top' ? (b.like_count - a.like_count) || (+new Date(b.created_at) - +new Date(a.created_at)) : +new Date(b.created_at) - +new Date(a.created_at));
    return { tops, replies };
  }, [visible, sort]);

  async function post() {
    if (!text.trim()) return;
    if (!me) { router.push('/(auth)/sign-in' as any); return; }
    setPosting(true); setError(null);
    const r = await addComment(postId, text, replyTo?.id);
    setPosting(false);
    if (r.error) { setError(r.error === 'signed_out' ? 'Sign in to join the discussion.' : 'Could not post that. Try again.'); return; }
    setText(''); setReplyTo(null);
    load();
  }

  async function like(c: ChaiComment) {
    if (!me) { router.push('/(auth)/sign-in' as any); return; }
    const on = !liked.has(c.id);
    setLiked(prev => { const n = new Set(prev); on ? n.add(c.id) : n.delete(c.id); return n; });
    setComments(prev => prev.map(x => x.id === c.id ? { ...x, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) } : x));
    await toggleLike(c.id, on);
  }

  async function remove(c: ChaiComment) {
    const go = async () => { await deleteComment(c.id); load(); };
    if (Platform.OS === 'web') { if (window.confirm('Delete your comment?')) go(); }
    else Alert.alert('Delete comment?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  }

  const row = (c: ChaiComment, isReply = false) => {
    const name = shortName(c.profiles?.full_name);
    const badge = badges[c.profile_id];
    const color = badge ? badgeColor(badge) : chai.saffron;
    return (
      <View key={c.id} style={[isReply ? { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: `${chai.ink}33` } : [chunky(3, 16), { padding: 12 }], { flexDirection: 'row', gap: 10 }]}>
        <View style={{ width: isReply ? 28 : 34, height: isReply ? 28 : 34, borderWidth: 2, borderColor: chai.ink, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[chaiFont('displayBold'), { fontSize: isReply ? 13 : 16, color: chai.ink }]}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: chai.ink }}>{name}</Text>
            <Text style={{ fontSize: 12, color: chai.ink2 }}>{ago(c.created_at)}</Text>
            {badge ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1.5, borderColor: chai.ink, borderRadius: 6, backgroundColor: color }}>
                <Text style={[chaiFont('mono'), { fontSize: 10, color: chai.ink }]} numberOfLines={1}>{badge.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ marginTop: 3, fontSize: 14, lineHeight: 20, color: chai.ink }}>{c.body}</Text>
          <View style={{ marginTop: 6, flexDirection: 'row', gap: 16 }}>
            <Pressable onPress={() => like(c)} hitSlop={10} accessibilityRole="button" accessibilityLabel={liked.has(c.id) ? 'Unlike' : 'Like'} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={liked.has(c.id) ? 'heart' : 'heart-outline'} size={15} color={liked.has(c.id) ? chai.masala : chai.ink} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: chai.ink }}>{c.like_count}</Text>
            </Pressable>
            {!isReply && enabled ? (
              <Pressable onPress={() => setReplyTo(c)} hitSlop={10} accessibilityRole="button"><Text style={{ fontSize: 12, fontWeight: '700', color: chai.ink }}>Reply</Text></Pressable>
            ) : null}
            {me === c.profile_id ? (
              <Pressable onPress={() => remove(c)} hitSlop={10} accessibilityRole="button"><Text style={{ fontSize: 12, fontWeight: '700', color: '#b4412c' }}>Delete</Text></Pressable>
            ) : (
              <Pressable onPress={() => { if (!me) { router.push('/(auth)/sign-in' as any); return; } setMenu(c); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`More options for ${name}'s comment`}>
                <Icon name="ellipsis-horizontal" size={16} color={chai.ink2} />
              </Pressable>
            )}
          </View>
          {(replies[c.id] ?? []).map(r => row(r, true))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={[chaiFont('displayBold'), { fontSize: 22, color: chai.ink }]} accessibilityRole="header">
            {title} <Text style={{ color: chai.masala }}>· {visible.length}</Text>
          </Text>
          <Squiggle width={96} color={chai.saffron} />
        </View>
        <Pressable onPress={() => setSort(s => s === 'top' ? 'new' : 'top')} accessibilityRole="button" accessibilityLabel={`Sorted by ${sort === 'top' ? 'top' : 'newest'}. Change`}
          style={[chunky(0, 999), { height: 34, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
          <Text style={[chaiFont('mono'), { fontSize: 11, color: chai.ink }]}>{sort === 'top' ? 'TOP' : 'NEWEST'}</Text>
          <Icon name="swap-vertical" size={13} color={chai.ink} />
        </Pressable>
      </View>

      {enabled ? (
        <View style={{ gap: 6 }}>
          {replyTo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: chai.ink2 }}>Replying to {shortName(replyTo.profiles?.full_name)}</Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel="Cancel reply"><Icon name="close" size={14} color={chai.ink2} /></Pressable>
            </View>
          ) : null}
          <View style={[chunky(0, 16), { minHeight: 48, paddingLeft: 14, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={me ? placeholder : 'Sign in to join the discussion'}
              placeholderTextColor={chai.ink2}
              accessibilityLabel="Write a comment"
              maxLength={1000}
              multiline
              onFocus={() => { if (!me) router.push('/(auth)/sign-in' as any); }}
              style={[{ flex: 1, minWidth: 0, fontSize: 15, color: chai.ink, paddingVertical: 12, outlineStyle: 'none' } as any]}
            />
            <Pressable onPress={post} disabled={posting || !text.trim()} accessibilityRole="button" accessibilityLabel="Post comment"
              style={{ height: 36, paddingHorizontal: 12, borderWidth: 2, borderColor: chai.ink, borderRadius: 10, backgroundColor: text.trim() ? chai.saffron : '#efe8da', alignItems: 'center', justifyContent: 'center' }}>
              {posting ? <ActivityIndicator size="small" color={chai.ink} /> : <Text style={[chaiFont('display'), { fontSize: 15, color: chai.ink }]}>Post</Text>}
            </Pressable>
          </View>
          {error ? <Text style={{ fontSize: 13, color: '#b4412c' }}>{error}</Text> : null}
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: chai.ink2 }}>Comments are off for this one.</Text>
      )}

      {loading ? <ActivityIndicator color={chai.ink} style={{ marginTop: 12 }} /> : tops.length === 0 ? (
        <Text style={{ fontSize: 14, color: chai.ink2, paddingVertical: 8 }}>No comments yet. Start the debate.</Text>
      ) : (
        <View style={{ gap: 10 }}>{tops.map(c => row(c))}</View>
      )}

      <BottomSheet visible={!!menu} onClose={() => setMenu(null)} title="Comment">
        {menu ? (
          <>
            <OptionRow action icon="flag-outline" label="Report" onPress={() => { const m = menu; setMenu(null); setReporting(m); }} />
            <OptionRow action icon="ban-outline" label={`Block ${shortName(menu.profiles?.full_name)}`} last onPress={() => { const m = menu; setMenu(null); blockUser(m.profile_id, shortName(m.profiles?.full_name)); }} />
          </>
        ) : null}
      </BottomSheet>
      <BottomSheet visible={!!reporting} onClose={() => setReporting(null)} title="Report comment">
        <Text style={{ fontSize: 13, color: '#6b6b66', marginBottom: 6 }}>What's wrong with it? Siqa reviews every report.</Text>
        {REPORT_REASONS.map((r, i) => (
          <OptionRow key={r} action label={r} last={i === REPORT_REASONS.length - 1} onPress={async () => {
            const c = reporting; setReporting(null);
            if (!c) return;
            const err = await reportContent({ targetType: 'chai_comment', targetId: c.id, reportedUserId: c.profile_id, reason: r, details: c.body });
            showToast(err ? `Couldn't send report: ${err}` : 'Thanks. Siqa will review it.');
          }} />
        ))}
      </BottomSheet>
    </View>
  );
}
