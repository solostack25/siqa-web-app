// Chai: polls, personality quizzes and trivia quizzes, with discussion.
// Data access + the Chai look (its own playful sub-brand inside Siqa:
// thick ink outlines, hard offset shadows, rounded corners, warm colors,
// Fredoka headings and Space Mono labels). Tables: supabase/migrations/
// 20261107090000_chai.sql.

import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { supabase } from './supabase';

// ── Look ───────────────────────────────────────────────────────────────
export const chai = {
  ink: '#22163a',
  ink2: '#4a3d63',
  cream: '#fff7ec',
  white: '#ffffff',
  saffron: '#ffcf3d',
  masala: '#ec6a37',
  rose: '#ff7aa8',
  cardamom: '#2fae6e',
  plum: '#9d8bff',
  line: 2.5,
};
export type CoverColor = 'saffron' | 'masala' | 'rose' | 'cardamom' | 'plum';
export const COVER_COLORS: CoverColor[] = ['saffron', 'masala', 'rose', 'cardamom', 'plum'];
export const coverHex = (c?: string | null) => (chai as any)[c ?? 'saffron'] ?? chai.saffron;
/** Bar colors for poll options, in order. */
export const OPTION_COLORS = [chai.saffron, chai.masala, chai.cardamom, chai.rose, chai.plum, '#7fd3ff'];

export function chaiFont(kind: 'display' | 'displayBold' | 'mono'): TextStyle {
  if (Platform.OS === 'web') {
    if (kind === 'mono') return { fontFamily: '"Space Mono", ui-monospace, monospace', fontWeight: '700' };
    return { fontFamily: 'Fredoka, Inter, system-ui, sans-serif', fontWeight: kind === 'displayBold' ? '700' : '600' };
  }
  if (kind === 'mono') return { fontFamily: 'SpaceMono_700Bold' };
  return { fontFamily: kind === 'displayBold' ? 'Fredoka_700Bold' : 'Fredoka_600SemiBold' };
}

/** Thick outline + hard shadow, the Chai card. */
export function chunky(shadow = 4, radius = 20, bg: string = chai.white): ViewStyle {
  return {
    backgroundColor: bg,
    borderWidth: chai.line,
    borderColor: chai.ink,
    borderRadius: radius,
    ...(shadow ? ({ boxShadow: `${shadow}px ${shadow}px 0px ${chai.ink}` } as ViewStyle) : null),
  };
}

// ── Types ──────────────────────────────────────────────────────────────
export type ChaiKind = 'poll' | 'personality' | 'trivia';
export type PollOption = { id: string; label: string };
export type PersonalityResult = { id: string; name: string; description: string };
export type Answer = { id: string; text: string; result?: string };
export type Question = { id: string; text: string; answers: Answer[]; correct?: string };
export type Tier = { min: number; name: string; description: string };
export type ChaiContent = {
  options?: PollOption[];
  results?: PersonalityResult[];
  questions?: Question[];
  tiers?: Tier[];
};
export type ChaiPost = {
  id: string;
  kind: ChaiKind;
  title: string;
  intro: string | null;
  cover_color: CoverColor;
  content: ChaiContent;
  status: 'draft' | 'live' | 'ended';
  publish_at: string | null;
  ends_at: string | null;
  comments_enabled: boolean;
  show_on_home: boolean;
  show_breakdown: boolean;
  created_at: string;
  updated_at?: string;
  comment_count?: number;
  people?: number;
};

const POST_COLS = 'id, kind, title, intro, cover_color, content, status, publish_at, ends_at, comments_enabled, show_on_home, show_breakdown, created_at, updated_at';

export function isOpen(p: ChaiPost) {
  return p.status === 'live' && (!p.ends_at || new Date(p.ends_at).getTime() > Date.now());
}

export function timeLeft(p: ChaiPost): string | null {
  if (!p.ends_at) return null;
  const ms = new Date(p.ends_at).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left`;
  const hrs = Math.max(1, Math.floor(ms / 3600000));
  return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} left`;
}

export function quizMeta(p: ChaiPost) {
  const n = p.content.questions?.length ?? 0;
  const mins = Math.max(1, Math.round(n * 10 / 60));
  return `${p.kind === 'trivia' ? 'TRIVIA' : 'QUIZ'} · ${n} ${n === 1 ? 'QUESTION' : 'QUESTIONS'} · ${mins} MIN`;
}

// ── Reads ──────────────────────────────────────────────────────────────
async function withCounts(posts: ChaiPost[]): Promise<ChaiPost[]> {
  if (!posts.length) return posts;
  const ids = posts.map(p => p.id);
  const [{ data: counts }, { data: people }] = await Promise.all([
    supabase.from('chai_comments').select('post_id').in('post_id', ids),
    supabase.rpc('chai_participants', { p_posts: ids }),
  ]);
  const cc: Record<string, number> = {};
  (counts ?? []).forEach((r: any) => { cc[r.post_id] = (cc[r.post_id] ?? 0) + 1; });
  const pp: Record<string, number> = {};
  (people ?? []).forEach((r: any) => { pp[r.post_id] = r.people; });
  return posts.map(p => ({ ...p, comment_count: cc[p.id] ?? 0, people: pp[p.id] ?? 0 }));
}

/** Live posts for the Chai tab, newest first (RLS hides drafts and scheduled ones). */
export async function fetchFeed(opts: { homeOnly?: boolean; limit?: number } = {}): Promise<ChaiPost[]> {
  let q = supabase.from('chai_posts').select(POST_COLS)
    .in('status', ['live', 'ended'])
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.homeOnly) q = q.eq('show_on_home', true).eq('status', 'live');
  const { data } = await q;
  return withCounts((data ?? []) as any);
}

export async function fetchPost(id: string): Promise<ChaiPost | null> {
  const { data } = await supabase.from('chai_posts').select(POST_COLS).eq('id', id).maybeSingle();
  if (!data) return null;
  const [p] = await withCounts([data as any]);
  return p;
}

export async function myVotes(postIds: string[]): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || !postIds.length) return {};
  const { data } = await supabase.from('chai_votes').select('post_id, option_id').in('post_id', postIds).eq('profile_id', session.user.id);
  return Object.fromEntries((data ?? []).map((r: any) => [r.post_id, r.option_id]));
}

export async function myPlay(postId: string): Promise<{ result_id: string; score: number | null; total: number | null } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase.from('chai_plays').select('result_id, score, total').eq('post_id', postId).eq('profile_id', session.user.id).maybeSingle();
  return (data as any) ?? null;
}

export async function pollResults(postId: string): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('chai_poll_results', { p_post: postId });
  return Object.fromEntries((data ?? []).map((r: any) => [r.option_id, r.votes]));
}

export async function resultBreakdown(postId: string): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('chai_result_breakdown', { p_post: postId });
  return Object.fromEntries((data ?? []).map((r: any) => [r.result_id, r.plays]));
}

// ── Writes ─────────────────────────────────────────────────────────────
export async function requireUser(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function castVote(postId: string, optionId: string) {
  const uid = await requireUser();
  if (!uid) return { error: 'signed_out' as const };
  const { error } = await supabase.from('chai_votes').upsert({ post_id: postId, profile_id: uid, option_id: optionId }, { onConflict: 'post_id,profile_id' });
  return { error: error?.message ?? null };
}

export async function savePlay(postId: string, resultId: string, score?: number, total?: number) {
  const uid = await requireUser();
  if (!uid) return { error: 'signed_out' as const };
  const { error } = await supabase.from('chai_plays').upsert(
    { post_id: postId, profile_id: uid, result_id: resultId, score: score ?? null, total: total ?? null, created_at: new Date().toISOString() },
    { onConflict: 'post_id,profile_id' },
  );
  return { error: error?.message ?? null };
}

/** Personality: the result most answers point to (ties go to the earliest result listed). */
export function personalityResult(post: ChaiPost, picks: Record<string, string>): PersonalityResult | null {
  const results = post.content.results ?? [];
  const tally: Record<string, number> = {};
  (post.content.questions ?? []).forEach(q => {
    const a = q.answers.find(x => x.id === picks[q.id]);
    if (a?.result) tally[a.result] = (tally[a.result] ?? 0) + 1;
  });
  let best: PersonalityResult | null = null;
  let bestN = -1;
  results.forEach(r => { const n = tally[r.id] ?? 0; if (n > bestN) { best = r; bestN = n; } });
  return best;
}

export function triviaScore(post: ChaiPost, picks: Record<string, string>) {
  const qs = post.content.questions ?? [];
  const score = qs.filter(q => q.correct && picks[q.id] === q.correct).length;
  const tiers = [...(post.content.tiers ?? [])].sort((a, b) => b.min - a.min);
  const tier = tiers.find(t => score >= t.min) ?? { min: 0, name: 'Nice try', description: '' };
  return { score, total: qs.length, tier };
}

// ── Discussion ─────────────────────────────────────────────────────────
export type ChaiComment = {
  id: string;
  post_id: string;
  profile_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export async function fetchComments(postId: string) {
  const uid = await requireUser();
  const [{ data: rows }, { data: badges }] = await Promise.all([
    supabase.from('chai_comments')
      .select('id, post_id, profile_id, parent_id, body, like_count, created_at, profiles(full_name, avatar_url)')
      .eq('post_id', postId).order('created_at', { ascending: false }).limit(300),
    supabase.rpc('chai_comment_badges', { p_post: postId }),
  ]);
  const comments = (rows ?? []) as any as ChaiComment[];
  let liked = new Set<string>();
  if (uid && comments.length) {
    const { data } = await supabase.from('chai_comment_likes').select('comment_id').eq('profile_id', uid).in('comment_id', comments.map(c => c.id));
    liked = new Set((data ?? []).map((r: any) => r.comment_id));
  }
  const badgeMap: Record<string, string> = Object.fromEntries((badges ?? []).filter((b: any) => b.badge).map((b: any) => [b.profile_id, b.badge]));
  return { comments, liked, badges: badgeMap, me: uid };
}

export async function addComment(postId: string, body: string, parentId?: string | null) {
  const uid = await requireUser();
  if (!uid) return { error: 'signed_out' as const };
  const { error } = await supabase.from('chai_comments').insert({ post_id: postId, profile_id: uid, body: body.trim(), parent_id: parentId ?? null });
  return { error: error?.message ?? null };
}

export async function toggleLike(commentId: string, on: boolean) {
  const uid = await requireUser();
  if (!uid) return { error: 'signed_out' as const };
  const { error } = on
    ? await supabase.from('chai_comment_likes').insert({ comment_id: commentId, profile_id: uid })
    : await supabase.from('chai_comment_likes').delete().eq('comment_id', commentId).eq('profile_id', uid);
  return { error: error?.message ?? null };
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from('chai_comments').delete().eq('id', commentId);
  return { error: error?.message ?? null };
}

export function shortName(full: string | null | undefined) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Siqa member';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export function ago(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
