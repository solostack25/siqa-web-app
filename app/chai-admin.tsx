// Chai builder (admin): create, edit, schedule, publish and end polls,
// personality quizzes and trivia quizzes. Desktop: list | editor | settings
// side by side. Phone: the list, then a full-screen editor with Save draft
// and Publish pinned at the bottom. Writes go straight to chai_posts (RLS:
// siqa_is_privileged), so Publish makes it live in the app immediately.

import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, Alert, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Button, IconButton, Chip, SegmentedControl, Switch, TextField, ListRow } from '../components/ui';
import { Icon } from '../components/Icon';
import { ChaiIcon } from '../components/Siqa';
import { font, radius, space, type, useDS } from '../lib/ds';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { chai, coverHex, COVER_COLORS, type ChaiKind, type ChaiPost, type ChaiContent, type CoverColor } from '../lib/chai';
import { goBack } from '../lib/goBack';

const ADMIN_ROLES = ['admin', 'owner', 'moderator', 'super_admin'];
const KIND_LABEL: Record<ChaiKind, string> = { poll: 'Poll', personality: 'Personality quiz', trivia: 'Trivia quiz' };
type Bucket = 'live' | 'scheduled' | 'draft' | 'ended';
type Draft = Omit<ChaiPost, 'id' | 'created_at'> & { id?: string };

const uid = () => Math.random().toString(36).slice(2, 8);

function bucketOf(p: ChaiPost): Bucket {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'ended' || (p.ends_at && new Date(p.ends_at).getTime() < Date.now())) return 'ended';
  if (p.publish_at && new Date(p.publish_at).getTime() > Date.now()) return 'scheduled';
  return 'live';
}

function blank(kind: ChaiKind): Draft {
  const content: ChaiContent = kind === 'poll'
    ? { options: [{ id: uid(), label: '' }, { id: uid(), label: '' }] }
    : kind === 'personality'
      ? { results: [{ id: uid(), name: '', description: '' }, { id: uid(), name: '', description: '' }], questions: [{ id: uid(), text: '', answers: [{ id: uid(), text: '' }, { id: uid(), text: '' }] }] }
      : { questions: [{ id: uid(), text: '', answers: [{ id: uid(), text: '' }, { id: uid(), text: '' }], correct: undefined }], tiers: [] };
  return {
    kind, title: '', intro: '', cover_color: 'saffron', content, status: 'draft', publish_at: null,
    ends_at: kind === 'poll' ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
    comments_enabled: true, show_on_home: true, show_breakdown: true,
  };
}

function defaultTiers(n: number) {
  const mid = Math.max(1, Math.ceil(n / 2));
  return [
    { min: 0, name: 'Keep going', description: 'A good start. Try again and see how much you pick up.' },
    { min: mid, name: 'Nicely done', description: 'You know your stuff.' },
    { min: n, name: 'Perfect score', description: 'Every single one. Impressive.' },
  ];
}

function problems(d: Draft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('Add a title.');
  if (d.kind === 'poll') {
    const opts = (d.content.options ?? []).filter(o => o.label.trim());
    if (opts.length < 2) out.push('A poll needs at least 2 options.');
  } else {
    const qs = d.content.questions ?? [];
    if (!qs.length) out.push('Add at least one question.');
    qs.forEach((q, i) => {
      if (!q.text.trim()) out.push(`Question ${i + 1} needs text.`);
      const ans = q.answers.filter(a => a.text.trim());
      if (ans.length < 2) out.push(`Question ${i + 1} needs at least 2 answers.`);
      if (d.kind === 'personality' && ans.some(a => !a.result)) out.push(`Question ${i + 1}: point every answer to a result.`);
      if (d.kind === 'trivia' && !q.correct) out.push(`Question ${i + 1}: pick the correct answer.`);
    });
    if (d.kind === 'personality') {
      const rs = (d.content.results ?? []).filter(r => r.name.trim());
      if (rs.length < 2) out.push('A personality quiz needs at least 2 results.');
    }
  }
  return out;
}

/** Strip empty rows before saving. */
function clean(d: Draft): Draft {
  const c = { ...d.content };
  if (d.kind === 'poll') c.options = (c.options ?? []).filter(o => o.label.trim()).map(o => ({ ...o, label: o.label.trim() }));
  else {
    if (d.kind === 'personality') c.results = (c.results ?? []).filter(r => r.name.trim());
    c.questions = (c.questions ?? []).map(q => ({ ...q, answers: q.answers.filter(a => a.text.trim()) })).filter(q => q.text.trim());
    if (d.kind === 'trivia' && !(c.tiers ?? []).length) c.tiers = defaultTiers(c.questions.length);
  }
  return { ...d, title: d.title.trim(), intro: d.intro?.trim() || null, content: c };
}

function fmtWhen(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ChaiAdminScreen() {
  const ds = useDS();
  const { c, shadow } = ds;
  const isDesktop = useIsDesktopWeb();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const threeCol = isDesktop && width >= 1180;

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<ChaiPost[]>([]);
  const [bucket, setBucket] = useState<Bucket>('live');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [when, setWhen] = useState<'now' | 'schedule'>('now');
  const [whenText, setWhenText] = useState('');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAllowed(false); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const ok = ADMIN_ROLES.includes(String((prof as any)?.role ?? '').toLowerCase());
    setAllowed(ok);
    if (!ok) return;
    const { data } = await supabase.from('chai_posts')
      .select('id, kind, title, intro, cover_color, content, status, publish_at, ends_at, comments_enabled, show_on_home, show_breakdown, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(200);
    setPosts((data ?? []) as any);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const out: Record<Bucket, number> = { live: 0, scheduled: 0, draft: 0, ended: 0 };
    posts.forEach(p => { out[bucketOf(p)]++; });
    return out;
  }, [posts]);
  const listed = posts.filter(p => bucketOf(p) === bucket);

  function open(p: ChaiPost | Draft) {
    setDraft(JSON.parse(JSON.stringify(p)));
    setErrors([]); setSavedNote(null);
    const future = p.publish_at && new Date(p.publish_at).getTime() > Date.now();
    setWhen(future ? 'schedule' : 'now');
    setWhenText(toLocalInput(future ? p.publish_at : null));
  }

  const set = (patch: Partial<Draft>) => setDraft(d => d ? { ...d, ...patch } : d);
  const setContent = (patch: Partial<ChaiContent>) => setDraft(d => d ? { ...d, content: { ...d.content, ...patch } } : d);

  async function save(publish: boolean) {
    if (!draft) return;
    const d = clean(draft);
    if (publish) {
      const p = problems(d);
      if (p.length) { setErrors(p); return; }
    }
    let publishAt: string | null = d.publish_at;
    if (publish) {
      if (when === 'schedule') {
        const t = new Date(whenText.replace(' ', 'T'));
        if (isNaN(t.getTime())) { setErrors(['Enter the publish time as YYYY-MM-DD HH:MM.']); return; }
        publishAt = t.toISOString();
      } else if (!publishAt || new Date(publishAt).getTime() > Date.now()) {
        publishAt = new Date().toISOString();
      }
    }
    setErrors([]);
    setSaving(publish ? 'publish' : 'draft');
    const row = {
      kind: d.kind, title: d.title || 'Untitled', intro: d.intro, cover_color: d.cover_color, content: d.content,
      status: publish ? 'live' : (d.id ? d.status : 'draft'),
      publish_at: publish ? publishAt : d.publish_at,
      ends_at: d.ends_at, comments_enabled: d.comments_enabled, show_on_home: d.show_on_home, show_breakdown: d.show_breakdown,
    };
    const res = d.id
      ? await supabase.from('chai_posts').update(row).eq('id', d.id).select().single()
      : await supabase.from('chai_posts').insert(row).select().single();
    setSaving(null);
    if (res.error) { setErrors([res.error.message]); return; }
    const saved = res.data as any as ChaiPost;
    setDraft(JSON.parse(JSON.stringify(saved)));
    setSavedNote(publish ? (when === 'schedule' ? `Scheduled for ${fmtWhen(saved.publish_at)}` : 'Published. It’s live in Chai now.') : 'Draft saved.');
    setBucket(bucketOf(saved));
    load();
  }

  async function endOrDelete(kind: 'end' | 'unpublish' | 'delete') {
    if (!draft?.id) { setDraft(null); return; }
    const label = kind === 'delete' ? 'Delete this for good? Votes, results and comments go too.' : kind === 'end' ? 'End it now? People can still see results and comments.' : 'Move it back to drafts? It disappears from the app.';
    const go = async () => {
      const res = kind === 'delete'
        ? await supabase.from('chai_posts').delete().eq('id', draft.id!)
        : await supabase.from('chai_posts').update(kind === 'end' ? { status: 'ended' } : { status: 'draft' }).eq('id', draft.id!);
      if (res.error) { setErrors([res.error.message]); return; }
      if (kind === 'delete') setDraft(null); else setDraft(d => d ? { ...d, status: kind === 'end' ? 'ended' : 'draft' } : d);
      load();
    };
    if (Platform.OS === 'web') { if (window.confirm(label)) go(); }
    else Alert.alert(label, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: kind === 'delete' ? 'Delete' : 'Yes', style: 'destructive', onPress: go }]);
  }

  // ── Gates ──────────────────────────────────────────────────────────
  if (allowed === null) {
    return <DesktopShell><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.gold} /></View></DesktopShell>;
  }
  if (!allowed) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: space[8], gap: space[4] }}>
          <Text style={[type.headline, { color: c.ink }]}>Admin access required</Text>
          <Button label="Go back" variant="secondary" size="md" onPress={() => goBack('/home')} />
        </View>
      </DesktopShell>
    );
  }

  const card = [{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[5] }, shadow('card')];

  // ── List ───────────────────────────────────────────────────────────
  const statusPill = (p: ChaiPost) => {
    const b = bucketOf(p);
    const look = b === 'live' ? { bg: c.seedTint, fg: c.seed, t: 'Live' } : b === 'scheduled' ? { bg: c.goldTint, fg: c.goldInk, t: 'Scheduled' } : b === 'draft' ? { bg: c.surfaceSoft, fg: c.ink2, t: 'Draft' } : { bg: c.surfaceSoft, fg: c.ink2, t: 'Ended' };
    return <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: look.bg, justifyContent: 'center' }}><Text style={[type.micro, { fontSize: 11, color: look.fg }]}>{look.t}</Text></View>;
  };

  const list = (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        <Button label="New poll" icon="add" variant="secondary" size="sm" onPress={() => open(blank('poll'))} />
        <Button label="New quiz" icon="add" variant="secondary" size="sm" onPress={() => open(blank('personality'))} />
        <Button label="New trivia" icon="add" variant="secondary" size="sm" onPress={() => open(blank('trivia'))} />
      </View>
      <SegmentedControl
        label="Status"
        value={bucket}
        onChange={setBucket}
        options={[{ value: 'live', label: `Live ${counts.live}` }, { value: 'scheduled', label: `Soon ${counts.scheduled}` }, { value: 'draft', label: `Drafts ${counts.draft}` }, { value: 'ended', label: `Ended ${counts.ended}` }]}
      />
      {listed.length === 0 ? <Text style={[type.callout, { color: c.ink2, paddingVertical: space[4] }]}>Nothing here.</Text> : listed.map(p => (
        <Pressable key={p.id} onPress={() => open(p)} accessibilityRole="button"
          style={({ pressed, hovered }: any) => ({ padding: space[3], borderRadius: radius.md, backgroundColor: draft?.id === p.id ? c.surfaceSoft : hovered || pressed ? c.bgSunk : 'transparent', gap: 4 })}>
          <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={2}>{p.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {statusPill(p)}
            <Text style={[type.micro, font(500), { color: c.ink2 }]}>{KIND_LABEL[p.kind]}{bucketOf(p) === 'scheduled' ? ` · ${fmtWhen(p.publish_at)}` : ''}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );

  // ── Editor ─────────────────────────────────────────────────────────
  const smallLink = (label: string, onPress: () => void, danger = false) => (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button"><Text style={[type.caption, font(600), { color: danger ? c.danger : c.ink, textDecorationLine: 'underline' }]}>{label}</Text></Pressable>
  );

  const editor = draft ? (() => {
    const d = draft;
    const qs = d.content.questions ?? [];
    const results = d.content.results ?? [];
    const updQ = (i: number, patch: any) => setContent({ questions: qs.map((q, j) => j === i ? { ...q, ...patch } : q) });
    const moveQ = (i: number, dir: -1 | 1) => { const n = [...qs]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setContent({ questions: n }); };
    return (
      <View style={{ gap: space[5] }}>
        <View style={[card, { gap: space[4] }]}>
          <SegmentedControl
            label="Type"
            value={d.kind}
            onChange={(k) => { if (!d.id) setDraft({ ...blank(k), title: d.title, intro: d.intro }); }}
            options={[{ value: 'poll', label: 'Poll' }, { value: 'personality', label: 'Personality' }, { value: 'trivia', label: 'Trivia' }]}
          />
          {d.id ? <Text style={[type.caption, { color: c.ink2, marginTop: -8 }]}>Type is locked once saved.</Text> : null}
          <TextField label="Title" value={d.title} onChangeText={(v) => set({ title: v })} placeholder={d.kind === 'poll' ? 'What do you break your fast with first?' : 'Which Ramadan snack are you?'} maxLength={200} />
          <TextField label="Intro (optional)" value={d.intro ?? ''} onChangeText={(v) => set({ intro: v })} multiline maxLength={400} placeholder="One line that sets it up" style={{ minHeight: 70 }} />
          <View style={{ gap: 6 }}>
            <Text style={[type.caption, font(600), { color: c.ink2 }]}>Cover color</Text>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {COVER_COLORS.map(col => (
                <Pressable key={col} onPress={() => set({ cover_color: col as CoverColor })} accessibilityRole="radio" accessibilityState={{ checked: d.cover_color === col }} accessibilityLabel={col}
                  style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: coverHex(col), borderWidth: 2.5, borderColor: d.cover_color === col ? chai.ink : 'transparent' }} />
              ))}
            </View>
          </View>
        </View>

        {d.kind === 'poll' ? (
          <View style={[card, { gap: space[3] }]}>
            <Text style={[type.headline, { color: c.ink }]}>Options</Text>
            {(d.content.options ?? []).map((o, i, all) => (
              <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <View style={{ flex: 1 }}><TextField value={o.label} onChangeText={(v) => setContent({ options: all.map(x => x.id === o.id ? { ...x, label: v } : x) })} placeholder={`Option ${i + 1}`} maxLength={80} /></View>
                {all.length > 2 ? <IconButton icon="close" label={`Remove option ${i + 1}`} size="sm" onPress={() => setContent({ options: all.filter(x => x.id !== o.id) })} /> : null}
              </View>
            ))}
            {(d.content.options ?? []).length < 6 ? <Button label="Add option" icon="add" variant="soft" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => setContent({ options: [...(d.content.options ?? []), { id: uid(), label: '' }] })} /> : null}
          </View>
        ) : null}

        {d.kind === 'personality' ? (
          <View style={[card, { gap: space[3] }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={[type.headline, { color: c.ink }]}>Results <Text style={[font(500), { color: c.ink2 }]}>· {results.length}</Text></Text>
              {smallLink('+ Add result', () => setContent({ results: [...results, { id: uid(), name: '', description: '' }] }))}
            </View>
            {results.map((r, i) => (
              <View key={r.id} style={{ padding: space[3], borderRadius: radius.md, backgroundColor: c.bgSunk, gap: space[2] }}>
                <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                  <View style={{ flex: 1 }}><TextField value={r.name} onChangeText={(v) => setContent({ results: results.map(x => x.id === r.id ? { ...x, name: v } : x) })} placeholder={`Result ${i + 1}, e.g. The samosa`} maxLength={60} /></View>
                  {results.length > 2 ? <IconButton icon="close" label={`Remove result ${i + 1}`} size="sm" onPress={() => setContent({ results: results.filter(x => x.id !== r.id) })} /> : null}
                </View>
                <TextField value={r.description} onChangeText={(v) => setContent({ results: results.map(x => x.id === r.id ? { ...x, description: v } : x) })} placeholder="What this result says about them" multiline maxLength={300} style={{ minHeight: 60 }} />
              </View>
            ))}
          </View>
        ) : null}

        {d.kind !== 'poll' ? (
          <View style={[card, { gap: space[3] }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={[type.headline, { color: c.ink }]}>Questions <Text style={[font(500), { color: c.ink2 }]}>· {qs.length}</Text></Text>
              <Text style={[type.caption, { color: c.ink2 }]}>{d.kind === 'personality' ? 'Each answer points to a result' : 'Tap the circle to mark the right answer'}</Text>
            </View>
            {qs.map((q, i) => (
              <View key={q.id} style={{ padding: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, gap: space[2] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[type.micro, { color: c.ink2 }]}>QUESTION {i + 1}</Text>
                  <View style={{ flexDirection: 'row', gap: space[3] }}>
                    {i > 0 ? smallLink('Move up', () => moveQ(i, -1)) : null}
                    {i < qs.length - 1 ? smallLink('Move down', () => moveQ(i, 1)) : null}
                    {qs.length > 1 ? smallLink('Delete', () => setContent({ questions: qs.filter((_, j) => j !== i) }), true) : null}
                  </View>
                </View>
                <TextField value={q.text} onChangeText={(v) => updQ(i, { text: v })} placeholder="Ask something fun" maxLength={200} />
                <TextField value={q.image ?? ''} onChangeText={(v) => updQ(i, { image: v.trim() || undefined })} placeholder="Photo URL (optional), e.g. https://www.siqa.us/chai/…" maxLength={500} autoCapitalize="none" />
                {d.kind === 'trivia' ? <TextField value={q.note ?? ''} onChangeText={(v) => updQ(i, { note: v || undefined })} placeholder="Explanation shown with the answers (optional)" maxLength={200} /> : null}
                {q.answers.map((a, k) => (
                  <View key={a.id} style={{ gap: 6, padding: space[2], borderRadius: radius.md, backgroundColor: c.bgSunk }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                      {d.kind === 'trivia' ? (
                        <Pressable onPress={() => updQ(i, { correct: a.id })} accessibilityRole="radio" accessibilityState={{ checked: q.correct === a.id }} accessibilityLabel={`Mark answer ${k + 1} correct`} hitSlop={6}>
                          <Icon name={q.correct === a.id ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={q.correct === a.id ? c.seed : c.ink3} />
                        </Pressable>
                      ) : null}
                      <View style={{ flex: 1 }}><TextField value={a.text} onChangeText={(v) => updQ(i, { answers: q.answers.map(x => x.id === a.id ? { ...x, text: v } : x) })} placeholder={`Answer ${k + 1}`} maxLength={120} /></View>
                      {q.answers.length > 2 ? <IconButton icon="close" label={`Remove answer ${k + 1}`} size="sm" onPress={() => updQ(i, { answers: q.answers.filter(x => x.id !== a.id), correct: q.correct === a.id ? undefined : q.correct })} /> : null}
                    </View>
                    {d.kind === 'personality' ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
                        <Text style={[type.micro, font(500), { color: c.ink2 }]}>Counts toward</Text>
                        {results.filter(r => r.name.trim()).map(r => (
                          <Chip key={r.id} label={r.name} selected={a.result === r.id} onPress={() => updQ(i, { answers: q.answers.map(x => x.id === a.id ? { ...x, result: r.id } : x) })} />
                        ))}
                        {!results.some(r => r.name.trim()) ? <Text style={[type.micro, font(500), { color: c.ink3 }]}>Name your results first</Text> : null}
                      </ScrollView>
                    ) : null}
                  </View>
                ))}
                {q.answers.length < 6 ? smallLink('+ Add answer', () => updQ(i, { answers: [...q.answers, { id: uid(), text: '' }] })) : null}
              </View>
            ))}
            <Button label="Add question" icon="add" variant="soft" size="md" style={{ alignSelf: 'flex-start' }}
              onPress={() => setContent({ questions: [...qs, { id: uid(), text: '', answers: [{ id: uid(), text: '' }, { id: uid(), text: '' }] }] })} />
          </View>
        ) : null}
      </View>
    );
  })() : null;

  // ── Settings + publish ─────────────────────────────────────────────
  const settings = draft ? (
    <View style={{ gap: space[5] }}>
      <View style={[card]}>
        <Text style={[type.headline, { color: c.ink, marginBottom: 2 }]}>Settings</Text>
        <ListRow label="Comments" sub="Let people discuss it" right={<Switch label="Comments" value={draft.comments_enabled} onValueChange={(v) => set({ comments_enabled: v })} />} />
        <ListRow label="Show on Home" sub="Feature in Today's Chai" right={<Switch label="Show on Home" value={draft.show_on_home} onValueChange={(v) => set({ show_on_home: v })} />} />
        {draft.kind !== 'poll' ? <ListRow label="Results breakdown" sub={'"31% got this too"'} right={<Switch label="Results breakdown" value={draft.show_breakdown} onValueChange={(v) => set({ show_breakdown: v })} />} /> : null}
        {draft.kind === 'poll' ? (
          <View style={{ paddingVertical: space[3], gap: space[2] }}>
            <Text style={[type.body, font(500), { color: c.ink }]}>Voting closes</Text>
            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
              {[3, 7, 14].map(n => {
                const on = draft.ends_at && Math.round((new Date(draft.ends_at).getTime() - Date.now()) / 86400000) === n;
                return <Chip key={n} label={`${n} days`} selected={!!on} onPress={() => set({ ends_at: new Date(Date.now() + n * 86400000).toISOString() })} />;
              })}
              <Chip label="Never" selected={!draft.ends_at} onPress={() => set({ ends_at: null })} />
            </View>
            {draft.ends_at ? <Text style={[type.caption, { color: c.ink2 }]}>Closes {fmtWhen(draft.ends_at)}</Text> : null}
          </View>
        ) : null}
        <View style={{ paddingTop: space[3], gap: space[2] }}>
          <Text style={[type.body, font(500), { color: c.ink }]}>When to publish</Text>
          <SegmentedControl label="When to publish" value={when} onChange={setWhen} options={[{ value: 'now', label: 'Now' }, { value: 'schedule', label: 'Schedule' }]} />
          {when === 'schedule' ? <TextField value={whenText} onChangeText={setWhenText} placeholder="2026-11-14 09:00" help="Your local time, YYYY-MM-DD HH:MM" autoCapitalize="none" /> : null}
        </View>
      </View>

      <View style={[card, { gap: space[3] }]}>
        <Text style={[type.headline, { color: c.ink }]}>Preview</Text>
        <View style={{ borderWidth: chai.line, borderColor: chai.ink, borderRadius: 18, overflow: 'hidden', backgroundColor: chai.cream, boxShadow: `4px 4px 0px ${chai.ink}` } as any}>
          <View style={{ height: 70, backgroundColor: coverHex(draft.cover_color), borderBottomWidth: chai.line, borderBottomColor: chai.ink }} />
          <View style={{ padding: 12, gap: 4 }}>
            <Text style={{ fontFamily: Platform.OS === 'web' ? '"Space Mono", monospace' : 'SpaceMono_700Bold', fontSize: 10, letterSpacing: 1, color: chai.ink }}>{KIND_LABEL[draft.kind].toUpperCase()}</Text>
            <Text style={{ fontFamily: Platform.OS === 'web' ? 'Fredoka, Inter, sans-serif' : 'Fredoka_700Bold', fontWeight: Platform.OS === 'web' ? '700' : undefined, fontSize: 18, color: chai.ink }}>{draft.title || 'Your title here'}</Text>
          </View>
        </View>
        <Text style={[type.caption, { color: c.ink2 }]}>How it looks in the Chai tab</Text>
      </View>

      {errors.length ? (
        <View style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.dangerTint, gap: 4 }}>
          {errors.map(e => <Text key={e} style={[type.caption, { color: c.danger }]}>• {e}</Text>)}
        </View>
      ) : null}
      {savedNote ? <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: c.seedTint }}><Text style={[type.caption, font(600), { color: c.seed }]}>{savedNote}</Text></View> : null}

      {!threeCol ? null : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Save draft" variant="secondary" grow loading={saving === 'draft'} onPress={() => save(false)} />
          <Button label={draft.status === 'live' ? 'Update' : when === 'schedule' ? 'Schedule' : 'Publish'} grow loading={saving === 'publish'} onPress={() => save(true)} />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space[4], flexWrap: 'wrap' }}>
        {draft.id && draft.status === 'live' ? smallLink(draft.kind === 'poll' ? 'End voting now' : 'End it', () => endOrDelete('end')) : null}
        {draft.id && draft.status !== 'draft' ? smallLink('Move to drafts', () => endOrDelete('unpublish')) : null}
        {draft.id ? smallLink('Delete', () => endOrDelete('delete'), true) : null}
        {draft.id && draft.status !== 'draft' ? smallLink('Open in app', () => router.push({ pathname: '/chai/[id]', params: { id: draft.id! } } as any)) : null}
      </View>
    </View>
  ) : null;

  const pageHeader = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      <IconButton icon="chevron-back" label="Back" onPress={() => draft && !threeCol ? setDraft(null) : goBack('/admin')} />
      <View style={{ flex: 1 }}>
        <Text style={[type.caption, { color: c.ink2 }]}>Admin › Chai</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ChaiIcon size={isDesktop ? 28 : 22} color={c.gold} strokeWidth={2} />
          <Text style={[isDesktop ? type.display : type.title2, { color: c.ink }]} accessibilityRole="header">{draft && !threeCol ? (draft.id ? 'Edit' : 'New') + ' ' + KIND_LABEL[draft.kind].toLowerCase() : 'Chai builder'}</Text>
        </View>
      </View>
    </View>
  );

  // ── Layouts ────────────────────────────────────────────────────────
  if (threeCol) {
    return (
      <DesktopShell>
        <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={{ padding: space[8], paddingBottom: 64 }}>
          <View style={{ maxWidth: 1360, width: '100%', alignSelf: 'center', gap: space[5] }}>
            {pageHeader}
            <View style={{ flexDirection: 'row', gap: space[5], alignItems: 'flex-start' }}>
              <View style={[card, { width: 300, padding: space[3] }]}>{list}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {editor ?? <View style={[card, { alignItems: 'center', paddingVertical: space[10], gap: space[3] }]}><ChaiIcon size={36} color={c.ink3} /><Text style={[type.callout, { color: c.ink2 }]}>Pick something on the left, or start a new poll or quiz.</Text></View>}
              </View>
              {settings ? <View style={{ width: 340 }}>{settings}</View> : null}
            </View>
          </View>
        </ScrollView>
      </DesktopShell>
    );
  }

  // Phone and narrow desktop: list, then a full-screen editor.
  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: draft ? c.bg : c.bgSunk }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: isDesktop ? space[6] : Math.max(insets.top, HEADER_TOP_PADDING - 20) + 4, paddingBottom: 120, gap: space[5], maxWidth: 760, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {pageHeader}
          {draft ? <>{editor}{settings}</> : <View style={[card, { padding: space[4] }]}>{list}</View>}
        </ScrollView>
        {draft ? (
          <View style={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, 12) + 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
            <View style={{ flexDirection: 'row', gap: space[2], maxWidth: 720, width: '100%', alignSelf: 'center' }}>
              <Button label="Save draft" variant="secondary" grow loading={saving === 'draft'} onPress={() => save(false)} />
              <Button label={draft.status === 'live' ? 'Update' : when === 'schedule' ? 'Schedule' : 'Publish'} grow loading={saving === 'publish'} onPress={() => save(true)} />
            </View>
          </View>
        ) : null}
      </View>
    </DesktopShell>
  );
}
