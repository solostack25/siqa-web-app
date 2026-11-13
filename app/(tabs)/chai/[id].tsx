// One Chai post. Polls: vote, see the bars, join the debate. Quizzes:
// intro → one question per screen → result card with share and retake,
// then "What did you get?" discussion.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  chai, chaiFont, chunky, coverHex, OPTION_COLORS, fetchPost, myVotes, pollResults, castVote, isOpen, timeLeft,
  myPlay, savePlay, resultBreakdown, personalityResult, triviaScore, quizMeta, type ChaiPost,
} from '../../../lib/chai';
import { Tag, Squiggle, ChunkyButton, IconSquare, ResultBar, pct, DotsBackground } from '../../../components/chai/ChaiUI';
import { ChaiDiscussion } from '../../../components/chai/ChaiDiscussion';
import { focusedOnly } from '../../../components/FocusedOnly';
import { useIsDesktopWeb } from '../../../components/DesktopShell';
import { HEADER_TOP_PADDING } from '../../../constants/theme';
import { shareChai, shareChaiResult, prefetchChaiCard, getChaiCardUrl } from '../../../lib/share';
import { goBack } from '../../../lib/goBack';
import { Icon } from '../../../components/Icon';

type Outcome = { name: string; description: string; resultId: string; score?: number; total?: number };

function ChaiPostScreen() {
  const { id, r: sharedResult } = useLocalSearchParams<{ id: string; r?: string }>();
  const isDesktop = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<ChaiPost | null>(null);
  const [loading, setLoading] = useState(true);
  // poll
  const [myVote, setMyVote] = useState<string | undefined>();
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [voteError, setVoteError] = useState<string | null>(null);
  // quiz
  const [stage, setStage] = useState<'intro' | 'play' | 'result'>('intro');
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Result image, fetched ahead so "Share my result" can attach it on phones.
  const [cardFile, setCardFile] = useState<File | null>(null);
  useEffect(() => {
    setCardFile(null);
    if (!post || !outcome || post.kind === 'poll') return;
    let live = true;
    prefetchChaiCard(post.id, { resultId: outcome.resultId, score: outcome.score }).then((f) => { if (live) setCardFile(f); });
    return () => { live = false; };
  }, [post?.id, outcome?.resultId, outcome?.score]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setStage('intro'); setStep(0); setPicks({}); setOutcome(null);
      const p = await fetchPost(id);
      setPost(p);
      if (p?.kind === 'poll') {
        const mine = await myVotes([p.id]);
        setMyVote(mine[p.id]);
        if (mine[p.id] || !isOpen(p)) setVotes(await pollResults(p.id));
      } else if (p) {
        const played = await myPlay(p.id);
        if (played) {
          setOutcome(outcomeFromPlay(p, played.result_id, played.score, played.total));
          setStage('result');
          if (p.show_breakdown) setBreakdown(await resultBreakdown(p.id));
        }
      }
      setLoading(false);
    })();
  }, [id]);

  function outcomeFromPlay(p: ChaiPost, resultId: string, score: number | null, total: number | null): Outcome {
    if (p.kind === 'personality') {
      const r = p.content.results?.find(x => x.id === resultId);
      return { name: r?.name ?? resultId, description: r?.description ?? '', resultId };
    }
    const tier = p.content.tiers?.find(t => t.name === resultId);
    return { name: resultId, description: tier?.description ?? '', resultId, score: score ?? undefined, total: total ?? undefined };
  }

  async function vote(optionId: string) {
    if (!post) return;
    setVoteError(null);
    const r = await castVote(post.id, optionId);
    if (r.error === 'signed_out') { router.push('/(auth)/sign-in' as any); return; }
    if (r.error) { setVoteError('That vote didn’t go through. Try again.'); return; }
    setMyVote(optionId);
    setVotes(await pollResults(post.id));
    setRefreshKey(k => k + 1);
  }

  async function finish(finalPicks: Record<string, string>) {
    if (!post) return;
    let o: Outcome;
    if (post.kind === 'personality') {
      const r = personalityResult(post, finalPicks);
      o = { name: r?.name ?? 'Mystery', description: r?.description ?? '', resultId: r?.id ?? 'unknown' };
    } else {
      const t = triviaScore(post, finalPicks);
      o = { name: t.tier.name, description: t.tier.description, resultId: t.tier.name, score: t.score, total: t.total };
    }
    setOutcome(o);
    setStage('result');
    setSaving(true);
    const r = await savePlay(post.id, o.resultId, o.score, o.total);
    setSaving(false);
    if (!r.error && post.show_breakdown) setBreakdown(await resultBreakdown(post.id));
    setRefreshKey(k => k + 1);
  }

  const share = () => {
    if (!post) return;
    if (outcome) shareChaiResult(post.id, post.title, `I got "${outcome.name}" on "${post.title}". What do you get?`, { resultId: outcome.resultId, score: outcome.score }, cardFile);
    else shareChai(post.id, post.title);
  };

  const topPad = isDesktop ? 24 : Math.max(insets.top, HEADER_TOP_PADDING - 20) + 6;
  const wrap = { width: '100%' as const, maxWidth: 680, alignSelf: 'center' as const };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: chai.cream, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={chai.ink} /></View>;
  }
  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: chai.cream, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Text style={[chaiFont('displayBold'), { fontSize: 22, color: chai.ink }]}>This one's not around anymore</Text>
        <ChunkyButton label="Back to Chai" onPress={() => router.replace('/(tabs)/chai' as any)} />
      </View>
    );
  }

  const header = (label: string, tagBg: string, left: 'back' | 'close' = 'back') => (
    <View style={[wrap, { paddingTop: topPad, paddingHorizontal: 12, height: topPad + 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
      <IconSquare icon={left === 'back' ? 'chevron-back' : 'close'} label={left === 'back' ? 'Back' : 'Leave quiz'} onPress={() => left === 'back' ? goBack('/chai') : setStage('intro')} />
      <Tag bg={tagBg}>{label}</Tag>
      <IconSquare icon="share-outline" label="Share" onPress={share} />
    </View>
  );

  // ── Poll ───────────────────────────────────────────────────────────
  if (post.kind === 'poll') {
    const options = post.content.options ?? [];
    const open = isOpen(post);
    const showResults = !!myVote || !open;
    const total = Object.values(votes).reduce((a, b) => a + b, 0);
    const left = timeLeft(post);
    return (
      <View style={{ flex: 1, backgroundColor: chai.cream }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
          {header(left && open ? `POLL · ${left.toUpperCase()}` : open ? 'POLL' : 'POLL · CLOSED', chai.rose)}
          <View style={[wrap, { paddingHorizontal: 20, paddingTop: 10, gap: 12 }]}>
            <Text style={[chaiFont('displayBold'), { fontSize: 30, lineHeight: 34, color: chai.ink }]} accessibilityRole="header">{post.title}</Text>
            {post.intro ? <Text style={{ fontSize: 15, lineHeight: 21, color: chai.ink }}>{post.intro}</Text> : null}
            <View style={{ gap: 8 }}>
              {options.map((o, i) => showResults ? (
                <Pressable key={o.id} disabled={!open} onPress={() => vote(o.id)} accessibilityRole="button" accessibilityLabel={open ? `Change vote to ${o.label}` : o.label}>
                  <ResultBar label={o.label} pct={pct(votes, o.id)} color={OPTION_COLORS[i % OPTION_COLORS.length]} mine={myVote === o.id} tall />
                </Pressable>
              ) : (
                <Pressable key={o.id} onPress={() => vote(o.id)} accessibilityRole="button" accessibilityLabel={`Vote ${o.label}`}
                  style={({ pressed }) => [chunky(pressed ? 0 : 3, 14), { minHeight: 52, paddingHorizontal: 16, justifyContent: 'center', transform: [{ translateX: pressed ? 3 : 0 }, { translateY: pressed ? 3 : 0 }] }]}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: chai.ink }}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            {voteError ? <Text style={{ fontSize: 13, color: '#b4412c' }}>{voteError}</Text> : null}
            <Text style={{ fontSize: 13, fontWeight: '600', color: chai.ink }}>
              {showResults ? `${total.toLocaleString()} ${total === 1 ? 'vote' : 'votes'}${open ? ' · results update live · tap another option to change your vote' : ' · voting closed'}` : 'Vote to see what everyone picked'}
            </Text>
            <View style={{ marginTop: 10 }}>
              <ChaiDiscussion postId={post.id} enabled={post.comments_enabled} placeholder="Why did you pick that?" refreshKey={refreshKey} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Quiz ───────────────────────────────────────────────────────────
  const questions = post.content.questions ?? [];
  const tile = coverHex(post.cover_color);

  if (stage === 'play' && questions.length) {
    const q = questions[step];
    const picked = picks[q.id];
    const last = step === questions.length - 1;
    return (
      <View style={{ flex: 1, backgroundColor: chai.cream }}>
        <View style={[wrap, { paddingTop: topPad, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <IconSquare icon="close" label="Leave quiz" onPress={() => setStage('intro')} />
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: questions.length, now: step + 1 }} accessibilityLabel={`Question ${step + 1} of ${questions.length}`}
            style={{ flex: 1, height: 18, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 999, backgroundColor: chai.white, overflow: 'hidden' }}>
            <View style={{ width: `${((step + 1) / questions.length) * 100}%`, height: '100%', backgroundColor: chai.masala, borderRightWidth: step + 1 < questions.length ? chai.line : 0, borderRightColor: chai.ink }} />
          </View>
          <Text style={[chaiFont('mono'), { fontSize: 13, color: chai.ink }]}>{step + 1}/{questions.length}</Text>
        </View>
        <DotsBackground style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[wrap, { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24, gap: 18 }]}>
            <Text style={[chaiFont('mono'), { fontSize: 12, letterSpacing: 1, color: chai.ink }]}>{post.title.toUpperCase()}</Text>
            {q.image ? (
              <View style={[chunky(4, 20), { overflow: 'hidden', aspectRatio: 16 / 10, width: '100%' }]}>
                <Image key={q.id} source={{ uri: q.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
              </View>
            ) : null}
            <Text style={[chaiFont('displayBold'), { fontSize: q.image ? 26 : 30, lineHeight: q.image ? 30 : 34, color: chai.ink }]} accessibilityRole="header">{q.text}</Text>
            <View style={{ gap: 10 }} accessibilityRole="radiogroup">
              {q.answers.map((a, i) => {
                const on = picked === a.id;
                return (
                  <Pressable key={a.id} onPress={() => setPicks(p => ({ ...p, [q.id]: a.id }))} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={[chunky(on ? 0 : 3, 16, on ? chai.saffron : chai.white), { minHeight: 62, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, transform: [{ translateX: on ? 3 : 0 }, { translateY: on ? 3 : 0 }] }]}>
                    <View style={{ width: 32, height: 32, borderWidth: 2, borderColor: chai.ink, borderRadius: 10, backgroundColor: on ? chai.white : chai.cream, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={[chaiFont('mono'), { fontSize: 14, color: chai.ink }]}>{String.fromCharCode(65 + i)}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: on ? '700' : '600', color: chai.ink }}>{a.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </DotsBackground>
        <View style={{ borderTopWidth: chai.line, borderTopColor: chai.ink, backgroundColor: chai.cream }}>
          <View style={[wrap, { paddingHorizontal: 20, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16) + 10, flexDirection: 'row', gap: 10 }]}>
            {step > 0 ? <ChunkyButton label="Back" bg={chai.white} onPress={() => setStep(s => s - 1)} /> : null}
            <ChunkyButton
              label={last ? 'See my result' : 'Next →'}
              bg={chai.ink}
              color={chai.white}
              shadowColor={chai.masala}
              grow
              disabled={!picked}
              onPress={() => last ? finish(picks) : setStep(s => s + 1)}
            />
          </View>
        </View>
      </View>
    );
  }

  if (stage === 'result' && outcome) {
    const totalPlays = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const samePct = totalPlays ? Math.round(((breakdown[outcome.resultId] ?? 0) / totalPlays) * 100) : null;
    return (
      <View style={{ flex: 1, backgroundColor: chai.cream }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
          {header('YOUR RESULT', chai.saffron)}
          <View style={[wrap, { paddingHorizontal: 20, paddingTop: 14, gap: 14 }]}>
            <View style={[chunky(6, 24, tile), { padding: 20 }]}>
              {post.show_breakdown && samePct != null && totalPlays > 1 ? (
                <View style={{ position: 'absolute', top: -14, right: 18, transform: [{ rotate: '4deg' }] }}>
                  <Tag bg={chai.saffron}>{`${samePct}% GOT THIS`}</Tag>
                </View>
              ) : null}
              <Text style={[chaiFont('mono'), { fontSize: 11, letterSpacing: 1, color: chai.ink }]}>{post.title.toUpperCase()}</Text>
              <Text style={[chaiFont('displayBold'), { marginTop: 6, fontSize: 38, lineHeight: 40, color: chai.ink }]} accessibilityRole="header">
                {post.kind === 'trivia' ? `${outcome.score}/${outcome.total} · ${outcome.name}` : `You're ${outcome.name.replace(/^The /, 'the ')}`}
              </Text>
              <View style={{ marginTop: 4 }}><Squiggle width={170} color={chai.ink} /></View>
              {outcome.description ? <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 21, fontWeight: '600', color: chai.ink }}>{outcome.description}</Text> : null}
              {saving ? <Text style={{ marginTop: 8, fontSize: 12, color: chai.ink2 }}>Saving…</Text> : null}
            </View>
            {post.kind === 'trivia' ? (
              <View style={[chunky(3, 16), { padding: 14, gap: 8 }]}>
                <Text style={[chaiFont('display'), { fontSize: 17, color: chai.ink }]}>The answers</Text>
                {questions.map((q, i) => {
                  const right = q.answers.find(a => a.id === q.correct);
                  const mine = picks[q.id];
                  const ok = !mine || mine === q.correct;
                  return (
                    <View key={q.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Icon name={mine ? (ok ? 'checkmark-circle' : 'close-circle') : 'ellipse-outline'} size={18} color={mine ? (ok ? chai.cardamom : chai.masala) : chai.ink2} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 14, lineHeight: 19, color: chai.ink }}><Text style={{ fontWeight: '700' }}>{i + 1}. </Text>{q.text} <Text style={{ fontWeight: '700' }}>{right?.text}</Text></Text>
                        {q.note ? <Text style={{ fontSize: 13, lineHeight: 18, color: chai.ink2 }}>{q.note}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ChunkyButton label="Share my result" onPress={share} grow />
              <ChunkyButton label="Retake" bg={chai.white} onPress={() => { setPicks({}); setStep(0); setStage('play'); }} />
            </View>
            {Platform.OS === 'web' ? (
              <Text
                accessibilityRole="link"
                onPress={() => window.open(getChaiCardUrl(post.id, { resultId: outcome.resultId, score: outcome.score }), '_blank')}
                style={[chaiFont('mono'), { alignSelf: 'center', fontSize: 12, letterSpacing: 0.5, color: chai.ink2, textDecorationLine: 'underline' }]}
              >
                Save image for Stories
              </Text>
            ) : null}
            <View style={{ marginTop: 8 }}>
              <ChaiDiscussion postId={post.id} enabled={post.comments_enabled} title="What did you get?" placeholder="Tell everyone your result" refreshKey={refreshKey} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Intro. Someone opening a shared result sees what their friend got.
  const friendGot = typeof sharedResult === 'string' && sharedResult
    ? (post.kind === 'personality' ? post.content.results?.find(x => x.id === sharedResult)?.name : post.content.tiers?.find(t => t.name === sharedResult)?.name) ?? null
    : null;
  return (
    <View style={{ flex: 1, backgroundColor: chai.cream }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        {header(post.kind === 'trivia' ? 'TRIVIA' : 'QUIZ', chai.saffron)}
        <View style={[wrap, { paddingHorizontal: 20, paddingTop: 14, gap: 16 }]}>
          <View style={[chunky(6, 24), { overflow: 'hidden' }]}>
            <View style={{ height: 150, backgroundColor: tile, borderBottomWidth: chai.line, borderBottomColor: chai.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[chaiFont('displayBold'), { fontSize: 80, color: chai.ink }]}>?</Text>
            </View>
            <View style={{ padding: 18, gap: 8 }}>
              {friendGot ? <View style={{ alignSelf: 'flex-start' }}><Tag bg={chai.saffron}>{`A FRIEND GOT ${friendGot.toUpperCase()}`}</Tag></View> : null}
              <Text style={[chaiFont('mono'), { fontSize: 11, letterSpacing: 1, color: chai.ink }]}>{quizMeta(post)}</Text>
              <Text style={[chaiFont('displayBold'), { fontSize: 30, lineHeight: 34, color: chai.ink }]} accessibilityRole="header">{post.title}</Text>
              {post.intro ? <Text style={{ fontSize: 15, lineHeight: 21, color: chai.ink }}>{post.intro}</Text> : null}
              <View style={{ marginTop: 6 }}>
                <ChunkyButton label="Start the quiz" onPress={() => { setPicks({}); setStep(0); setStage('play'); }} disabled={!questions.length} />
              </View>
            </View>
          </View>
          <ChaiDiscussion postId={post.id} enabled={post.comments_enabled} title="What did you get?" placeholder="Tell everyone your result" refreshKey={refreshKey} />
        </View>
      </ScrollView>
    </View>
  );
}

export default focusedOnly(ChaiPostScreen);
