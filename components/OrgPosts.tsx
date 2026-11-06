/**
 * Nonprofit profile posts — Facebook-style updates on an org's page.
 *
 * Reads/writes public.org_posts, org_post_likes and org_post_comments
 * (supabase/migrations/20261106210000_org_posts.sql). Like org videos, posts
 * live ONLY on the org profile page and never reach Gems/home/browse.
 *
 * Owners (or Siqa admins) write posts with text and up to 4 photos, can
 * attach one of their Seeds, pin a post to the top, edit and delete.
 * Signed-in visitors can like and comment. The database enforces all of
 * this (RLS) plus the language filter, so errors from it are shown as-is.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, TextInput, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { brandStyles, font } from '../lib/ds';
import { uploadFileToBunny } from '../lib/bunnyUpload';
import { confirmDialog } from '../lib/dialogs';
import { getAppBaseUrl, shareLink } from '../lib/share';
import { Avatar, Card, CardTitle, PrimaryButton, timeAgo } from './SeedSocial';
import { Button } from './ui';
import { Icon } from './Icon';
import { showToast } from './Toast';

const MAX_PHOTOS = 4;
const LIVE_SEED = ['active', 'published', 'approved', 'live'];
const LONG_POST = 280;

export type OrgPost = {
  id: string;
  org_id: string;
  body: string | null;
  image_urls: string[];
  fundraiser_id: string | null;
  pinned_at: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
};

type PostComment = {
  id: string;
  post_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  author: { name: string; avatar_url: string | null };
};

type SeedLite = { id: string; title: string; status: string };
type Me = { id: string; name: string; avatar_url: string | null };

const COMMENT_SELECT = 'id, post_id, profile_id, body, created_at, profiles(full_name, username, avatar_url)';

function shapeComment(row: any): PostComment {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id, post_id: row.post_id, profile_id: row.profile_id, body: row.body, created_at: row.created_at,
    author: { name: p?.full_name || p?.username || 'Siqa user', avatar_url: p?.avatar_url ?? null },
  };
}

function goLogin() {
  router.push('/(auth)/login' as any);
}

// ── Main block ───────────────────────────────────────────────────────────

export function OrgPosts({
  orgId, orgName, orgLogo, canEdit, limit, onSeeAll, onCount,
}: {
  orgId: string;
  orgName: string;
  orgLogo: string | null;
  canEdit: boolean;
  /** Overview shows a few; the Posts tab shows all. */
  limit?: number;
  onSeeAll?: () => void;
  onCount?: (n: number) => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [posts, setPosts] = useState<OrgPost[]>([]);
  const [seeds, setSeeds] = useState<SeedLite[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrgPost | 'new' | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  const load = useCallback(async () => {
    const [{ data: { user } }, pRes, sRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('org_posts').select('*').eq('org_id', orgId)
        .order('pinned_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit ? limit + 1 : 200),
      supabase.from('fundraisers').select('id,title,status').eq('org_id', orgId).order('created_at', { ascending: false }),
    ]);
    const list = (pRes.data as OrgPost[]) || [];
    setPosts(list);
    setSeeds((sRes.data as SeedLite[]) || []);

    if (user) {
      const [{ data: prof }, likesRes] = await Promise.all([
        supabase.from('profiles').select('full_name, username, avatar_url').eq('id', user.id).maybeSingle(),
        list.length
          ? supabase.from('org_post_likes').select('post_id').eq('profile_id', user.id).in('post_id', list.map(p => p.id))
          : Promise.resolve({ data: [] as any[] }),
      ]);
      setMe({ id: user.id, name: (prof as any)?.full_name || (prof as any)?.username || 'You', avatar_url: (prof as any)?.avatar_url ?? null });
      setLiked(new Set(((likesRes.data as any[]) || []).map(l => l.post_id)));
    } else {
      setMe(null);
      setLiked(new Set());
    }
    setLoading(false);
  }, [orgId, limit]);

  useEffect(() => { load(); }, [load]);

  // Total count for the tab label (the list above may be limited).
  useEffect(() => {
    if (!onCount) return;
    supabase.from('org_posts').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
      .then(({ count }) => onCount(count ?? 0));
  }, [orgId, posts.length]);

  const seedById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const shown = limit ? posts.slice(0, limit) : posts;

  // Visitors see nothing on Overview when there are no posts.
  if (!loading && !posts.length && !canEdit && limit) return null;

  async function toggleLike(p: OrgPost) {
    if (!me) { goLogin(); return; }
    const was = liked.has(p.id);
    const next = new Set(liked);
    if (was) next.delete(p.id); else next.add(p.id);
    setLiked(next);
    setPosts(ps => ps.map(x => x.id === p.id ? { ...x, like_count: Math.max(0, x.like_count + (was ? -1 : 1)) } : x));
    const res = was
      ? await supabase.from('org_post_likes').delete().eq('post_id', p.id).eq('profile_id', me.id)
      : await supabase.from('org_post_likes').insert({ post_id: p.id });
    if (res.error) { showToast(res.error.message); load(); }
  }

  async function togglePin(p: OrgPost) {
    const { error } = await supabase.from('org_posts')
      .update({ pinned_at: p.pinned_at ? null : new Date().toISOString() }).eq('id', p.id);
    if (error) showToast(error.message);
    else { showToast(p.pinned_at ? 'Unpinned' : 'Pinned to top'); load(); }
  }

  async function remove(p: OrgPost) {
    if (!(await confirmDialog('Delete this post?', 'Its likes and comments will be deleted too.', 'Delete'))) return;
    const { error } = await supabase.from('org_posts').delete().eq('id', p.id);
    if (error) showToast(error.message); else { showToast('Post deleted'); load(); }
  }

  function setCommentCount(postId: string, delta: number) {
    setPosts(ps => ps.map(x => x.id === postId ? { ...x, comment_count: Math.max(0, x.comment_count + delta) } : x));
  }

  // On the Posts tab, visitors just see the feed; the header card is for the
  // Overview preview, the owner's composer, and loading/empty states.
  const showHeader = canEdit || !!limit || loading || posts.length === 0;

  return (
    <View style={{ gap: 14 }}>
      {showHeader ? <Card>
        <CardTitle
          icon="newspaper-outline"
          right={limit && posts.length > limit && onSeeAll ? (
            <TouchableOpacity onPress={onSeeAll} style={styles.textBtn}><Text style={styles.link}>See all</Text></TouchableOpacity>
          ) : null}
        >
          Posts
        </CardTitle>

        {canEdit ? (
          <TouchableOpacity style={styles.composer} onPress={() => setEditing('new')} accessibilityRole="button" accessibilityLabel="Write a post">
            <Avatar name={orgName} url={orgLogo} size={40} tone="emerald" square />
            <Text style={styles.composerText}>Share an update with your supporters…</Text>
            <Icon name="images-outline" size={20} color={C.emerald} />
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <ActivityIndicator color={C.gold} />
        ) : posts.length === 0 ? (
          <Text style={styles.muted}>
            {canEdit ? 'No posts yet. Share news, photos from your events, or an update on a Seed.' : 'No posts yet.'}
          </Text>
        ) : null}
      </Card> : null}

      {shown.map(p => (
        <PostCard
          key={p.id}
          post={p}
          orgName={orgName}
          orgLogo={orgLogo}
          seed={p.fundraiser_id ? seedById[p.fundraiser_id] ?? null : null}
          canEdit={canEdit}
          me={me}
          liked={liked.has(p.id)}
          onLike={() => toggleLike(p)}
          onEdit={() => setEditing(p)}
          onPin={() => togglePin(p)}
          onDelete={() => remove(p)}
          onOpenPhoto={(index) => setViewer({ urls: p.image_urls, index })}
          onCommentDelta={(d) => setCommentCount(p.id, d)}
        />
      ))}

      {limit && posts.length > limit && onSeeAll ? (
        <Button variant="secondary" label="See all posts" onPress={onSeeAll} />
      ) : null}

      <PhotoViewer viewer={viewer} onClose={() => setViewer(null)} onIndex={(i) => setViewer(v => v ? { ...v, index: i } : v)} />
      {canEdit && editing ? (
        <EditorModal
          orgId={orgId}
          orgName={orgName}
          orgLogo={orgLogo}
          post={editing === 'new' ? null : editing}
          seeds={seeds}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      ) : null}
    </View>
  );
}

// ── One post ─────────────────────────────────────────────────────────────

function PostCard({
  post: p, orgName, orgLogo, seed, canEdit, me, liked, onLike, onEdit, onPin, onDelete, onOpenPhoto, onCommentDelta,
}: {
  post: OrgPost; orgName: string; orgLogo: string | null; seed: SeedLite | null; canEdit: boolean; me: Me | null;
  liked: boolean; onLike: () => void; onEdit: () => void; onPin: () => void; onDelete: () => void;
  onOpenPhoto: (index: number) => void; onCommentDelta: (d: number) => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const body = p.body?.trim() || '';
  const long = body.length > LONG_POST;
  const seedLive = seed && LIVE_SEED.includes(seed.status);
  const edited = new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000;

  function share() {
    shareLink({
      url: `${getAppBaseUrl()}/org-profile?id=${p.org_id}&tab=posts`,
      title: orgName,
      text: body ? `${orgName}: ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}` : `${orgName} on Siqa`,
    });
  }

  return (
    <Card>
      <View style={styles.postHead}>
        <Avatar name={orgName} url={orgLogo} size={42} tone="emerald" square />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{orgName}</Text>
          <Text style={styles.meta}>
            {timeAgo(p.created_at)}{edited ? ' · Edited' : ''}{p.pinned_at ? ' · ' : ''}
            {p.pinned_at ? <Text style={styles.pinned}>Pinned</Text> : null}
          </Text>
        </View>
        {canEdit ? (
          <TouchableOpacity onPress={() => setMenu(m => !m)} style={styles.iconBtn} accessibilityLabel="Post options">
            <Icon name="ellipsis-horizontal" size={20} color={C.text2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {menu ? (
        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setMenu(false); onEdit(); }}>
            <Icon name="create-outline" size={18} color={C.text} /><Text style={styles.menuText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setMenu(false); onPin(); }}>
            <Icon name={p.pinned_at ? 'pin' : 'pin-outline'} size={18} color={C.text} />
            <Text style={styles.menuText}>{p.pinned_at ? 'Unpin' : 'Pin to top'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setMenu(false); onDelete(); }}>
            <Icon name="trash-outline" size={18} color={C.danger} /><Text style={[styles.menuText, { color: C.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {body ? (
        <View>
          <Text style={styles.body} numberOfLines={long && !expanded ? 6 : undefined}>{body}</Text>
          {long ? (
            <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.textBtn}>
              <Text style={styles.link}>{expanded ? 'See less' : 'See more'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {p.image_urls.length ? <PhotoGrid urls={p.image_urls} onOpen={onOpenPhoto} /> : null}

      {seed && seedLive ? (
        <TouchableOpacity
          style={styles.seedRow}
          onPress={() => router.push({ pathname: '/seed/[id]', params: { id: seed.id } } as any)}
          accessibilityRole="button"
        >
          <Icon name="leaf-outline" size={18} color={C.emerald} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.seedLabel}>Support this Seed</Text>
            <Text style={styles.seedTitle} numberOfLines={1}>{seed.title}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={C.emerald} />
        </TouchableOpacity>
      ) : null}

      {p.like_count || p.comment_count ? (
        <View style={styles.counts}>
          <Text style={styles.meta}>{p.like_count ? `${p.like_count} ${p.like_count === 1 ? 'like' : 'likes'}` : ''}</Text>
          {p.comment_count ? (
            <TouchableOpacity onPress={() => setShowComments(s => !s)}>
              <Text style={styles.meta}>{p.comment_count} {p.comment_count === 1 ? 'comment' : 'comments'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onLike} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
          <Icon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? C.danger : C.text2} />
          <Text style={[styles.actionText, liked && { color: C.danger }]}>Like</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => setShowComments(s => !s)} accessibilityRole="button" accessibilityLabel="Comment">
          <Icon name="chatbubble-outline" size={19} color={C.text2} />
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={share} accessibilityRole="button" accessibilityLabel="Share">
          <Icon name="share-outline" size={19} color={C.text2} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>

      {showComments ? <PostComments postId={p.id} canModerate={canEdit} me={me} onDelta={onCommentDelta} /> : null}
    </Card>
  );
}

// ── Photos ───────────────────────────────────────────────────────────────

function PhotoGrid({ urls, onOpen }: { urls: string[]; onOpen: (i: number) => void }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const tile = (i: number, style: any) => (
    <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => onOpen(i)} style={[styles.photo, style]} accessibilityLabel={`Photo ${i + 1} of ${urls.length}`}>
      <Image source={{ uri: urls[i] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </TouchableOpacity>
  );
  if (urls.length === 1) return <View style={styles.photos}>{tile(0, { aspectRatio: 4 / 3 })}</View>;
  if (urls.length === 2) {
    return <View style={[styles.photos, styles.photoRow]}>{tile(0, { flex: 1, aspectRatio: 1 })}{tile(1, { flex: 1, aspectRatio: 1 })}</View>;
  }
  if (urls.length === 3) {
    return (
      <View style={styles.photos}>
        {tile(0, { aspectRatio: 16 / 9 })}
        <View style={styles.photoRow}>{tile(1, { flex: 1, aspectRatio: 1.4 })}{tile(2, { flex: 1, aspectRatio: 1.4 })}</View>
      </View>
    );
  }
  return (
    <View style={styles.photos}>
      <View style={styles.photoRow}>{tile(0, { flex: 1, aspectRatio: 1 })}{tile(1, { flex: 1, aspectRatio: 1 })}</View>
      <View style={styles.photoRow}>{tile(2, { flex: 1, aspectRatio: 1 })}{tile(3, { flex: 1, aspectRatio: 1 })}</View>
    </View>
  );
}

function PhotoViewer({ viewer, onClose, onIndex }: {
  viewer: { urls: string[]; index: number } | null; onClose: () => void; onIndex: (i: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  if (!viewer) return null;
  const { urls, index } = viewer;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={{ uri: urls[index] }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
        <TouchableOpacity onPress={onClose} accessibilityLabel="Close" style={{ position: 'absolute', top: Platform.OS === 'ios' ? 56 : 20, right: 16, padding: 10 }}>
          <Icon name="close" size={28} color="#fff" />
        </TouchableOpacity>
        {urls.length > 1 ? (
          <View style={{ position: 'absolute', bottom: 48, flexDirection: 'row', alignItems: 'center', gap: 24 }}>
            <TouchableOpacity disabled={index === 0} onPress={() => onIndex(index - 1)} style={{ padding: 10, opacity: index === 0 ? 0.3 : 1 }} accessibilityLabel="Previous photo">
              <Icon name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 15, ...font(600) }}>{index + 1} / {urls.length}</Text>
            <TouchableOpacity disabled={index === urls.length - 1} onPress={() => onIndex(index + 1)} style={{ padding: 10, opacity: index === urls.length - 1 ? 0.3 : 1 }} accessibilityLabel="Next photo">
              <Icon name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────

function PostComments({ postId, canModerate, me, onDelta }: {
  postId: string; canModerate: boolean; me: Me | null; onDelta: (d: number) => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [list, setList] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from('org_post_comments').select(COMMENT_SELECT).eq('post_id', postId).order('created_at', { ascending: true }).limit(300)
      .then(({ data }) => { setList(((data as any[]) || []).map(shapeComment)); setLoading(false); });
  }, [postId]);

  async function send() {
    if (!me) { goLogin(); return; }
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { data, error } = await supabase.from('org_post_comments').insert({ post_id: postId, body }).select(COMMENT_SELECT).single();
    setSending(false);
    if (error) { showToast(error.message); return; }
    setList(l => [...l, shapeComment(data)]);
    setText('');
    onDelta(1);
  }

  async function del(c: PostComment) {
    if (!(await confirmDialog('Delete this comment?', '', 'Delete'))) return;
    const { error } = await supabase.from('org_post_comments').delete().eq('id', c.id);
    if (error) { showToast(error.message); return; }
    setList(l => l.filter(x => x.id !== c.id));
    onDelta(-1);
  }

  return (
    <View style={styles.comments}>
      {loading ? <ActivityIndicator color={C.gold} /> : list.map(c => (
        <View key={c.id} style={styles.comment}>
          <Avatar name={c.author.name} url={c.author.avatar_url} size={32} tone="neutral" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={styles.bubble}>
              <Text style={styles.commentName}>{c.author.name}</Text>
              <Text style={styles.commentBody}>{c.body}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 14, paddingLeft: 10 }}>
              <Text style={styles.meta}>{timeAgo(c.created_at)}</Text>
              {me && (me.id === c.profile_id || canModerate) ? (
                <TouchableOpacity onPress={() => del(c)}><Text style={[styles.meta, { color: C.danger }]}>Delete</Text></TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      ))}

      {me ? (
        <View style={styles.commentInputRow}>
          <Avatar name={me.name} url={me.avatar_url} size={32} tone="neutral" />
          <TextInput
            style={styles.commentInput} value={text} onChangeText={setText} placeholder="Write a comment…"
            placeholderTextColor={C.text3} multiline maxLength={2000}
          />
          <TouchableOpacity onPress={send} disabled={!text.trim() || sending} style={[styles.iconBtn, { opacity: text.trim() ? 1 : 0.4 }]} accessibilityLabel="Post comment">
            {sending ? <ActivityIndicator color={C.emerald} /> : <Icon name="send" size={20} color={C.emerald} />}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={goLogin} style={styles.textBtn}><Text style={styles.link}>Sign in to comment</Text></TouchableOpacity>
      )}
    </View>
  );
}

// ── Write / edit ─────────────────────────────────────────────────────────

type Photo = { uri: string; uploaded: boolean; mimeType?: string; fileName?: string };

function EditorModal({ orgId, orgName, orgLogo, post, seeds, onClose, onSaved }: {
  orgId: string; orgName: string; orgLogo: string | null; post: OrgPost | null; seeds: SeedLite[];
  onClose: () => void; onSaved: () => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isNew = !post;
  const [body, setBody] = useState(post?.body ?? '');
  const [photos, setPhotos] = useState<Photo[]>((post?.image_urls ?? []).map(uri => ({ uri, uploaded: true })));
  const [seedId, setSeedId] = useState<string | null>(post?.fundraiser_id ?? null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const canSave = (!!body.trim() || photos.length > 0) && !saving;

  async function addPhotos() {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { showToast(`Up to ${MAX_PHOTOS} photos per post`); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your photos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, selectionLimit: room, quality: 0.85,
    });
    if (r.canceled) return;
    const picked = r.assets.slice(0, room).map(a => ({ uri: a.uri, uploaded: false, mimeType: a.mimeType || 'image/jpeg', fileName: a.fileName || 'photo.jpg' }));
    setPhotos(ps => [...ps, ...picked]);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const stamp = Date.now();
      const urls: string[] = [];
      const toUpload = photos.filter(p => !p.uploaded).length;
      let done = 0;
      for (const [i, p] of photos.entries()) {
        if (p.uploaded) { urls.push(p.uri); continue; }
        setProgress(`Uploading photo ${done + 1} of ${toUpload}…`);
        const ext = (p.fileName?.split('.').pop() || 'jpg').toLowerCase();
        urls.push(await uploadFileToBunny({ uri: p.uri, mimeType: p.mimeType || 'image/jpeg', fileName: `org-posts/${orgId}/${stamp}_${i}.${ext}` }));
        done++;
      }
      setProgress(null);
      const row = { org_id: orgId, body: body.trim() || null, image_urls: urls, fundraiser_id: seedId };
      const res = isNew
        ? await supabase.from('org_posts').insert(row)
        : await supabase.from('org_posts').update({ body: row.body, image_urls: row.image_urls, fundraiser_id: row.fundraiser_id }).eq('id', post!.id);
      if (res.error) throw res.error;
      showToast(isNew ? 'Posted' : 'Post updated');
      onSaved();
    } catch (e: any) {
      showToast(e?.message || 'Could not save post');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlayBottom} activeOpacity={1} onPress={saving ? undefined : onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.editSheet}>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={styles.postHead}>
              <Text style={styles.sheetTitle}>{isNew ? 'Create post' : 'Edit post'}</Text>
              <TouchableOpacity onPress={onClose} disabled={saving} style={styles.iconBtn} accessibilityLabel="Close">
                <Icon name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.postHead}>
              <Avatar name={orgName} url={orgLogo} size={40} tone="emerald" square />
              <Text style={styles.rowTitle} numberOfLines={1}>{orgName}</Text>
            </View>

            <TextInput
              style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]} value={body} onChangeText={setBody}
              maxLength={5000} multiline autoFocus={isNew} placeholder="What's happening at your organization?" placeholderTextColor={C.text3}
            />

            {photos.length ? (
              <View style={styles.thumbRow}>
                {photos.map((p, i) => (
                  <View key={`${p.uri}-${i}`} style={styles.thumbBox}>
                    <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <TouchableOpacity onPress={() => setPhotos(ps => ps.filter((_, j) => j !== i))} style={styles.thumbX} accessibilityLabel={`Remove photo ${i + 1}`}>
                      <Icon name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity style={styles.pickBox} onPress={addPhotos} disabled={photos.length >= MAX_PHOTOS}>
              <Icon name="images-outline" size={20} color={C.emerald} />
              <Text style={styles.muted}>
                {photos.length >= MAX_PHOTOS ? `${MAX_PHOTOS} photos max` : `Add photos (${photos.length}/${MAX_PHOTOS})`}
              </Text>
            </TouchableOpacity>

            {seeds.length ? (
              <>
                <Text style={styles.label}>Attach a Seed (optional)</Text>
                <Text style={styles.muted}>Shows a "Support this Seed" button on the post.</Text>
                <View style={styles.chips}>
                  <TouchableOpacity style={[styles.chip, !seedId && styles.chipOn]} onPress={() => setSeedId(null)}>
                    <Text style={[styles.chipText, !seedId && styles.chipTextOn]}>No Seed</Text>
                  </TouchableOpacity>
                  {seeds.map(s => (
                    <TouchableOpacity key={s.id} style={[styles.chip, seedId === s.id && styles.chipOn]} onPress={() => setSeedId(s.id)}>
                      <Text style={[styles.chipText, seedId === s.id && styles.chipTextOn]} numberOfLines={1}>
                        {s.title}{LIVE_SEED.includes(s.status) ? '' : ` (${s.status})`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.muted}>Posts appear only on your organization's page.</Text>
            {progress ? <Text style={styles.muted}>{progress}</Text> : null}
            <PrimaryButton label={isNew ? 'Post' : 'Save changes'} onPress={save} busy={saving} disabled={!canSave} style={{ marginTop: 4 }} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    composer: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    composerText: { flex: 1, color: C.text3, fontSize: 15 },

    postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    meta: { color: C.text3, fontSize: 13 },
    pinned: { color: C.gold, fontSize: 13, ...font(700) },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    menu: { borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, overflow: 'hidden' },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14 },
    menuText: { color: C.text, fontSize: 15, ...font(600) },

    photos: { gap: 4, borderRadius: 12, overflow: 'hidden' },
    photoRow: { flexDirection: 'row', gap: 4 },
    photo: { width: '100%', backgroundColor: C.surface2, overflow: 'hidden' },

    seedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: C.emeraldBg },
    seedLabel: { color: C.emerald, fontSize: 13, ...font(700) },
    seedTitle: { color: C.text, fontSize: 14, ...font(600) },

    counts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    actions: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.border2, paddingTop: 4 },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
    actionText: { color: C.text2, fontSize: 14, ...font(600) },

    comments: { gap: 10, borderTopWidth: 1, borderColor: C.border2, paddingTop: 12 },
    comment: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bubble: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
    commentName: { color: C.text, fontSize: 13, ...font(700) },
    commentBody: { color: C.text, fontSize: 14, lineHeight: 20 },
    commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    commentInput: {
      flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 20,
      paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: C.text, fontSize: 14,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
    },

    overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center' },
    editSheet: { width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
    sheetTitle: { flex: 1, color: C.text, fontSize: 19, ...font(800) },
    thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    thumbBox: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface2 },
    thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
    pickBox: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { maxWidth: '100%', minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    chipOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    chipText: { color: C.text2, fontSize: 13, ...font(600) },
    chipTextOn: { color: C.emerald },

    body: { color: C.text, fontSize: 15, lineHeight: 23 },
    muted: { color: C.text2, fontSize: 14, lineHeight: 20, flexShrink: 1 },
    link: { color: C.emerald, fontSize: 14, ...font(700) },
    textBtn: { minHeight: 36, justifyContent: 'center' },
    rowTitle: { flex: 1, color: C.text, fontSize: 15, ...font(700) },
    label: { color: C.text, fontSize: 14, ...font(700), marginTop: 4 },
    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15 },
  }));
}
