import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Icon } from '../Icon';
import { Avatar } from '../SeedSocial';
import { BottomSheet, Button, Chip, IconButton, OptionRow } from '../ui';
import { showToast } from '../Toast';
import { confirmDialog } from '../../lib/dialogs';
import { font, radius, type, useDS } from '../../lib/ds';
import { REACTIONS, timeAgo, useComments, type CommentsApi, type SiqaComment } from './useComments';

type AuthIntent = 'comment' | 'reaction';
type AuthFn = (intent: AuthIntent) => void;

const defaultAuth: AuthFn = () => router.push('/(auth)/login' as any);

// ── One comment ─────────────────────────────────────────────────────────

function ReactionSummary({ c, onPress }: { c: SiqaComment; onPress: () => void }) {
  const { c: k } = useDS();
  const entries = Object.entries(c.reactions).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const total = entries.reduce((a, [, n]) => a + n, 0);
  const mine = !!c.my_reaction;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${total} reactions${mine ? ', including yours' : ''}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingLeft: 6, paddingRight: 10,
        borderRadius: radius.pill, borderWidth: 1, borderColor: mine ? '#d9c49a' : k.line, backgroundColor: mine ? k.goldTint : k.surface,
      }}
    >
      <Text style={{ fontSize: 13, letterSpacing: -2 }}>{entries.slice(0, 3).map(([e]) => e).join(' ')}</Text>
      <Text style={[type.micro, { color: mine ? k.goldInk : k.ink2 }]}>{total}</Text>
    </Pressable>
  );
}

function ReactionBar({ c, onPick }: { c: SiqaComment; onPick: (emoji: string) => void }) {
  const { c: k, shadow } = useDS();
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="React to comment"
      style={[{ flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 4, borderRadius: radius.pill, backgroundColor: k.surface, marginTop: 6 }, shadow('raised')]}
    >
      {REACTIONS.map((r) => {
        const on = c.my_reaction === r.emoji;
        return (
          <Pressable
            key={r.emoji}
            onPress={() => onPick(r.emoji)}
            accessibilityRole="button"
            accessibilityLabel={on ? `Remove ${r.label}` : r.label}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({
              width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? k.goldTint : pressed ? k.surfaceSoft : 'transparent',
              transform: [{ scale: pressed ? 1.15 : 1 }],
            })}
          >
            <Text style={{ fontSize: 22, lineHeight: 26 }}>{r.emoji}</Text>
            <Text style={[{ fontSize: 9, lineHeight: 11 }, font(600), { color: on ? k.goldInk : k.ink3 }]}>{r.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CommentItem({
  c, api, isReply, onReply, onMore, highlighted, auth,
}: {
  c: SiqaComment; api: CommentsApi; isReply?: boolean; onReply: () => void; onMore: () => void; highlighted?: boolean; auth: AuthFn;
}) {
  const { c: k } = useDS();
  const [picking, setPicking] = useState(false);
  const isSpeaker = !!api.speakerProfileId && c.profile_id === api.speakerProfileId;
  const isMine = api.me?.id === c.profile_id;

  function needAuth(intent: AuthIntent) {
    if (api.me) return false;
    auth(intent);
    return true;
  }

  return (
    <Pressable
      onLongPress={() => { if (!needAuth('reaction')) setPicking((p) => !p); }}
      delayLongPress={350}
      accessibilityHint="Long-press to react"
      style={{
        flexDirection: 'row', gap: 10,
        backgroundColor: highlighted || picking ? '#fbf8f1' : 'transparent',
        marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
      }}
    >
      <Avatar name={c.author.name} url={c.author.avatar_url} size={isReply ? 28 : 34} tone={isSpeaker ? 'gold' : 'neutral'} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {c.pinned_at && !isReply ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="pin" size={12} color={k.ink2} />
            <Text style={[type.micro, { color: k.ink2 }]}>Pinned by the speaker</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[type.caption, font(700), { color: k.ink }]} numberOfLines={1}>{c.author.name}</Text>
          {isSpeaker ? (
            <View style={{ backgroundColor: k.goldTint, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
              <Text style={[type.micro, { fontSize: 11, color: k.goldInk }]}>Speaker</Text>
            </View>
          ) : isMine ? (
            <View style={{ backgroundColor: k.surfaceSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
              <Text style={[type.micro, { fontSize: 11, color: k.ink2 }]}>You</Text>
            </View>
          ) : null}
          <Text style={[type.caption, font(400), { color: k.ink3 }]}>{timeAgo(c.created_at)}</Text>
        </View>
        <Text style={[type.subhead, font(400), { color: k.ink, lineHeight: 20 }]} selectable>{c.body}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
          <Pressable
            onPress={() => { if (!needAuth('reaction')) api.toggleLike(c); }}
            accessibilityRole="button"
            accessibilityLabel={c.liked ? 'Unlike' : 'Like'}
            accessibilityState={{ selected: c.liked }}
            hitSlop={6}
            style={{ height: 32, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Icon name={c.liked ? 'heart' : 'heart-outline'} size={17} color={c.liked ? k.danger : k.ink2} />
            {c.like_count > 0 ? <Text style={[type.micro, { color: c.liked ? k.danger : k.ink2 }]}>{c.like_count}</Text> : null}
          </Pressable>
          <Pressable
            onPress={() => { if (!needAuth('comment')) onReply(); }}
            accessibilityRole="button"
            hitSlop={6}
            style={{ height: 32, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Text style={[type.micro, font(700), { color: k.ink2 }]}>Reply</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (!needAuth('reaction')) setPicking((p) => !p); }}
            accessibilityRole="button"
            accessibilityLabel="React"
            accessibilityState={{ expanded: picking }}
            hitSlop={6}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="happy-outline" size={18} color={picking ? k.goldInk : k.ink2} />
          </Pressable>
          <View style={{ marginLeft: 'auto' }}>
            <ReactionSummary c={c} onPress={() => { if (!needAuth('reaction')) setPicking((p) => !p); }} />
          </View>
        </View>

        {picking ? (
          <ReactionBar c={c} onPick={(e) => { api.react(c, e); setPicking(false); }} />
        ) : null}
      </View>
      <IconButton icon="ellipsis-horizontal" label="More" size="sm" color={k.ink3} onPress={onMore} />
    </Pressable>
  );
}

// ── The list + composer ─────────────────────────────────────────────────

const REPORT_REASONS = ['Spam or scam', 'Hateful or abusive', 'False or misleading', 'Something else'];

export function CommentsView({
  api, commentsEnabled = true, onAuthRequired = defaultAuth, onClose, inline = false,
}: {
  api: CommentsApi; commentsEnabled?: boolean; onAuthRequired?: AuthFn; onClose?: () => void; inline?: boolean;
}) {
  const { c: k } = useDS();
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ topId: string; name: string; id: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<SiqaComment | null>(null);
  const [reporting, setReporting] = useState<SiqaComment | null>(null);
  const inputRef = useRef<TextInput>(null);

  function startReply(c: SiqaComment, topId: string) {
    setReplyTo({ topId, name: c.author.name, id: c.id });
    setOpen((o) => ({ ...o, [topId]: true }));
    // Replying to a reply mentions that person; the thread stays one level deep.
    setDraft((d) => (c.parent_id && !d.startsWith(`@${c.author.name}`) ? `@${c.author.name} ${d}` : d));
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send() {
    if (!api.me) { onAuthRequired('comment'); return; }
    if (!draft.trim() || posting) return;
    setPosting(true);
    const err = await api.post(draft, replyTo?.topId ?? null);
    setPosting(false);
    if (err) { showToast(err); return; }
    setDraft('');
    setReplyTo(null);
  }

  async function doDelete(c: SiqaComment) {
    setMenu(null);
    const ok = await confirmDialog('Delete comment?', c.parent_id ? 'This reply will be removed.' : 'This comment and its replies will be removed.', 'Delete');
    if (!ok) return;
    const err = await api.remove(c);
    showToast(err ? `Couldn't delete: ${err}` : 'Comment deleted');
  }

  async function doPin(c: SiqaComment) {
    setMenu(null);
    const err = await api.pin(c, !c.pinned_at);
    showToast(err ? `Couldn't pin: ${err}` : c.pinned_at ? 'Unpinned' : 'Pinned to the top');
  }

  async function doReport(reason: string) {
    const c = reporting;
    setReporting(null);
    if (!c) return;
    const err = await api.report(c, reason);
    showToast(err ? `Couldn't send report: ${err}` : 'Thanks. Siqa will review it.');
  }

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: inline ? 0 : 20, paddingRight: inline ? 0 : 8, paddingTop: inline ? 0 : 4 }}>
        <Text style={[type.title2, { fontSize: 20, flex: 1, color: k.ink }]} accessibilityRole="header">
          Comments{api.count ? <Text style={{ color: k.ink3 }}>{`  ${api.count}`}</Text> : null}
        </Text>
        {onClose ? <IconButton icon="close" label="Close comments" onPress={onClose} /> : null}
      </View>
      {api.count > 1 ? (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: inline ? 0 : 20, paddingTop: 10, paddingBottom: 12 }} accessibilityRole="radiogroup">
          <Chip label="Top" selected={api.sort === 'top'} onPress={() => api.setSort('top')} />
          <Chip label="Newest" selected={api.sort === 'newest'} onPress={() => api.setSort('newest')} />
        </View>
      ) : <View style={{ height: 12 }} />}
      {!inline ? <View style={{ height: 1, backgroundColor: k.line }} /> : null}
    </View>
  );

  const list = api.loading ? (
    <ActivityIndicator color={k.gold} style={{ marginTop: 32 }} />
  ) : !commentsEnabled ? (
    <Text style={[type.callout, { color: k.ink2, textAlign: 'center', paddingVertical: 40 }]}>Comments are turned off for this video.</Text>
  ) : api.threads.length === 0 ? (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: inline ? 24 : 56, paddingHorizontal: 30 }}>
      <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: k.goldTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chatbubble-outline" size={28} color={k.goldInk} />
      </View>
      <Text style={[type.headline, { color: k.ink }]}>Start the conversation</Text>
      <Text style={[type.subhead, font(400), { color: k.ink2, textAlign: 'center' }]}>Share what you took from this, or ask the speaker a question.</Text>
    </View>
  ) : (
    <View style={{ gap: 14, paddingHorizontal: inline ? 0 : 20, paddingTop: 14 }}>
      {api.threads.map(({ comment, replies }) => {
        const expanded = !!open[comment.id];
        return (
          <View key={comment.id} style={{ gap: 6 }}>
            <CommentItem
              c={comment}
              api={api}
              auth={onAuthRequired}
              highlighted={replyTo?.id === comment.id}
              onReply={() => startReply(comment, comment.id)}
              onMore={() => setMenu(comment)}
            />
            {replies.length > 0 ? (
              <>
                {expanded ? (
                  <View style={{ marginLeft: 44, gap: 6 }}>
                    {replies.map((r) => (
                      <CommentItem
                        key={r.id}
                        c={r}
                        api={api}
                        isReply
                        auth={onAuthRequired}
                        highlighted={replyTo?.id === r.id}
                        onReply={() => startReply(r, comment.id)}
                        onMore={() => setMenu(r)}
                      />
                    ))}
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setOpen((o) => ({ ...o, [comment.id]: !expanded }))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  style={{ marginLeft: 44, height: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <View style={{ width: 22, height: 1.5, backgroundColor: '#d9c49a' }} />
                  <Text style={[type.micro, font(700), { color: k.goldInk }]}>
                    {expanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                  </Text>
                  {!expanded ? <Icon name="chevron-down" size={14} color={k.goldInk} /> : null}
                </Pressable>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  const composer = !commentsEnabled ? null : !api.me ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: inline ? 0 : 16, paddingTop: 12, paddingBottom: inline ? 0 : Platform.OS === 'ios' ? 30 : 16, borderTopWidth: inline ? 0 : 1, borderTopColor: k.line, backgroundColor: k.surface }}>
      <Text style={[type.caption, font(400), { flex: 1, color: k.ink2 }]}>Sign in to comment, like and reply</Text>
      <Button label="Sign in" size="md" onPress={() => onAuthRequired('comment')} />
    </View>
  ) : (
    <View style={{ borderTopWidth: inline ? 0 : 1, borderTopColor: k.line, backgroundColor: k.surface }}>
      {replyTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 6, paddingVertical: 2, backgroundColor: k.surfaceSoft, borderRadius: inline ? radius.md : 0 }}>
          <Icon name="return-down-forward" size={15} color={k.ink2} />
          <Text style={[type.caption, font(400), { flex: 1, color: k.ink2 }]} numberOfLines={1}>
            Replying to <Text style={[font(700), { color: k.ink }]}>{replyTo.name}</Text>
          </Text>
          <IconButton icon="close" size="sm" label="Cancel reply" color={k.ink2} onPress={() => { setReplyTo(null); setDraft(''); }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', paddingHorizontal: inline ? 0 : 12, paddingTop: 4 }}>
        {REACTIONS.slice(0, 5).map((r) => (
          <Pressable key={r.emoji} onPress={() => setDraft((d) => d + r.emoji)} accessibilityLabel={`Add ${r.label}`} hitSlop={4} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 19 }}>{r.emoji}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: inline ? 0 : 16, paddingTop: 6, paddingBottom: inline ? 0 : Platform.OS === 'ios' ? 30 : 14 }}>
        <Avatar name={api.me.name} url={api.me.avatar_url} size={34} tone="gold" />
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
          placeholderTextColor={k.ink3}
          accessibilityLabel={replyTo ? `Reply to ${replyTo.name}` : 'Add a comment'}
          multiline
          maxLength={1000}
          style={[type.subhead, font(400), {
            flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, backgroundColor: k.surfaceSoft, color: k.ink,
            paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, outlineStyle: 'none',
          } as any]}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || posting}
          accessibilityRole="button"
          accessibilityLabel={replyTo ? 'Post reply' : 'Post comment'}
          style={{
            width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
            backgroundColor: draft.trim() ? k.primary : k.surfaceStrong,
          }}
        >
          {posting ? <ActivityIndicator color={k.onPrimary} size="small" /> : <Icon name="arrow-up" size={20} color={draft.trim() ? k.onPrimary : k.ink3} />}
        </Pressable>
      </View>
    </View>
  );

  const isMine = menu && api.me?.id === menu.profile_id;
  const sheets = (
    <>
      <BottomSheet visible={!!menu} onClose={() => setMenu(null)} title="Comment">
        {menu ? (
          <>
            <View style={{ padding: 12, borderRadius: radius.md, backgroundColor: k.surfaceSoft, marginBottom: 6 }}>
              <Text style={[type.caption, font(400), { color: k.ink2 }]} numberOfLines={2}>
                <Text style={[font(700), { color: k.ink }]}>{menu.author.name} </Text>{menu.body}
              </Text>
            </View>
            {commentsEnabled ? (
              <OptionRow action icon="return-down-forward" label="Reply" onPress={() => {
                const m = menu; setMenu(null);
                if (!api.me) { onAuthRequired('comment'); return; }
                startReply(m, m.parent_id ?? m.id);
              }} />
            ) : null}
            {/* No clipboard module in the app build: web copies, phones share. */}
            <OptionRow action icon={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} label={Platform.OS === 'web' ? 'Copy text' : 'Share text'} onPress={async () => {
              const m = menu; setMenu(null);
              try {
                if (Platform.OS === 'web') { await (navigator as any).clipboard.writeText(m.body); showToast('Copied'); }
                else await Share.share({ message: m.body });
              } catch { if (Platform.OS === 'web') showToast("Couldn't copy"); }
            }} />
            {api.canModerate && !menu.parent_id ? (
              <OptionRow action icon={menu.pinned_at ? 'pin' : 'pin-outline'} label={menu.pinned_at ? 'Unpin' : 'Pin to the top'} onPress={() => doPin(menu)} />
            ) : null}
            {!isMine ? (
              <OptionRow action icon="flag-outline" label="Report" onPress={() => {
                const m = menu; setMenu(null);
                if (!api.me) { onAuthRequired('comment'); return; }
                setReporting(m);
              }} />
            ) : null}
            {isMine || api.me?.admin ? (
              <OptionRow action icon="trash-outline" label="Delete" onPress={() => doDelete(menu)} last />
            ) : null}
          </>
        ) : null}
      </BottomSheet>
      <BottomSheet visible={!!reporting} onClose={() => setReporting(null)} title="Report comment">
        <Text style={[type.caption, font(400), { color: k.ink2, marginBottom: 6 }]}>What's wrong with it? Siqa reviews every report.</Text>
        {REPORT_REASONS.map((r, i) => (
          <OptionRow key={r} action label={r} onPress={() => doReport(r)} last={i === REPORT_REASONS.length - 1} />
        ))}
      </BottomSheet>
    </>
  );

  if (inline) {
    return (
      <View style={{ gap: 4 }}>
        {header}
        {composer}
        {list}
        {sheets}
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {list}
      </ScrollView>
      {composer}
      {sheets}
    </View>
  );
}

// ── Sheet (phones; centered dialog on wide screens) ─────────────────────

export function CommentsSheet({
  visible, onClose, videoId, commentsEnabled = true, onAuthRequired, onCountChange, api: given,
}: {
  visible: boolean; onClose: () => void; videoId: string; commentsEnabled?: boolean;
  onAuthRequired?: AuthFn; onCountChange?: (n: number) => void; api?: CommentsApi;
}) {
  const own = useComments(given ? null : videoId, { enabled: !given && visible });
  const api = given ?? own;
  const { c: k, shadow } = useDS();
  const { width, height } = useWindowDimensions();
  const wide = width >= 760;

  useEffect(() => { if (!api.loading) onCountChange?.(api.count); }, [api.count, api.loading]);

  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable onPress={onClose} accessibilityLabel="Close comments" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: k.scrim }} />
        <View
          style={[{
            width: '100%', maxWidth: wide ? 620 : undefined, height: wide ? Math.min(760, height * 0.86) : height * 0.82,
            backgroundColor: k.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
            borderBottomLeftRadius: wide ? radius.sheet : 0, borderBottomRightRadius: wide ? radius.sheet : 0, overflow: 'hidden',
          }, shadow('sheet')]}
        >
          {!wide ? <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: k.surfaceStrong, marginTop: 8 }} /> : <View style={{ height: 10 }} />}
          <CommentsView api={api} commentsEnabled={commentsEnabled} onAuthRequired={onAuthRequired} onClose={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Watch page: preview card on phones, full inline list on desktop ─────

export function WatchComments({ videoId, wide }: { videoId: string; wide: boolean }) {
  const api = useComments(videoId);
  const [open, setOpen] = useState(false);
  const { c: k, shadow } = useDS();

  if (wide) return <CommentsView api={api} inline />;

  const lead = api.pinned ?? api.threads[0]?.comment ?? null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Comments, ${api.count}. Open`}
        style={({ pressed }) => [{
          marginHorizontal: 16, marginVertical: 14, padding: 16, gap: 12, borderRadius: radius.xl,
          borderWidth: 1, borderColor: k.line, backgroundColor: k.surface, opacity: pressed ? 0.85 : 1,
        }, shadow('card')]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[type.headline, font(800, 'display'), { flex: 1, color: k.ink }]}>
            Comments{api.count ? <Text style={{ color: k.ink3 }}>{`  ${api.count}`}</Text> : null}
          </Text>
          <Icon name="chevron-down" size={18} color={k.ink2} />
        </View>
        {api.loading ? null : lead ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Avatar name={lead.author.name} url={lead.author.avatar_url} size={28} tone={lead.profile_id === api.speakerProfileId ? 'gold' : 'neutral'} />
            <Text style={[type.caption, font(400), { flex: 1, color: k.ink, lineHeight: 19 }]} numberOfLines={3}>
              <Text style={font(700)}>{lead.author.name} </Text>
              {lead.pinned_at ? <Text style={[font(700), { color: k.goldInk }]}>Pinned  </Text> : null}
              {lead.body}
            </Text>
          </View>
        ) : (
          <Text style={[type.caption, font(400), { color: k.ink2 }]}>No comments yet. Start the conversation.</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {api.me ? <Avatar name={api.me.name} url={api.me.avatar_url} size={28} tone="gold" /> : null}
          <View style={{ flex: 1, height: 36, borderRadius: 18, backgroundColor: k.surfaceSoft, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={[type.caption, font(400), { color: k.ink3 }]}>{api.me ? 'Add a comment…' : 'Sign in to join the conversation'}</Text>
          </View>
        </View>
      </Pressable>
      <CommentsSheet visible={open} onClose={() => setOpen(false)} videoId={videoId} api={api} />
    </>
  );
}
