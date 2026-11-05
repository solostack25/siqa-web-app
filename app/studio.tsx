import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon, type SiqaIconName } from '../components/Icon';

/**
 * Speaker Studio — the speaker's own dashboard: channel analytics plus a
 * full list of every video/Gem they've posted (published or not).
 *
 * Analytics are built only from data Siqa actually records:
 *  - follows.created_at       → follower growth over time
 *  - video_likes.created_at   → likes over time
 *  - comments.created_at      → comments over time
 *  - videos.view_count        → lifetime views (no per-day view log exists yet)
 */

const SIDEBAR_WIDTH = 220;
const DAY = 86400000;
const PAGE_SIZE = 25;

type Speaker = {
  id: string;
  display_name: string;
  profile_id: string;
  follower_count: number | null;
  total_raised: number | null;
  is_verified: boolean;
  approval_status: string | null;
  avatar_url: string | null;
};

type StudioVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_secs: number | null;
  format: string | null;
  platform: string | null;
  is_published: boolean | null;
  published_at: string | null;
  created_at: string;
  status: string | null;
};

type Range = '7' | '28' | '90' | 'all';
type StatusKey = 'published' | 'scheduled' | 'draft' | 'removed';
type StatusFilter = 'all' | StatusKey;
type TypeFilter = 'all' | 'long' | 'short';
type SortKey = 'newest' | 'views' | 'likes' | 'comments';

type Activity = { followers: string[]; likes: string[]; comments: CommentRow[] };
type CommentRow = { id: string; video_id: string; profile_id: string; parent_id: string | null; created_at: string };

const RANGE_LABEL: Record<Range, string> = { '7': 'Last 7 days', '28': 'Last 28 days', '90': 'Last 90 days', all: 'Last 12 months' };

function videoStatus(v: StudioVideo): StatusKey {
  if (v.status === 'rejected') return 'removed';
  if (!v.is_published) return 'draft';
  if (v.published_at && new Date(v.published_at).getTime() > Date.now()) return 'scheduled';
  return 'published';
}

function fmt(n: number | null | undefined) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function fmtMoney(cents: number | null) {
  if (!cents) return '$0';
  const d = cents / 100;
  if (d >= 1000000) return '$' + (d / 1000000).toFixed(1) + 'M';
  if (d >= 10000) return '$' + Math.round(d / 1000) + 'K';
  return '$' + Math.round(d).toLocaleString();
}

function fmtDur(secs: number | null) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function fmtDate(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function pctDelta(cur: number, prev: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0) return cur > 0 ? { text: 'New', dir: 'up' } : { text: '—', dir: 'flat' };
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { text: '0%', dir: 'flat' };
  return { text: (p > 0 ? '+' : '') + p + '%', dir: p > 0 ? 'up' : 'down' };
}

function confirmAction(title: string, message: string): Promise<boolean> {
  // Alert.alert is a no-op on react-native-web, so use the browser dialog there.
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/** PostgREST `in` filters go in the URL — keep id lists short. */
async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await run(ids.slice(i, i + 80));
    if (data) out.push(...data);
  }
  return out;
}

export default function StudioScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = isDesktopWeb ? windowWidth - SIDEBAR_WIDTH : windowWidth;
  const wide = contentWidth >= 900;
  const styles = makeStyles(C, isDesktopWeb);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [videos, setVideos] = useState<StudioVideo[]>([]);
  const [activity, setActivity] = useState<Activity>({ followers: [], likes: [], comments: [] });

  const [range, setRange] = useState<Range>('28');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSignedIn(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setSignedIn(true);
    const uid = session.user.id;

    const { data: sp } = await supabase
      .from('speakers')
      .select('id, display_name, profile_id, follower_count, total_raised, is_verified, approval_status, avatar_url')
      .eq('profile_id', uid)
      .maybeSingle();

    if (!sp) {
      setSpeaker(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setSpeaker(sp as Speaker);

    // Own videos are readable regardless of publish state (videos_own_all).
    const { data: vids } = await supabase
      .from('videos')
      .select('id, title, thumbnail_url, view_count, like_count, comment_count, duration_secs, format, platform, is_published, published_at, created_at, status')
      .eq('speaker_id', sp.id)
      .order('created_at', { ascending: false })
      .limit(2000);
    const list = (vids as StudioVideo[]) ?? [];
    setVideos(list);

    // Activity for the last ~13 months: covers every range incl. its comparison period.
    const since = new Date(Date.now() - 400 * DAY).toISOString();
    const ids = list.map(v => v.id);

    const [followRes, likeRows, commentRows] = await Promise.all([
      supabase.from('follows').select('created_at').eq('following_id', uid).gte('created_at', since).limit(20000),
      inChunks<{ created_at: string }>(ids, chunk =>
        supabase.from('video_likes').select('created_at').in('video_id', chunk).gte('created_at', since).limit(20000)),
      inChunks<CommentRow>(ids, chunk =>
        supabase.from('comments').select('id, video_id, profile_id, parent_id, created_at').in('video_id', chunk).gte('created_at', since).limit(20000)),
    ]);

    setActivity({
      followers: ((followRes.data as { created_at: string }[]) ?? []).map(r => r.created_at),
      likes: likeRows.map(r => r.created_at),
      comments: commentRows,
    });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---------- Derived analytics ----------
  const now = Date.now();
  const rangeDays = range === 'all' ? 365 : Number(range);
  const start = now - rangeDays * DAY;
  const prevStart = start - rangeDays * DAY;

  const countIn = (stamps: string[], from: number, to: number) =>
    stamps.reduce((n, s) => { const t = new Date(s).getTime(); return t >= from && t < to ? n + 1 : n; }, 0);

  const kpis = useMemo(() => {
    const commentStamps = activity.comments.filter(c => c.profile_id !== speaker?.profile_id).map(c => c.created_at);
    const uploads = videos.filter(v => videoStatus(v) === 'published' && v.published_at).map(v => v.published_at as string);
    const totalViews = videos.reduce((s, v) => s + (v.view_count ?? 0), 0);
    const mk = (label: string, stamps: string[], icon: SiqaIconName) => {
      const cur = countIn(stamps, start, now);
      const prev = countIn(stamps, prevStart, start);
      return { label, value: fmt(cur), delta: pctDelta(cur, prev), icon, note: 'vs previous period' };
    };
    return [
      { label: 'Total views', value: fmt(totalViews), delta: null, icon: 'eye-outline' as SiqaIconName, note: 'Lifetime, all videos' },
      mk('New followers', activity.followers, 'people-outline'),
      mk('Likes', activity.likes, 'heart-outline'),
      mk('Comments', commentStamps, 'chatbubble-outline'),
      mk('Uploads', uploads, 'cloud-upload-outline'),
      { label: 'Raised', value: fmtMoney(speaker?.total_raised ?? 0), delta: null, icon: 'cash-outline' as SiqaIconName, note: 'Lifetime' },
    ];
  }, [activity, videos, range, speaker]);

  const chart = useMemo(() => {
    // Buckets: daily for 7/28d, weekly for 90d, monthly for 12 months.
    const buckets: { from: number; to: number; label: string }[] = [];
    if (range === 'all') {
      const d = new Date();
      for (let i = 11; i >= 0; i--) {
        const from = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime();
        const to = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
        buckets.push({ from, to, label: new Date(from).toLocaleDateString('en-US', { month: 'short' }) });
      }
    } else {
      const size = range === '90' ? 7 * DAY : DAY;
      const n = Math.ceil((rangeDays * DAY) / size);
      const todayEnd = new Date(); todayEnd.setHours(24, 0, 0, 0);
      for (let i = n - 1; i >= 0; i--) {
        const to = todayEnd.getTime() - i * size;
        const from = to - size;
        buckets.push({ from, to, label: new Date(from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
      }
    }
    const uploadTimes = videos
      .filter(v => videoStatus(v) === 'published' && v.published_at)
      .map(v => new Date(v.published_at as string).getTime());
    const followerTimes = activity.followers.map(s => new Date(s).getTime());
    const vals = buckets.map(b => followerTimes.filter(t => t >= b.from && t < b.to).length);
    const max = Math.max(1, ...vals);
    return {
      bars: buckets.map((b, i) => ({
        key: b.from,
        value: vals[i],
        pct: vals[i] / max,
        upload: uploadTimes.some(t => t >= b.from && t < b.to),
        label: b.label,
      })),
      total: vals.reduce((a, b) => a + b, 0),
      startLabel: buckets[0]?.label ?? '',
      endLabel: buckets[buckets.length - 1]?.label ?? '',
      unit: range === 'all' ? 'month' : range === '90' ? 'week' : 'day',
    };
  }, [activity, videos, range]);

  const topVideos = useMemo(
    () => videos.filter(v => videoStatus(v) === 'published').sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).slice(0, 5),
    [videos],
  );

  const formatSplit = useMemo(() => {
    const pub = videos.filter(v => videoStatus(v) === 'published');
    const longViews = pub.filter(v => v.format !== 'short').reduce((s, v) => s + (v.view_count ?? 0), 0);
    const shortViews = pub.filter(v => v.format === 'short').reduce((s, v) => s + (v.view_count ?? 0), 0);
    const total = Math.max(1, longViews + shortViews);
    const yt = pub.filter(v => v.platform === 'youtube').length;
    return [
      { label: 'Long-form videos', value: longViews, pct: longViews / total },
      { label: 'Gems (shorts)', value: shortViews, pct: shortViews / total },
      { yt, siqa: pub.length - yt },
    ] as const;
  }, [videos]);

  const attention = useMemo(() => {
    const mine = speaker?.profile_id;
    const repliedTo = new Set(activity.comments.filter(c => c.profile_id === mine && c.parent_id).map(c => c.parent_id));
    const monthAgo = now - 30 * DAY;
    const unanswered = activity.comments.filter(
      c => !c.parent_id && c.profile_id !== mine && !repliedTo.has(c.id) && new Date(c.created_at).getTime() >= monthAgo,
    ).length;
    const noThumb = videos.filter(v => !v.thumbnail_url && videoStatus(v) !== 'removed').length;
    const drafts = videos.filter(v => videoStatus(v) === 'draft').length;
    const removed = videos.filter(v => videoStatus(v) === 'removed').length;
    return [
      { label: 'Comments without your reply (30 days)', count: unanswered, icon: 'chatbubbles-outline' as SiqaIconName },
      { label: 'Videos missing a thumbnail', count: noThumb, icon: 'image-outline' as SiqaIconName },
      { label: 'Unpublished drafts', count: drafts, icon: 'document-outline' as SiqaIconName, onPress: () => { setStatusFilter('draft'); setPage(0); } },
      ...(removed ? [{ label: 'Removed by moderators', count: removed, icon: 'alert-circle-outline' as SiqaIconName, onPress: () => { setStatusFilter('removed'); setPage(0); } }] : []),
    ];
  }, [activity, videos, speaker]);

  // ---------- Video library ----------
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: videos.length, published: 0, scheduled: 0, draft: 0, removed: 0 };
    videos.forEach(v => { c[videoStatus(v)]++; });
    return c;
  }, [videos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = videos.filter(v =>
      (statusFilter === 'all' || videoStatus(v) === statusFilter) &&
      (typeFilter === 'all' || (typeFilter === 'short' ? v.format === 'short' : v.format !== 'short')) &&
      (!q || v.title.toLowerCase().includes(q)),
    );
    const date = (v: StudioVideo) => v.published_at || v.created_at;
    list.sort((a, b) => {
      if (sortKey === 'views') return (b.view_count ?? 0) - (a.view_count ?? 0);
      if (sortKey === 'likes') return (b.like_count ?? 0) - (a.like_count ?? 0);
      if (sortKey === 'comments') return (b.comment_count ?? 0) - (a.comment_count ?? 0);
      return String(date(b)).localeCompare(String(date(a)));
    });
    return list;
  }, [videos, statusFilter, typeFilter, sortKey, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function openVideo(v: StudioVideo) {
    if (v.format === 'short') router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any);
    else router.push(`/watch/${v.id}` as any);
  }

  async function togglePublish(v: StudioVideo) {
    const publishing = !v.is_published;
    if (!publishing) {
      const ok = await confirmAction('Unpublish this video?', 'It will be hidden from your profile and feeds until you publish it again.');
      if (!ok) return;
    }
    setBusyId(v.id);
    const patch: Record<string, any> = { is_published: publishing };
    if (publishing && !v.published_at) patch.published_at = new Date().toISOString();
    const { error } = await supabase.from('videos').update(patch).eq('id', v.id);
    setBusyId(null);
    if (error) {
      notify('Could not update', error.message);
      return;
    }
    setVideos(prev => prev.map(x => (x.id === v.id ? { ...x, ...patch } : x)));
  }

  async function deleteVideo(v: StudioVideo) {
    const ok = await confirmAction('Delete this video?', `"${v.title}" will be permanently deleted. This can't be undone.`);
    if (!ok) return;
    setBusyId(v.id);
    const { error } = await supabase.from('videos').delete().eq('id', v.id);
    setBusyId(null);
    if (error) {
      notify('Could not delete', error.message);
      return;
    }
    setVideos(prev => prev.filter(x => x.id !== v.id));
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}><ActivityIndicator color={C.gold} size="large" /></View>
      </DesktopShell>
    );
  }

  if (!signedIn || !speaker) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Icon name="mic-outline" size={36} color={C.text3} />
          <Text style={styles.gateTitle}>{signedIn ? 'Speaker Studio is for approved speakers' : 'Sign in to open Speaker Studio'}</Text>
          <Text style={styles.gateSub}>
            {signedIn
              ? 'Apply to become a speaker. Once approved and verified you can publish and see your analytics here.'
              : 'Your analytics and video library live here once you are signed in.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push((signedIn ? '/apply-speaker' : '/(auth)/sign-in') as any)}
          >
            <Text style={styles.primaryBtnText}>{signedIn ? 'Apply as a speaker' : 'Sign in'}</Text>
          </TouchableOpacity>
        </View>
      </DesktopShell>
    );
  }

  const statusStyle = (s: StatusKey) => ({
    published: { bg: C.emeraldBg, fg: C.emerald, label: 'Published' },
    scheduled: { bg: C.goldBg, fg: C.goldDim, label: 'Scheduled' },
    draft: { bg: C.surface2, fg: C.text2, label: 'Draft' },
    removed: { bg: 'rgba(217,117,95,0.12)', fg: C.danger, label: 'Removed' },
  })[s];

  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const Thumb = ({ v, w, h }: { v: StudioVideo; w: number; h: number }) => (
    <View style={[styles.thumb, { width: w, height: h }]}>
      {v.thumbnail_url ? (
        <Image source={{ uri: v.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Icon name="image-outline" size={16} color={C.text3} />
      )}
      {v.duration_secs ? <View style={styles.durChip}><Text style={styles.durText}>{fmtDur(v.duration_secs)}</Text></View> : null}
    </View>
  );

  const RowActions = ({ v }: { v: StudioVideo }) => {
    const st = videoStatus(v);
    if (busyId === v.id) return <ActivityIndicator size="small" color={C.text2} />;
    return (
      <View style={styles.rowActions}>
        {st === 'published' && (
          <TouchableOpacity style={styles.linkBtn} onPress={() => openVideo(v)}><Text style={styles.linkText}>View</Text></TouchableOpacity>
        )}
        {st !== 'removed' && (
          <TouchableOpacity style={styles.linkBtn} onPress={() => togglePublish(v)}>
            <Text style={styles.linkText}>{v.is_published ? 'Unpublish' : 'Publish'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.linkBtn} onPress={() => deleteVideo(v)} accessibilityLabel={`Delete ${v.title}`}>
          <Text style={[styles.linkText, { color: C.danger }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const COLS = [
    { key: 'video', label: 'Video', flex: 3.2 },
    { key: 'status', label: 'Status', w: 110 },
    { key: 'date', label: 'Date', w: 100 },
    { key: 'views', label: 'Views', w: 80, right: true },
    { key: 'likes', label: 'Likes', w: 70, right: true },
    { key: 'comments', label: 'Comments', w: 90, right: true },
    { key: 'actions', label: '', w: 220, right: true },
  ];

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg2 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.gold} />}
        >
          <View style={styles.page}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={{ flexShrink: 1, gap: 4 }}>
                {!isDesktopWeb && (
                  <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard' as any))} style={styles.backBtn} accessibilityLabel="Back">
                    <Icon name="chevron-back" size={22} color={C.text} />
                  </TouchableOpacity>
                )}
                <Text style={styles.eyebrow}>SPEAKER STUDIO</Text>
                <Text style={styles.h1}>Channel overview</Text>
                <Text style={styles.sub}>
                  {speaker.display_name}
                  {speaker.is_verified ? ' · Verified' : speaker.approval_status !== 'approved' ? ' · Pending approval' : ' · Not yet verified'}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push(`/speaker/${speaker.id}` as any)}>
                  <Icon name="person-circle-outline" size={16} color={C.text} />
                  <Text style={styles.ghostBtnText}>Public profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/gem-upload' as any)}>
                  <Icon name="cloud-upload-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Upload</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!speaker.is_verified && (
              <View style={styles.banner}>
                <Icon name="information-circle-outline" size={18} color={C.goldDim} />
                <Text style={styles.bannerText}>
                  You can save drafts, but publishing unlocks once your speaker account is approved and verified.
                </Text>
              </View>
            )}

            {/* Range */}
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['7', '28', '90', 'all'] as Range[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.segBtn, range === r && styles.segBtnActive]}
                  onPress={() => setRange(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: range === r }}
                >
                  <Text style={[styles.segText, range === r && styles.segTextActive]}>{RANGE_LABEL[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* KPIs */}
            <View style={styles.kpiGrid}>
              {kpis.map(k => (
                <View key={k.label} style={[styles.card, styles.kpi, { flexBasis: wide ? 160 : 150 }]}>
                  <View style={styles.kpiHead}>
                    <Icon name={k.icon} size={15} color={C.text3} />
                    <Text style={styles.kpiLabel}>{k.label}</Text>
                  </View>
                  <Text style={styles.kpiValue}>{k.value}</Text>
                  {k.delta ? (
                    <Text style={styles.kpiNote}>
                      <Text style={{
                        color: k.delta.dir === 'up' ? C.emerald : k.delta.dir === 'down' ? C.danger : C.text3,
                        fontWeight: '700',
                      }}>{k.delta.text}</Text> {k.note}
                    </Text>
                  ) : (
                    <Text style={styles.kpiNote}>{k.note}</Text>
                  )}
                </View>
              ))}
            </View>

            {/* Chart + format split */}
            <View style={styles.row}>
              <View style={[styles.card, { flexGrow: 3, flexBasis: 480 }]}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Follower growth</Text>
                  <Text style={styles.cardMeta}>+{chart.total.toLocaleString()} · per {chart.unit}</Text>
                </View>
                <View
                  style={styles.chart}
                  accessibilityRole="image"
                  accessibilityLabel={`New followers per ${chart.unit}, ${RANGE_LABEL[range].toLowerCase()}: ${chart.total} total`}
                >
                  {chart.bars.map(b => (
                    <View key={b.key} style={styles.barSlot}>
                      <View
                        style={[
                          styles.bar,
                          { height: `${Math.max(b.value ? 4 : 1, Math.round(b.pct * 100))}%` as any },
                          b.upload ? { backgroundColor: C.emerald } : { backgroundColor: C.emeraldSoft },
                        ]}
                        // @ts-ignore title is a valid prop on react-native-web
                        title={`${b.label}: ${b.value} new follower${b.value === 1 ? '' : 's'}${b.upload ? ' · upload' : ''}`}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.axis}>
                  <Text style={styles.axisText}>{chart.startLabel}</Text>
                  <Text style={styles.axisText}>{chart.endLabel}</Text>
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: C.emerald }]} /><Text style={styles.legendText}>You published that {chart.unit}</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: C.emeraldSoft }]} /><Text style={styles.legendText}>No upload</Text></View>
                </View>
              </View>

              <View style={[styles.card, { flexGrow: 1, flexBasis: 280, gap: 14 }]}>
                <Text style={styles.cardTitle}>Where your views come from</Text>
                {[formatSplit[0], formatSplit[1]].map(s => (
                  <View key={s.label}>
                    <View style={styles.splitHead}>
                      <Text style={styles.splitLabel}>{s.label}</Text>
                      <Text style={styles.splitVal}>{fmt(s.value)} · {Math.round(s.pct * 100)}%</Text>
                    </View>
                    <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(s.pct * 100)}%` as any }]} /></View>
                  </View>
                ))}
                <Text style={styles.cardFoot}>
                  {formatSplit[2].yt} synced from YouTube · {formatSplit[2].siqa} uploaded to Siqa
                </Text>
              </View>
            </View>

            {/* Top videos + attention */}
            <View style={styles.row}>
              <View style={[styles.card, { flexGrow: 2, flexBasis: 380 }]}>
                <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Top videos (lifetime views)</Text>
                {topVideos.length === 0 ? (
                  <Text style={styles.muted}>Nothing published yet.</Text>
                ) : topVideos.map((v, i) => (
                  <TouchableOpacity key={v.id} style={styles.topRow} onPress={() => openVideo(v)}>
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Thumb v={v} w={v.format === 'short' ? 36 : 72} h={40} />
                    <Text style={styles.topTitle} numberOfLines={2}>{v.title}</Text>
                    <Text style={styles.topViews}>{fmt(v.view_count)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.card, styles.attnCard, { flexGrow: 1, flexBasis: 280 }]}>
                <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Needs your attention</Text>
                {attention.map(a => (
                  <TouchableOpacity key={a.label} style={styles.attnRow} onPress={a.onPress} disabled={!a.onPress}>
                    <Icon name={a.icon} size={17} color={C.text2} />
                    <Text style={styles.attnLabel}>{a.label}</Text>
                    <Text style={[styles.attnCount, a.count === 0 && { color: C.text3 }]}>{a.count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Library */}
            <View style={[styles.card, { gap: 14 }]}>
              <View style={styles.libHead}>
                <Text style={styles.h2}>Your videos <Text style={styles.h2Count}>· {videos.length}</Text></Text>
                <View style={styles.searchBox}>
                  <Icon name="search-outline" size={16} color={C.text3} />
                  <TextInput
                    value={query}
                    onChangeText={t => { setQuery(t); setPage(0); }}
                    placeholder="Search your videos"
                    placeholderTextColor={C.text3}
                    style={styles.searchInput}
                    accessibilityLabel="Search your videos"
                  />
                </View>
              </View>

              <View style={styles.pillRow}>
                {(['all', 'published', 'scheduled', 'draft', 'removed'] as StatusFilter[])
                  .filter(s => s === 'all' || s === 'published' || statusCounts[s] > 0)
                  .map(s => (
                    <Chip
                      key={s}
                      active={statusFilter === s}
                      label={`${s === 'all' ? 'All' : statusStyle(s as StatusKey).label} · ${statusCounts[s]}`}
                      onPress={() => { setStatusFilter(s); setPage(0); }}
                    />
                  ))}
              </View>
              <View style={styles.filterRow}>
                <View style={styles.pillRow}>
                  {([['all', 'All types'], ['long', 'Videos'], ['short', 'Gems']] as [TypeFilter, string][]).map(([k, l]) => (
                    <Chip key={k} active={typeFilter === k} label={l} onPress={() => { setTypeFilter(k); setPage(0); }} />
                  ))}
                </View>
                <View style={styles.pillRow}>
                  <Text style={styles.sortLabel}>Sort</Text>
                  {([['newest', 'Newest'], ['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments']] as [SortKey, string][]).map(([k, l]) => (
                    <Chip key={k} active={sortKey === k} label={l} onPress={() => { setSortKey(k); setPage(0); }} />
                  ))}
                </View>
              </View>

              {filtered.length === 0 ? (
                <View style={styles.emptyLib}>
                  <Text style={styles.muted}>{videos.length === 0 ? "You haven't posted anything yet." : 'No videos match these filters.'}</Text>
                  {videos.length === 0 && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/gem-upload' as any)}>
                      <Text style={styles.primaryBtnText}>Upload your first video</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : wide ? (
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' as any }}>
                  <View style={{ flex: 1, minWidth: 940 }}>
                    <View style={[styles.tr, styles.thRow]}>
                      {COLS.map(c => (
                        <Text
                          key={c.key}
                          style={[styles.th, c.flex ? { flex: c.flex } : { width: c.w }, c.right && { textAlign: 'right' }]}
                        >{c.label}</Text>
                      ))}
                    </View>
                    {pageRows.map(v => {
                      const st = statusStyle(videoStatus(v));
                      return (
                        <View key={v.id} style={styles.tr}>
                          <View style={[styles.tdVideo, { flex: 3.2 }]}>
                            <Thumb v={v} w={v.format === 'short' ? 50 : 96} h={54} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.rowTitle} numberOfLines={2}>{v.title}</Text>
                              <Text style={styles.rowMeta}>
                                {v.format === 'short' ? 'Gem' : 'Video'} · {v.platform === 'youtube' ? 'Synced from YouTube' : 'Uploaded to Siqa'}
                              </Text>
                            </View>
                          </View>
                          <View style={{ width: 110 }}>
                            <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                          </View>
                          <Text style={[styles.td, { width: 100 }]}>{fmtDate(v.published_at || v.created_at)}</Text>
                          <Text style={[styles.td, styles.num, { width: 80 }]}>{fmt(v.view_count)}</Text>
                          <Text style={[styles.td, styles.num, { width: 70 }]}>{fmt(v.like_count)}</Text>
                          <Text style={[styles.td, styles.num, { width: 90 }]}>{fmt(v.comment_count)}</Text>
                          <View style={{ width: 220, alignItems: 'flex-end' }}><RowActions v={v} /></View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <View style={{ gap: 2 }}>
                  {pageRows.map(v => {
                    const st = statusStyle(videoStatus(v));
                    return (
                      <View key={v.id} style={styles.mRow}>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <Thumb v={v} w={v.format === 'short' ? 50 : 110} h={62} />
                          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                            <Text style={styles.rowTitle} numberOfLines={2}>{v.title}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                              <Text style={styles.rowMeta}>{fmtDate(v.published_at || v.created_at)}</Text>
                            </View>
                            <Text style={styles.rowMeta}>
                              {fmt(v.view_count)} views · {fmt(v.like_count)} likes · {fmt(v.comment_count)} comments
                            </Text>
                          </View>
                        </View>
                        <RowActions v={v} />
                      </View>
                    );
                  })}
                </View>
              )}

              {filtered.length > 0 && (
                <View style={styles.pager}>
                  <Text style={styles.muted}>
                    Showing {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length}
                  </Text>
                  <View style={styles.pillRow}>
                    <TouchableOpacity style={[styles.ghostBtn, safePage === 0 && { opacity: 0.4 }]} disabled={safePage === 0} onPress={() => setPage(safePage - 1)}>
                      <Text style={styles.ghostBtnText}>Previous</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ghostBtn, safePage >= pageCount - 1 && { opacity: 0.4 }]} disabled={safePage >= pageCount - 1} onPress={() => setPage(safePage + 1)}>
                      <Text style={styles.ghostBtnText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: C.bg },
    gateTitle: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' },
    gateSub: { fontSize: 14, color: C.text2, textAlign: 'center', maxWidth: 420, lineHeight: 20, marginBottom: 6 },
    scroll: { paddingBottom: 48 },
    page: {
      width: '100%', maxWidth: 1240, alignSelf: 'center', gap: 18,
      paddingHorizontal: desktop ? 32 : 14, paddingTop: desktop ? 28 : HEADER_TOP_PADDING,
    },

    headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
    backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
    eyebrow: { fontSize: 12, fontWeight: '700', color: C.emerald, letterSpacing: 1 },
    h1: { fontSize: desktop ? 30 : 24, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
    sub: { fontSize: 14, color: C.text2 },
    headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    banner: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Theme.radius.md,
      backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft,
    },
    bannerText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 18 },

    segment: {
      flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', gap: 2, padding: 4,
      borderRadius: 999, backgroundColor: C.bg3,
    },
    segBtn: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
    segBtnActive: { backgroundColor: C.surface },
    segText: { fontSize: 13, color: C.text2, fontWeight: '500' },
    segTextActive: { color: C.text, fontWeight: '700' },

    card: {
      backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border2,
      padding: desktop ? 20 : 16,
    },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    kpi: { flexGrow: 1, gap: 6, padding: 16 },
    kpiHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    kpiLabel: { fontSize: 13, color: C.text2, fontWeight: '500' },
    kpiValue: { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
    kpiNote: { fontSize: 12, color: C.text3 },

    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    cardMeta: { fontSize: 13, color: C.text2 },
    cardFoot: { fontSize: 12, color: C.text3, marginTop: 'auto' as any },

    chart: {
      height: 200, flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 16,
      borderBottomWidth: 1, borderBottomColor: C.border2,
    },
    barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
    bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    axisText: { fontSize: 12, color: C.text3 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendSwatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: { fontSize: 12, color: C.text2 },

    splitHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    splitLabel: { fontSize: 14, color: C.text },
    splitVal: { fontSize: 14, color: C.text, fontWeight: '700' },
    track: { height: 8, borderRadius: 999, backgroundColor: C.surface2, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 999, backgroundColor: C.emerald },

    topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, minHeight: 44 },
    rank: { width: 18, fontSize: 14, fontWeight: '700', color: C.text3 },
    topTitle: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500', lineHeight: 18 },
    topViews: { fontSize: 14, fontWeight: '700', color: C.text },

    attnCard: { backgroundColor: C.goldBg, borderColor: C.goldSoft },
    attnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    attnLabel: { flex: 1, fontSize: 14, color: C.text },
    attnCount: { fontSize: 15, fontWeight: '700', color: C.goldDim },

    libHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    h2: { fontSize: 20, fontWeight: '700', color: C.text },
    h2Count: { fontSize: 15, fontWeight: '500', color: C.text2 },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14,
      borderRadius: 999, backgroundColor: C.surface2, width: 280, maxWidth: '100%',
    },
    searchInput: { flex: 1, fontSize: 14, color: C.text, minWidth: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    pill: {
      height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      justifyContent: 'center', backgroundColor: C.surface,
    },
    pillActive: { backgroundColor: C.text, borderColor: C.text },
    pillText: { fontSize: 13, color: C.text, fontWeight: '500' },
    pillTextActive: { color: C.bg, fontWeight: '700' },
    sortLabel: { fontSize: 13, color: C.text3, marginRight: 2 },

    tr: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: C.border2,
    },
    thRow: { paddingVertical: 8 },
    th: { fontSize: 11, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.6 },
    tdVideo: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
    td: { fontSize: 14, color: C.text2 },
    num: { textAlign: 'right', color: C.text, fontWeight: '600' },
    rowTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 19 },
    rowMeta: { fontSize: 12, color: C.text3 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    rowActions: { flexDirection: 'row', gap: 2, alignItems: 'center' },
    linkBtn: { minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' },
    linkText: { fontSize: 13, fontWeight: '700', color: C.emerald },

    mRow: { gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border2 },
    thumb: {
      borderRadius: 8, overflow: 'hidden', backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center',
    },
    durChip: { position: 'absolute', right: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, borderRadius: 4 },
    durText: { color: '#fff', fontSize: 10, fontWeight: '700' },

    emptyLib: { alignItems: 'center', gap: 12, paddingVertical: 36 },
    muted: { fontSize: 13, color: C.text2 },
    pager: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },

    primaryBtn: {
      height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.emerald,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    ghostBtn: {
      height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface,
    },
    ghostBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  });
}
