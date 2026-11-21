// Organization space: Seeds, recent gifts, verification and quick actions for a nonprofit.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { font, radius, space, type, useDS } from '../../lib/ds';
import { Button } from '../ui';
import { Card, CardTitle, Empty, PageHeader, Tag } from '../masjid/admin/kit';
import { TaxExemptCard } from '../TaxExemptCard';
import { formatPrice } from '../../lib/money';
import { openOnSiqa } from './links';

type Seed = { id: string; title: string; status: string; goal_amount: number | null; raised_amount: number | null; donor_count: number | null; cover_image_url: string | null };
type Gift = { id: string; amount: number; donor_name: string | null; is_anonymous: boolean | null; campaign_title: string | null; created_at: string; status: string | null };

export function OrgOverview({ orgId, wide }: { orgId: string; wide: boolean }) {
  const { c } = useDS();
  const [org, setOrg] = useState<any>(null);
  const [seeds, setSeeds] = useState<Seed[] | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [followers, setFollowers] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [o, s, g] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
      supabase.from('fundraisers').select('id, title, status, goal_amount, raised_amount, donor_count, cover_image_url').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('donations').select('id, amount, donor_name, is_anonymous, campaign_title, created_at, status').eq('org_id', orgId).order('created_at', { ascending: false }).limit(8),
    ]);
    setOrg(o.data); setSeeds((s.data as Seed[]) || []); setGifts((g.data as Gift[]) || []);
    if ((o.data as any)?.profile_id) {
      const { count } = await supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', (o.data as any).profile_id);
      setFollowers(count ?? 0);
    }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const raisedMonth = gifts.filter((g) => new Date(g.created_at) >= monthStart && g.status !== 'refunded').reduce((a, g) => a + (g.amount || 0), 0);
  const raisedAll = (seeds ?? []).reduce((a, s) => a + (s.raised_amount ?? 0), 0);
  const donors = (seeds ?? []).reduce((a, s) => a + (s.donor_count ?? 0), 0);

  return (
    <>
      <PageHeader title={org?.org_name ?? 'Organization'} sub="Seeds, donors and your public page."
        right={<>
          <Button label="View page" variant="secondary" size="md" onPress={() => openOnSiqa(`/org-profile?id=${orgId}`)} />
          <Button label="Start a Seed" icon="add" size="md" onPress={() => router.push({ pathname: '/seed-create', params: { orgId } } as any)} />
        </>} />

      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[5] }}>
        <Stat v={formatPrice(raisedAll).replace(/\.00$/, '')} l="Raised on Siqa" green />
        <Stat v={String(donors)} l="Donors" />
        <Stat v={followers == null ? '–' : String(followers)} l="Followers" />
        <Stat v={org?.is_verified ? 'Verified' : 'Not verified'} l={org?.ein_verified ? 'EIN checked' : 'EIN not checked'} />
      </Card>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[5], alignItems: 'flex-start' }}>
        <Card style={{ flex: wide ? 1.4 : undefined, alignSelf: 'stretch' }}>
          <CardTitle>Seeds</CardTitle>
          {seeds && seeds.length === 0 ? <Empty icon="leaf-outline" title="No Seeds yet" sub="A Seed is a campaign with a goal, a story and a donate page." /> : null}
          {(seeds ?? []).map((s, i, arr) => {
            const pct = s.goal_amount ? Math.min(100, Math.round(((s.raised_amount ?? 0) / s.goal_amount) * 100)) : 0;
            return (
              <Pressable key={s.id} onPress={() => openOnSiqa(`/seed/${s.id}`)} accessibilityRole="link"
                style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                {s.cover_image_url ? <Image source={{ uri: s.cover_image_url }} style={{ width: 72, height: 52, borderRadius: 10, backgroundColor: c.bgSunk }} /> : <View style={{ width: 72, height: 52, borderRadius: 10, backgroundColor: c.bgSunk }} />}
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={[type.callout, font(600), { color: c.ink }]} numberOfLines={1}>{s.title}</Text>
                  <View style={{ height: 8, borderRadius: 999, backgroundColor: c.surfaceStrong, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.seed }} /></View>
                  <Text style={[type.caption, { color: c.ink2 }]}>{formatPrice(s.raised_amount ?? 0)} of {formatPrice(s.goal_amount ?? 0)} · {s.donor_count ?? 0} donors</Text>
                </View>
                <Tag label={s.status === 'active' ? 'Live' : s.status === 'draft' ? 'Draft' : s.status} tone={s.status === 'active' ? 'seed' : 'soft'} />
              </Pressable>
            );
          })}
        </Card>
        <View style={{ flex: wide ? 1 : undefined, gap: space[5], alignSelf: 'stretch' }}>
          <Card>
            <CardTitle>Recent gifts</CardTitle>
            {gifts.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>Gifts to your Seeds show up here.</Text> : null}
            {gifts.map((g, i) => (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 8, borderBottomWidth: i === gifts.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.callout, font(600), { color: c.ink }]}>{g.is_anonymous ? 'Anonymous' : g.donor_name || 'A donor'}</Text>
                  <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>{[g.campaign_title, new Date(g.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={[type.callout, font(700), { color: c.seed }]}>{formatPrice(g.amount)}</Text>
              </View>
            ))}
            {raisedMonth ? <Text style={[type.caption, { color: c.ink2 }]}>{formatPrice(raisedMonth)} this month</Text> : null}
          </Card>
          {org ? <TaxExemptCard org={org} isAdmin={false} canEdit onChanged={load} /> : null}
        </View>
      </View>
    </>
  );
}

function Stat({ v, l, green }: { v: string; l: string; green?: boolean }) {
  const { c } = useDS();
  return (
    <View style={{ flex: 1, minWidth: 130, gap: 2 }}>
      <Text style={[type.title1, { color: green ? c.seed : c.ink }]}>{v}</Text>
      <Text style={[type.caption, { color: c.ink2 }]}>{l}</Text>
    </View>
  );
}
