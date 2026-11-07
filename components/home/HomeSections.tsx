// Home page sections: featured video, Today's Chai, Seeds close to goal,
// From the Shop. Each loads its own data and hides itself when empty, so
// Home never shows a blank section.

import { useCallback, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { font, radius, space, type, useDS } from '../../lib/ds';
import { Glyph } from '../Glyph';
import { ChaiIcon } from '../Siqa';
import { ChaiCard } from '../chai/ChaiUI';
import { chai, chaiFont, fetchFeed, myVotes, pollResults, castVote, isOpen, type ChaiPost } from '../../lib/chai';
import { guardTabSwipe } from '../useTabSwipe';

export function SectionHeader({ title, icon, action, onAction, pad = space[4] }: { title: string; icon?: ReactNode; action?: string; onAction?: () => void; pad?: number }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: pad, marginBottom: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={[type.headline, { fontSize: 18, color: c.ink }]} accessibilityRole="header">{title}</Text>
      </View>
      {action ? (
        <Pressable onPress={guardTabSwipe(() => onAction?.())} hitSlop={8} accessibilityRole="link">
          <Text style={[type.subhead, font(600), { color: c.ink2 }]}>{action} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Featured video ─────────────────────────────────────────────────────
export type FeaturedVideo = {
  id: string; title: string; thumbnail_url: string | null; duration_secs: number | null; view_count: number;
  speakers: { display_name: string; is_verified: boolean } | null;
};

export function FeaturedVideoCard({ video, pad = space[4] }: { video: FeaturedVideo; pad?: number }) {
  const { c } = useDS();
  const dur = video.duration_secs ? `${Math.floor(video.duration_secs / 60)}:${String(video.duration_secs % 60).padStart(2, '0')}` : '';
  return (
    <Pressable onPress={guardTabSwipe(() => router.push(`/watch/${video.id}` as any))} style={{ paddingHorizontal: pad }} accessibilityRole="link" accessibilityLabel={`Featured: ${video.title}`} {...({ dataSet: { hover: 'card' } } as any)}>
      <View style={{ aspectRatio: 16 / 9, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.surfaceSoft }}>
        {video.thumbnail_url ? (
          <View style={StyleSheet.absoluteFill} {...({ dataSet: { hoverMedia: '1' } } as any)}>
            <Image source={{ uri: video.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        ) : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Glyph name="play" size={32} color={c.ink3} /></View>}
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="none">
          <View style={{ padding: space[4], paddingTop: space[10], backgroundImage: 'linear-gradient(transparent, rgba(0,0,0,0.75))', backgroundColor: Platform.OS === 'web' ? undefined : 'rgba(0,0,0,0.45)' } as any}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: '#d4ac73', borderRadius: radius.pill, paddingHorizontal: 8, height: 22, justifyContent: 'center', marginBottom: 6 }}>
              <Text style={[type.micro, { color: '#111' }]}>FEATURED</Text>
            </View>
            <Text style={[type.title2 ?? type.headline, { color: '#fff', fontSize: 20, lineHeight: 25, fontWeight: '800' } as any]} numberOfLines={2}>{video.title}</Text>
            <Text style={[type.caption, { color: 'rgba(255,255,255,0.85)', marginTop: 2 }]}>{video.speakers?.display_name ?? 'Siqa'}{dur ? ` · ${dur}` : ''}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Today's Chai ───────────────────────────────────────────────────────
export function useHomeChai() {
  const [posts, setPosts] = useState<ChaiPost[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Record<string, number>>>({});
  const load = useCallback(async () => {
    try {
      const feed = await fetchFeed({ homeOnly: true, limit: 8 });
      setPosts(feed);
      const polls = feed.filter(p => p.kind === 'poll');
      const mine = await myVotes(polls.map(p => p.id));
      setVotes(mine);
      const need = polls.filter(p => mine[p.id] || !isOpen(p));
      const res = await Promise.all(need.map(p => pollResults(p.id)));
      setResults(Object.fromEntries(need.map((p, i) => [p.id, res[i]])));
    } catch { setPosts([]); }
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
    if (first) setPosts(ps => ps.map(p => p.id === post.id ? { ...p, people: (p.people ?? 0) + 1 } : p));
  }
  return { posts, votes, results, vote };
}

export function ChaiStripHeader({ pad = space[4] }: { pad?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: pad, marginBottom: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: chai.saffron, borderWidth: 2, borderColor: chai.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] }}>
          <ChaiIcon size={16} color={chai.ink} strokeWidth={2.4} />
        </View>
        <Text style={[chaiFont('displayBold'), { fontSize: 20, color: chai.ink }]} accessibilityRole="header">Today's Chai</Text>
      </View>
      <Pressable onPress={guardTabSwipe(() => router.push('/chai' as any))} hitSlop={8} accessibilityRole="link">
        <Text style={[chaiFont('mono'), { fontSize: 11, letterSpacing: 1, color: chai.ink }]}>SEE ALL ›</Text>
      </Pressable>
    </View>
  );
}

/** Horizontal strip of compact Chai cards on a cream band. */
export function TodaysChai({ chaiState, pad = space[4] }: { chaiState: ReturnType<typeof useHomeChai>; pad?: number }) {
  const { posts, votes, results, vote } = chaiState;
  if (!posts.length) return null;
  return (
    <View style={{ backgroundColor: chai.cream, paddingVertical: space[5], marginBottom: space[6] }}>
      <ChaiStripHeader pad={pad} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: space[3], paddingBottom: 6, paddingRight: pad + 6 }}>
        {posts.map(p => (
          <ChaiCard key={p.id} post={p} compact width={260} myVote={votes[p.id]} votes={results[p.id]} onVote={(o) => vote(p, o)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Desktop: one big poll beside the featured video. */
export function ChaiHeroCard({ chaiState }: { chaiState: ReturnType<typeof useHomeChai> }) {
  const { posts, votes, results, vote } = chaiState;
  const poll = posts.find(p => p.kind === 'poll' && isOpen(p)) ?? posts[0];
  if (!poll) return null;
  return (
    <View style={{ backgroundColor: chai.cream, borderRadius: radius.xl, padding: space[5], gap: space[3], flex: 1 }}>
      <ChaiStripHeader pad={0} />
      <ChaiCard post={poll} featured myVote={votes[poll.id]} votes={results[poll.id]} onVote={(o) => vote(poll, o)} width="100%" />
    </View>
  );
}

// ── Seeds close to goal ────────────────────────────────────────────────
type SeedRow = { id: string; title: string; goal_amount: number | null; raised_amount: number | null; donor_count: number | null; cover_image_url: string | null; image_url: string | null };

export function SeedsCloseToGoal({ pad = space[4], cardWidth = 240 }: { pad?: number; cardWidth?: number }) {
  const { c } = useDS();
  const [seeds, setSeeds] = useState<SeedRow[]>([]);
  useFocusEffect(useCallback(() => {
    supabase.from('fundraisers').select('id, title, goal_amount, raised_amount, donor_count, cover_image_url, image_url')
      .in('status', ['active', 'published', 'approved', 'live']).gt('goal_amount', 0).limit(60)
      .then(({ data }) => {
        const rows = ((data ?? []) as SeedRow[]).filter(s => (s.raised_amount ?? 0) < (s.goal_amount ?? 0));
        rows.sort((a, b) => (b.raised_amount ?? 0) / (b.goal_amount || 1) - (a.raised_amount ?? 0) / (a.goal_amount || 1));
        setSeeds(rows.slice(0, 8));
      });
  }, []));
  if (!seeds.length) return null;
  const money = (n: number) => `$${Math.round(n / 100).toLocaleString('en-US')}`;
  return (
    <View style={{ marginBottom: space[6] }}>
      <SectionHeader title="Seeds close to their goal" action="All Seeds" onAction={() => router.push('/seeds' as any)} pad={pad} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: space[3] }}>
        {seeds.map(s => {
          const pctN = Math.min(100, Math.round(((s.raised_amount ?? 0) / (s.goal_amount || 1)) * 100));
          const img = s.cover_image_url || s.image_url;
          return (
            <Pressable key={s.id} onPress={guardTabSwipe(() => router.push({ pathname: '/seed/[id]', params: { id: s.id } } as any))} style={{ width: cardWidth }} accessibilityRole="link" accessibilityLabel={`${s.title}, ${pctN}% funded`} {...({ dataSet: { hover: 'card' } } as any)}>
              <View style={{ aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.seedTint }}>
                {img ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
                <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: c.seed, borderRadius: radius.pill, paddingHorizontal: 8, height: 22, justifyContent: 'center' }}>
                  <Text style={[type.micro, { color: '#fff' }]}>{pctN}% funded</Text>
                </View>
              </View>
              <Text style={[type.subhead, font(600), { color: c.ink, marginTop: 8 }]} numberOfLines={2}>{s.title}</Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceSoft, marginTop: 8, overflow: 'hidden' }}>
                <View style={{ width: `${pctN}%`, height: '100%', backgroundColor: c.seed, borderRadius: 3 }} />
              </View>
              <Text style={[type.caption, { color: c.ink2, marginTop: 6 }]}>
                <Text style={[font(700), { color: c.ink }]}>{money(s.raised_amount ?? 0)}</Text> of {money(s.goal_amount ?? 0)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── From the Shop ──────────────────────────────────────────────────────
type ProductRow = { id: string; title: string; price_cents: number; images: string[] | null; marketplace_sellers: { shop_name: string | null } | null };

export function FromTheShop({ pad = space[4], cardWidth = 160 }: { pad?: number; cardWidth?: number }) {
  const { c } = useDS();
  const [items, setItems] = useState<ProductRow[]>([]);
  useFocusEffect(useCallback(() => {
    supabase.from('marketplace_products')
      .select('id, title, price_cents, images, marketplace_sellers!marketplace_products_seller_id_fkey!inner(shop_name, approval_status)')
      .eq('status', 'active').eq('marketplace_sellers.approval_status', 'approved')
      .order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => setItems((data ?? []) as any));
  }, []));
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: space[6] }}>
      <SectionHeader title="From the Shop" action="Shop" onAction={() => router.push('/marketplace' as any)} pad={pad} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: space[3] }}>
        {items.map(p => (
          <Pressable key={p.id} onPress={guardTabSwipe(() => router.push({ pathname: '/product/[id]', params: { id: p.id } } as any))} style={{ width: cardWidth }} accessibilityRole="link" accessibilityLabel={p.title} {...({ dataSet: { hover: 'card' } } as any)}>
            <View style={{ aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surfaceSoft }}>
              {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            </View>
            <Text style={[type.subhead, font(500), { color: c.ink, marginTop: 8 }]} numberOfLines={2}>{p.title}</Text>
            <Text style={[type.subhead, font(700), { color: c.ink, marginTop: 2 }]}>${(p.price_cents / 100).toFixed(2)}</Text>
            {p.marketplace_sellers?.shop_name ? <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>{p.marketplace_sellers.shop_name}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
