// Chai tab: polls, quizzes and a little friendly debate.
// Layout (Nov 2026 redesign): compact header with your streak, a filter
// with counts (All · Polls · Quizzes · Done), today's poll up top, a swipe
// rail of quizzes you haven't played, other open polls as compact rows,
// and everything you've voted on, played or that has closed tucked into a
// collapsible "Done" section. Desktop gets a two-column layout.

import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chai, chaiFont, chunky, coverHex, fetchFeed, myVotes, pollResults, castVote, isOpen, timeLeft, type ChaiPost } from '../../lib/chai';
import { supabase } from '../../lib/supabase';
import { ChaiCard, PollCard, Tag, DotsBackground } from '../../components/chai/ChaiUI';
import { Icon } from '../../components/Icon';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { guardTabSwipe } from '../../components/useTabSwipe';

type Filter = 'all' | 'poll' | 'quiz' | 'done';

const DAY = 86400000;
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Consecutive days (ending today, or yesterday if nothing yet today) with a vote or a quiz play. */
function streakFrom(times: number[]) {
  if (!times.length) return 0;
  const days = new Set(times.map(dayKey));
  let t = Date.now();
  if (!days.has(dayKey(t))) t -= DAY;
  let n = 0;
  while (days.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

const openPost = (p: ChaiPost) => router.push({ pathname: '/chai/[id]', params: { id: p.id } } as any);

export default function ChaiScreen() {
  const isDesktop = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<ChaiPost[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Record<string, number>>>({});
  const [played, setPlayed] = useState<Record<string, string>>({});
  const [streak, setStreak] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [doneOpen, setDoneOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const feed = await fetchFeed();
    setPosts(feed);
    const polls = feed.filter(p => p.kind === 'poll');
    const mine = await myVotes(polls.map(p => p.id));
    setVotes(mine);
    const needResults = polls.filter(p => mine[p.id] || !isOpen(p));
    const res = await Promise.all(needResults.map(p => pollResults(p.id)));
    setResults(Object.fromEntries(needResults.map((p, i) => [p.id, res[i]])));
    // Your quiz results (for "You got") and activity days (for the streak).
    const { data: { session } } = await supabase.auth.getSession();
    const quizzes = feed.filter(p => p.kind !== 'poll');
    if (session?.user) {
      const uid = session.user.id;
      const [{ data: plays }, { data: voteTimes }, { data: playTimes }] = await Promise.all([
        quizzes.length
          ? supabase.from('chai_plays').select('post_id, result_id').eq('profile_id', uid).in('post_id', quizzes.map(q => q.id))
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('chai_votes').select('created_at').eq('profile_id', uid).order('created_at', { ascending: false }).limit(200),
        supabase.from('chai_plays').select('created_at').eq('profile_id', uid).order('created_at', { ascending: false }).limit(200),
      ]);
      const names: Record<string, string> = {};
      (plays ?? []).forEach((r: any) => {
        const q = quizzes.find(x => x.id === r.post_id);
        names[r.post_id] = q?.content.results?.find(x => x.id === r.result_id)?.name ?? r.result_id;
      });
      setPlayed(names);
      setStreak(streakFrom([...(voteTimes ?? []), ...(playTimes ?? [])].map((r: any) => new Date(r.created_at).getTime())));
    } else { setPlayed({}); setStreak(0); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function vote(post: ChaiPost, optionId: string) {
    const r = await castVote(post.id, optionId);
    if (r.error === 'signed_out') { router.push('/(auth)/sign-in' as any); return; }
    if (r.error) return;
    const first = !votes[post.id];
    setVotes(v => ({ ...v, [post.id]: optionId }));
    const res = await pollResults(post.id);
    setResults(x => ({ ...x, [post.id]: res }));
    setPosts(ps => ps.map(p => p.id === post.id ? { ...p, people: (p.people ?? 0) + (first ? 1 : 0) } : p));
    if (first) setStreak(s => Math.max(s, 1));
  }

  // ── Sorting the feed into sections ──────────────────────────────────
  const s = useMemo(() => {
    const isDone = (p: ChaiPost) => p.kind === 'poll' ? (!!votes[p.id] || !isOpen(p)) : (!!played[p.id] || !isOpen(p));
    const hero = posts.find(p => p.kind === 'poll' && isOpen(p)) ?? null;
    const rest = posts.filter(p => p.id !== hero?.id);
    const quizzes = rest.filter(p => p.kind !== 'poll' && !isDone(p));
    const polls = rest.filter(p => p.kind === 'poll' && !isDone(p));
    const done = rest.filter(isDone);
    const freshToday = posts.filter(p => isOpen(p) && p.publish_at && Date.now() - new Date(p.publish_at).getTime() < DAY).length;
    const debates = [...posts].filter(p => (p.comment_count ?? 0) > 0).sort((a, b) => (b.comment_count ?? 0) - (a.comment_count ?? 0)).slice(0, 3);
    const heroTodo = hero && !votes[hero.id] ? 1 : 0;
    return { hero, quizzes, polls, done, freshToday, debates, counts: { all: heroTodo + quizzes.length + polls.length, poll: heroTodo + polls.length, quiz: quizzes.length, done: done.length } };
  }, [posts, votes, played]);

  const q = query.trim().toLowerCase();
  const matches = q ? posts.filter(p => p.title.toLowerCase().includes(q) || (p.intro ?? '').toLowerCase().includes(q)) : [];

  const showPolls = filter === 'all' || filter === 'poll';
  const showQuizzes = filter === 'all' || filter === 'quiz';
  const doneExpanded = filter === 'done' || doneOpen;
  const pad = 20;

  // ── Pieces ──────────────────────────────────────────────────────────
  const filterBar = (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 16, backgroundColor: chai.white, alignSelf: isDesktop ? 'flex-start' : 'stretch' }}>
      {([['all', 'All'], ['poll', 'Polls'], ['quiz', 'Quizzes'], ...(isDesktop ? [] : [['done', 'Done']])] as [Filter, string][]).map(([key, label]) => {
        const on = filter === key;
        return (
          <Pressable key={key} onPress={guardTabSwipe(() => setFilter(key))} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: isDesktop ? undefined : 1, height: 38, paddingHorizontal: isDesktop ? 16 : 4, borderRadius: 11, backgroundColor: on ? chai.ink : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text style={[chaiFont('display'), { fontSize: 15, color: on ? chai.white : chai.ink }]}>{label}</Text>
            <Text style={[chaiFont('mono'), { fontSize: 11, color: on ? chai.white : chai.ink, opacity: 0.8 }]}>{s.counts[key]}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const header = (
    <View style={{ paddingHorizontal: pad, paddingTop: isDesktop ? 32 : Math.max(insets.top, HEADER_TOP_PADDING - 20) + 6, paddingBottom: 10, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1, flexWrap: 'wrap' }}>
          <Text style={[chaiFont('displayBold'), { fontSize: isDesktop ? 40 : 30, lineHeight: isDesktop ? 44 : 34, color: chai.ink, letterSpacing: -0.5 }]} accessibilityRole="header">
            Chai<Text style={{ color: chai.masala }}>.</Text>
          </Text>
          {isDesktop ? <Text style={{ fontSize: 15, fontWeight: '600', color: chai.ink2 }}>Polls, quizzes and a little friendly debate</Text>
            : s.freshToday > 0 ? <Text style={[chaiFont('mono'), { fontSize: 11, color: chai.ink }]}>{s.freshToday} NEW TODAY</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!isDesktop && streak > 0 ? <StreakPill n={streak} /> : null}
          {isDesktop ? filterBar : null}
          <Pressable onPress={guardTabSwipe(() => { setSearching(v => !v); setQuery(''); })} accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : 'Search Chai'}
            style={[chunky(2, 14), { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name={searching ? 'close' : 'search'} size={20} color={chai.ink} />
          </Pressable>
        </View>
      </View>
      {searching ? (
        <TextInput
          autoFocus value={query} onChangeText={setQuery} placeholder="Search polls and quizzes" placeholderTextColor={chai.ink2}
          accessibilityLabel="Search polls and quizzes"
          style={{ height: 46, paddingHorizontal: 14, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 14, backgroundColor: chai.white, fontSize: 15, color: chai.ink, outlineStyle: 'none' } as any}
        />
      ) : null}
    </View>
  );

  const heroBlock = showPolls && s.hero ? (
    <PollCard post={s.hero} featured myVote={votes[s.hero.id]} votes={results[s.hero.id]} onVote={(o) => vote(s.hero!, o)} />
  ) : null;

  const quizBlock = showQuizzes && s.quizzes.length ? (
    <View style={{ gap: 10 }}>
      <SectionTitle title={filter === 'quiz' ? 'Quizzes' : 'Up next for you'} meta={`${s.quizzes.length} ${s.quizzes.length === 1 ? 'QUIZ' : 'QUIZZES'}${!isDesktop && filter !== 'quiz' && s.quizzes.length > 1 ? ' · SWIPE' : ''}`} />
      {isDesktop || filter === 'quiz' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isDesktop ? 18 : 12 }}>
          {s.quizzes.map(p => <QuizTile key={p.id} post={p} width={isDesktop ? '31%' : '47%'} />)}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -pad }} contentContainerStyle={{ paddingHorizontal: pad, gap: 12, paddingBottom: 8, paddingRight: pad + 6 }}>
          {s.quizzes.map(p => <QuizTile key={p.id} post={p} width={168} />)}
        </ScrollView>
      )}
    </View>
  ) : null;

  const pollBlock = showPolls && s.polls.length ? (
    <View style={{ gap: 10 }}>
      <SectionTitle title={s.hero ? 'More polls' : 'Polls'} />
      <View style={[chunky(4, 20), { overflow: 'hidden' }]}>
        {s.polls.map((p, i) => <PollRow key={p.id} post={p} first={i === 0} />)}
      </View>
    </View>
  ) : null;

  const doneList = (
    <View style={{ gap: 8 }}>
      {s.done.map(p => <DoneRow key={p.id} post={p} vote={votes[p.id]} played={played[p.id]} />)}
    </View>
  );

  const doneBlock = s.done.length ? (
    <View style={{ gap: 10 }}>
      {filter === 'done' ? <SectionTitle title="Done" meta={`${s.done.length} PLAYED OR CLOSED`} /> : (
        <Pressable onPress={guardTabSwipe(() => setDoneOpen(v => !v))} accessibilityRole="button" accessibilityState={{ expanded: doneOpen }}
          style={{ minHeight: 48, paddingHorizontal: 14, borderWidth: chai.line, borderStyle: 'dashed', borderColor: chai.ink, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[chaiFont('displayBold'), { fontSize: 17, color: chai.ink }]}>Done · {s.done.length}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: chai.ink }}>{doneOpen ? 'Hide' : 'Show'}</Text>
        </Pressable>
      )}
      {doneExpanded ? doneList : null}
    </View>
  ) : filter === 'done' ? (
    <Empty title="Nothing here yet" body="Polls you vote on and quizzes you finish land here." />
  ) : null;

  const caughtUp = !loading && filter === 'all' && s.counts.all === 0 && posts.length > 0;
  const nothing = !loading && posts.length === 0;

  const mainColumn = loading ? <ActivityIndicator color={chai.ink} style={{ marginTop: 40 }} /> : q ? (
    matches.length ? matches.map(p => (
      <ChaiCard key={p.id} post={p} myVote={votes[p.id]} votes={results[p.id]} onVote={(o) => vote(p, o)} played={played[p.id]} />
    )) : <Empty title="No matches" body={`Nothing in Chai matches “${query.trim()}”.`} />
  ) : nothing ? (
    <Empty title="The pot's still brewing" body="New polls and quizzes land here. Check back soon." />
  ) : (
    <>
      {heroBlock}
      {quizBlock}
      {pollBlock}
      {caughtUp ? <Empty title="You're all caught up" body="New polls and quizzes land here. Check back soon." /> : null}
      {filter === 'quiz' && !s.quizzes.length ? <Empty title="No new quizzes" body="You've played them all. Check Done for your results." /> : null}
      {filter === 'poll' && !s.hero && !s.polls.length ? <Empty title="No open polls" body="Check back soon for the next one." /> : null}
      {!isDesktop ? doneBlock : null}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: chai.cream }}>
      <ScrollView
        stickyHeaderIndices={isDesktop ? undefined : [1]}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={chai.ink} />}
      >
        <View style={{ width: '100%', maxWidth: isDesktop ? 1180 : 760, alignSelf: 'center' }}>{header}</View>
        {isDesktop ? <View /> : (
          <View style={{ backgroundColor: chai.cream, paddingHorizontal: pad, paddingTop: 2, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'rgba(34,22,58,0.08)' }}>
            <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>{filterBar}</View>
          </View>
        )}

        <DotsBackground style={{ flexGrow: 1, minHeight: 600 }}>
          <View style={{ width: '100%', maxWidth: isDesktop ? 1180 : 760, alignSelf: 'center', paddingHorizontal: pad, paddingTop: 16 }}>
            {isDesktop ? (
              <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0, gap: 28 }}>{mainColumn}</View>
                <View style={{ width: 320, gap: 20 }}>
                  <View style={[chunky(4, 20, chai.saffron), { padding: 18, gap: 4 }]}>
                    <Text style={[chaiFont('mono'), { fontSize: 11, letterSpacing: 1, color: chai.ink }]}>YOUR CHAI</Text>
                    <Text style={[chaiFont('displayBold'), { fontSize: 26, color: chai.ink }]}>{streak > 0 ? `${streak}-day streak` : 'Start a streak'}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: chai.ink }}>
                      {s.done.length} done{s.freshToday ? ` · ${s.freshToday} new today` : ''}
                    </Text>
                  </View>
                  <View style={[chunky(0, 20), { padding: 16, gap: 10 }]}>
                    <Text style={[chaiFont('displayBold'), { fontSize: 18, color: chai.ink }]}>Done</Text>
                    {s.done.length ? doneList : <Text style={{ fontSize: 13, fontWeight: '600', color: chai.ink2 }}>Polls you vote on and quizzes you finish land here.</Text>}
                  </View>
                  {s.debates.length ? (
                    <View style={[chunky(0, 20), { padding: 16, gap: 12 }]}>
                      <Text style={[chaiFont('displayBold'), { fontSize: 18, color: chai.ink }]}>Hot debates</Text>
                      {s.debates.map(p => (
                        <Pressable key={p.id} onPress={() => openPost(p)} accessibilityRole="link" style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: chai.ink }} numberOfLines={2}>{p.title}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="chatbubble-outline" size={14} color={chai.ink} /><Text style={{ fontSize: 13, fontWeight: '700', color: chai.ink }}>{p.comment_count}</Text></View>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={{ gap: 26 }}>{mainColumn}</View>
            )}
          </View>
        </DotsBackground>
      </ScrollView>
    </View>
  );
}

// ── Small components ──────────────────────────────────────────────────

function StreakPill({ n }: { n: number }) {
  return (
    <View accessible accessibilityLabel={`${n}-day streak`} style={{ height: 34, paddingHorizontal: 10, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 999, backgroundColor: chai.saffron, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name="flame" size={15} color={chai.ink} />
      <Text style={[chaiFont('displayBold'), { fontSize: 14, color: chai.ink }]}>{n}-day streak</Text>
    </View>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <Text style={[chaiFont('displayBold'), { fontSize: 20, color: chai.ink }]} accessibilityRole="header">{title}</Text>
      {meta ? <Text style={[chaiFont('mono'), { fontSize: 11, color: chai.ink }]}>{meta}</Text> : null}
    </View>
  );
}

function QuizTile({ post, width }: { post: ChaiPost; width: number | string }) {
  const n = post.content.questions?.length ?? 0;
  const mins = Math.max(1, Math.round(n * 10 / 60));
  const isNew = post.publish_at && Date.now() - new Date(post.publish_at).getTime() < 2 * DAY;
  const meta = [`${n} Q`, `${mins} MIN`, post.people ? `${post.people.toLocaleString()} PLAYED` : isNew ? 'NEW' : null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={guardTabSwipe(() => openPost(post))} accessibilityRole="link" accessibilityLabel={`Quiz: ${post.title}`}
      style={({ pressed }) => [chunky(pressed ? 0 : 4, 20), { width: width as any, overflow: 'hidden', transform: [{ translateX: pressed ? 3 : 0 }, { translateY: pressed ? 3 : 0 }] }]}>
      <View style={{ height: 96, backgroundColor: coverHex(post.cover_color), borderBottomWidth: chai.line, borderBottomColor: chai.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[chaiFont('displayBold'), { fontSize: 40, color: chai.ink, transform: [{ rotate: '-6deg' }] }]}>?</Text>
        <Tag bg={chai.white} style={{ position: 'absolute', top: 8, left: 8, height: 22, paddingHorizontal: 6 }}>{post.kind === 'trivia' ? 'TRIVIA' : 'QUIZ'}</Tag>
      </View>
      <View style={{ padding: 12, paddingTop: 10, gap: 4 }}>
        <Text style={[chaiFont('displayBold'), { fontSize: 16, lineHeight: 20, color: chai.ink }]} numberOfLines={3}>{post.title}</Text>
        <Text style={[chaiFont('mono'), { fontSize: 10, letterSpacing: 0.5, color: chai.ink }]}>{meta}</Text>
      </View>
    </Pressable>
  );
}

function PollRow({ post, first }: { post: ChaiPost; first: boolean }) {
  const left = timeLeft(post);
  const meta = [left, `${(post.people ?? 0).toLocaleString()} ${post.people === 1 ? 'vote' : 'votes'}`, `${post.comment_count ?? 0} ${post.comment_count === 1 ? 'comment' : 'comments'}`].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={guardTabSwipe(() => openPost(post))} accessibilityRole="link" accessibilityLabel={`Poll: ${post.title}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: pressed ? chai.cream : chai.white }, !first && { borderTopWidth: 2, borderTopColor: 'rgba(34,22,58,0.12)' }]}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[chaiFont('display'), { fontSize: 17, lineHeight: 21, color: chai.ink }]}>{post.title}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: chai.ink2 }}>{meta}</Text>
      </View>
      <View style={{ height: 32, paddingHorizontal: 12, borderWidth: 2, borderColor: chai.ink, borderRadius: 10, backgroundColor: chai.saffron, justifyContent: 'center' }}>
        <Text style={[chaiFont('displayBold'), { fontSize: 14, color: chai.ink }]}>Vote</Text>
      </View>
    </Pressable>
  );
}

function DoneRow({ post, vote, played }: { post: ChaiPost; vote?: string; played?: string }) {
  let result: string;
  if (post.kind === 'poll') {
    const label = post.content.options?.find(o => o.id === vote)?.label;
    result = label ? `You voted: ${label}` : `Closed · ${(post.people ?? 0).toLocaleString()} votes`;
  } else result = played ? `You got: ${played}` : 'Closed';
  const mine = !!(vote || played);
  return (
    <Pressable onPress={guardTabSwipe(() => openPost(post))} accessibilityRole="link" accessibilityLabel={`${post.title}. ${result}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 12, borderWidth: 2, borderColor: chai.ink, borderRadius: 14, backgroundColor: pressed ? chai.cream : chai.white }]}>
      <View style={{ width: 32, height: 32, borderWidth: 2, borderColor: chai.ink, borderRadius: 10, backgroundColor: mine ? chai.cardamom : '#e8e2d6', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={mine ? 'checkmark' : 'lock-closed'} size={16} color={chai.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: chai.ink }} numberOfLines={2}>{post.title}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: chai.ink2 }} numberOfLines={1}>{result}</Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="chatbubble-outline" size={14} color={chai.ink} /><Text style={{ fontSize: 12, fontWeight: '700', color: chai.ink }}>{post.comment_count ?? 0}</Text></View>
    </Pressable>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={[chunky(4, 20), { padding: 20, alignItems: 'center', gap: 6 }]}>
      <Text style={[chaiFont('displayBold'), { fontSize: 20, color: chai.ink }]}>{title}</Text>
      <Text style={{ fontSize: 14, color: chai.ink2, textAlign: 'center' }}>{body}</Text>
    </View>
  );
}
