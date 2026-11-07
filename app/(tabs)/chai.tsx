// Chai tab: polls, quizzes and a little friendly debate. The newest live
// poll is featured at the top; vote right on the card and the results
// appear. Quizzes open full screen.

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chai, chaiFont, chunky, fetchFeed, myVotes, pollResults, castVote, isOpen, type ChaiPost } from '../../lib/chai';
import { supabase } from '../../lib/supabase';
import { ChaiCard, Squiggle, DotsBackground } from '../../components/chai/ChaiUI';
import { ChaiIcon } from '../../components/Siqa';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { guardTabSwipe } from '../../components/useTabSwipe';

type Filter = 'all' | 'poll' | 'quiz';

export default function ChaiScreen() {
  const isDesktop = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<ChaiPost[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Record<string, number>>>({});
  const [played, setPlayed] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const feed = await fetchFeed();
    setPosts(feed);
    const polls = feed.filter(p => p.kind === 'poll');
    const mine = await myVotes(polls.map(p => p.id));
    setVotes(mine);
    const needResults = polls.filter(p => mine[p.id] || !isOpen(p));
    const res = await Promise.all(needResults.map(p => pollResults(p.id)));
    setResults(Object.fromEntries(needResults.map((p, i) => [p.id, res[i]])));
    // Your quiz results, for the "You got" tag.
    const { data: { session } } = await supabase.auth.getSession();
    const quizzes = feed.filter(p => p.kind !== 'poll');
    if (session?.user && quizzes.length) {
      const { data } = await supabase.from('chai_plays').select('post_id, result_id').eq('profile_id', session.user.id).in('post_id', quizzes.map(q => q.id));
      const names: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        const q = quizzes.find(x => x.id === r.post_id);
        names[r.post_id] = q?.content.results?.find(x => x.id === r.result_id)?.name ?? r.result_id;
      });
      setPlayed(names);
    } else setPlayed({});
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function vote(post: ChaiPost, optionId: string) {
    const r = await castVote(post.id, optionId);
    if (r.error === 'signed_out') { router.push('/(auth)/sign-in' as any); return; }
    if (r.error) return;
    setVotes(v => ({ ...v, [post.id]: optionId }));
    const res = await pollResults(post.id);
    setResults(x => ({ ...x, [post.id]: res }));
    setPosts(ps => ps.map(p => p.id === post.id ? { ...p, people: (p.people ?? 0) + (votes[post.id] ? 0 : 1) } : p));
  }

  const featuredId = posts.find(p => p.kind === 'poll' && isOpen(p))?.id;
  const shown = posts.filter(p => filter === 'all' || (filter === 'poll' ? p.kind === 'poll' : p.kind !== 'poll'));

  const chip = (key: Filter, label: string) => {
    const on = filter === key;
    return (
      <Pressable key={key} onPress={guardTabSwipe(() => setFilter(key))} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ height: 38, paddingHorizontal: 16, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 999, backgroundColor: on ? chai.ink : chai.white, justifyContent: 'center' }}>
        <Text style={[chaiFont('display'), { fontSize: 15, color: on ? chai.white : chai.ink }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: chai.cream }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={chai.ink} />}
      >
        <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: isDesktop ? 32 : Math.max(insets.top, HEADER_TOP_PADDING - 20) + 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={[chaiFont('displayBold'), { fontSize: 44, lineHeight: 48, color: chai.ink, letterSpacing: -1 }]} accessibilityRole="header">
                Chai<Text style={{ color: chai.masala }}>.</Text>
              </Text>
              <Squiggle width={84} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '500', color: chai.ink }}>Polls, quizzes and a little friendly debate</Text>
            </View>
            <View style={[chunky(3, 16, chai.saffron), { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] }]} importantForAccessibility="no">
              <ChaiIcon size={28} color={chai.ink} />
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, flexDirection: 'row', gap: 8 }}>
            {chip('all', 'All')}{chip('poll', 'Polls')}{chip('quiz', 'Quizzes')}
          </View>
        </View>

        <DotsBackground style={{ flexGrow: 1, minHeight: 600 }}>
          <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, gap: 18 }}>
            {loading ? <ActivityIndicator color={chai.ink} style={{ marginTop: 40 }} /> : shown.length === 0 ? (
              <View style={[chunky(4, 20), { padding: 20, alignItems: 'center', gap: 6 }]}>
                <Text style={[chaiFont('displayBold'), { fontSize: 20, color: chai.ink }]}>The pot's still brewing</Text>
                <Text style={{ fontSize: 14, color: chai.ink2, textAlign: 'center' }}>New polls and quizzes land here. Check back soon.</Text>
              </View>
            ) : shown.map(p => (
              <ChaiCard
                key={p.id}
                post={p}
                featured={p.id === featuredId}
                myVote={votes[p.id]}
                votes={results[p.id]}
                onVote={(o) => vote(p, o)}
                played={played[p.id]}
              />
            ))}
          </View>
        </DotsBackground>
      </ScrollView>
    </View>
  );
}
