import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type Reaction = { emoji: string; label: string };
// One reaction per person per comment (enforced by a unique constraint).
export const REACTIONS: Reaction[] = [
  { emoji: '❤️', label: 'Love' },
  { emoji: '🤲', label: 'Ameen' },
  { emoji: '💯', label: 'So true' },
  { emoji: '💡', label: 'Learned' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '🔥', label: 'Fire' },
];

export type SiqaComment = {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  profile_id: string;
  like_count: number;
  pinned_at: string | null;
  author: { name: string; avatar_url: string | null };
  liked: boolean;
  reactions: Record<string, number>;
  my_reaction: string | null;
};

export type SortMode = 'top' | 'newest';

const SELECT =
  'id, body, created_at, parent_id, profile_id, like_count, pinned_at, profiles!comments_profile_id_fkey(full_name, username, avatar_url)';

function shape(row: any): SiqaComment {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    parent_id: row.parent_id ?? null,
    profile_id: row.profile_id,
    like_count: row.like_count ?? 0,
    pinned_at: row.pinned_at ?? null,
    author: { name: p?.full_name || p?.username || 'Siqa user', avatar_url: p?.avatar_url ?? null },
    liked: false,
    reactions: {},
    my_reaction: null,
  };
}

function score(c: SiqaComment) {
  return c.like_count + Object.values(c.reactions).reduce((a, b) => a + b, 0);
}

/**
 * Everything the comments UI needs for one video: the thread, the viewer,
 * whether they can moderate (the video's speaker or an admin), and actions
 * that update optimistically.
 */
export function useComments(videoId: string | null | undefined, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const [all, setAll] = useState<SiqaComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string; name: string; avatar_url: string | null; admin: boolean } | null>(null);
  const [speakerProfileId, setSpeakerProfileId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('top');

  const load = useCallback(async () => {
    if (!videoId || !enabled) { setLoading(false); return; }
    setLoading(true);
    const [{ data: { user } }, rowsRes, vidRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('comments').select(SELECT).eq('video_id', videoId).order('created_at', { ascending: false }).limit(400),
      supabase.from('videos').select('speakers(profile_id)').eq('id', videoId).maybeSingle(),
    ]);
    const sp: any = (vidRes.data as any)?.speakers;
    setSpeakerProfileId((Array.isArray(sp) ? sp[0]?.profile_id : sp?.profile_id) ?? null);

    const list = ((rowsRes.data as any[]) ?? []).map(shape);
    const ids = list.map((c) => c.id);

    if (ids.length) {
      const { data: rx } = await supabase.from('comment_reactions').select('comment_id, emoji, profile_id').in('comment_id', ids);
      const byId = new Map(list.map((c) => [c.id, c]));
      for (const r of (rx as any[]) ?? []) {
        const c = byId.get(r.comment_id);
        if (!c) continue;
        c.reactions[r.emoji] = (c.reactions[r.emoji] ?? 0) + 1;
        if (user && r.profile_id === user.id) c.my_reaction = r.emoji;
      }
      if (user) {
        const { data: likes } = await supabase.from('comment_likes').select('comment_id').eq('profile_id', user.id).in('comment_id', ids);
        for (const l of (likes as any[]) ?? []) {
          const c = byId.get(l.comment_id);
          if (c) c.liked = true;
        }
      }
    }

    if (user) {
      const { data: prof } = await supabase.from('profiles').select('full_name, username, avatar_url, role').eq('id', user.id).maybeSingle();
      setMe({
        id: user.id,
        name: (prof as any)?.full_name || (prof as any)?.username || 'You',
        avatar_url: (prof as any)?.avatar_url ?? null,
        admin: (prof as any)?.role === 'admin',
      });
    } else {
      setMe(null);
    }
    setAll(list);
    setLoading(false);
  }, [videoId, enabled]);

  useEffect(() => { load(); }, [load]);

  const canModerate = !!me && (me.admin || (!!speakerProfileId && me.id === speakerProfileId));

  // Top-level comments in display order, each with its replies (oldest first).
  const threads = useMemo(() => {
    const tops = all.filter((c) => !c.parent_id);
    const replies = new Map<string, SiqaComment[]>();
    for (const c of all) {
      if (!c.parent_id) continue;
      const arr = replies.get(c.parent_id) ?? [];
      arr.push(c);
      replies.set(c.parent_id, arr);
    }
    for (const arr of replies.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sorted = [...tops].sort((a, b) => {
      if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
      if (sort === 'top') {
        const d = score(b) - score(a);
        if (d) return d;
      }
      return b.created_at.localeCompare(a.created_at);
    });
    return sorted.map((c) => ({ comment: c, replies: replies.get(c.id) ?? [] }));
  }, [all, sort]);

  const pinned = threads.find((t) => t.comment.pinned_at)?.comment ?? null;
  const count = all.length;

  function patch(id: string, fn: (c: SiqaComment) => SiqaComment) {
    setAll((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }

  async function post(body: string, parentId: string | null): Promise<string | null> {
    if (!me || !videoId) return 'Sign in to comment.';
    const text = body.trim();
    if (!text) return null;
    const { data, error } = await supabase
      .from('comments')
      .insert({ video_id: videoId, profile_id: me.id, body: text, parent_id: parentId })
      .select(SELECT)
      .single();
    if (error || !data) return error?.message || 'Comment not posted.';
    setAll((prev) => [shape(data), ...prev]);
    return null;
  }

  async function toggleLike(c: SiqaComment) {
    if (!me) return;
    const was = c.liked;
    patch(c.id, (x) => ({ ...x, liked: !was, like_count: Math.max(0, x.like_count + (was ? -1 : 1)) }));
    const res = was
      ? await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('profile_id', me.id)
      : await supabase.from('comment_likes').insert({ comment_id: c.id, profile_id: me.id });
    if (res.error) patch(c.id, (x) => ({ ...x, liked: was, like_count: Math.max(0, x.like_count + (was ? 1 : -1)) }));
  }

  async function react(c: SiqaComment, emoji: string) {
    if (!me) return;
    const prev = c.my_reaction;
    const next = prev === emoji ? null : emoji;
    patch(c.id, (x) => {
      const r = { ...x.reactions };
      if (prev) { r[prev] = (r[prev] ?? 1) - 1; if (r[prev] <= 0) delete r[prev]; }
      if (next) r[next] = (r[next] ?? 0) + 1;
      return { ...x, reactions: r, my_reaction: next };
    });
    // One reaction per person: clear the old one, then add the new one.
    if (prev) await supabase.from('comment_reactions').delete().eq('comment_id', c.id).eq('profile_id', me.id);
    if (next) {
      const { error } = await supabase.from('comment_reactions').insert({ comment_id: c.id, profile_id: me.id, emoji: next });
      if (error) load();
    }
  }

  async function remove(c: SiqaComment): Promise<string | null> {
    const { error } = await supabase.from('comments').delete().eq('id', c.id);
    if (error) return error.message;
    setAll((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id));
    return null;
  }

  async function pin(c: SiqaComment, on: boolean): Promise<string | null> {
    const { error } = await supabase.rpc('pin_comment', { p_comment: c.id, p_pin: on });
    if (error) return error.message;
    const now = new Date().toISOString();
    setAll((prev) => prev.map((x) => (x.id === c.id ? { ...x, pinned_at: on ? now : null } : { ...x, pinned_at: on ? null : x.pinned_at })));
    return null;
  }

  async function report(c: SiqaComment, reason: string): Promise<string | null> {
    if (!me || !videoId) return 'Sign in to report.';
    const { error } = await supabase.from('content_reports').insert({
      profile_id: me.id,
      video_id: videoId,
      target_type: 'comment',
      target_id: c.id,
      reported_user_id: c.profile_id,
      reason,
      details: c.body.slice(0, 500),
      status: 'open',
    });
    return error ? error.message : null;
  }

  return {
    loading, threads, pinned, count, me, speakerProfileId, canModerate,
    sort, setSort, reload: load,
    post, toggleLike, react, remove, pin, report,
  };
}

export type CommentsApi = ReturnType<typeof useComments>;

export function timeAgo(ts: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
