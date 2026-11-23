// Siqa Admin → Overview: headline numbers, what's waiting, and recent activity.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../ui';
import { Icon, type SiqaIconName } from '../../Icon';
import { AdminPage, Kpi, Panel, Pill, since } from './kit';
import { QUEUE_KINDS, type QueueKind } from './Queue';
import { VisitorsPanel } from './Visitors';

export type AdminOverviewData = {
  members: number; members_week: number; speakers: number; speakers_claimed: number; gems_published: number; gems_total: number;
  orgs: number; masjids: number; given_cents: number; gifts: number; tvs: number;
  queues: Record<QueueKind, number>; oldest: Record<QueueKind, string | null>;
  activity: { kind: string; text: string; at: string }[];
};

export function useAdminOverview() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc('admin_overview');
    if (e) setError(e.message); else { setData(d as AdminOverviewData); setError(null); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

const ACT_ICON: Record<string, SiqaIconName> = {
  member: 'person-add-outline', gift: 'heart-outline', org: 'business-outline', speaker: 'mic-outline', event: 'sparkles-outline', tv: 'tv-outline',
};
const n = (x: number) => x.toLocaleString('en-US');
const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export function AdminOverview({ wide, go }: { wide: boolean; go: (page: string, filter?: string) => void }) {
  const { c } = useDS();
  const { data, error } = useAdminOverview();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const waiting = data ? Object.values(data.queues).reduce((a, b) => a + b, 0) : 0;

  return (
    <AdminPage wide={wide} title={greet} sub={`${today} · ${data ? (waiting ? `${n(waiting)} things are waiting for review.` : 'Nothing is waiting for review.') : 'Loading…'}`}
      right={<Button label="Open review queue" size="md" onPress={() => go('queue')} />}>
      {error ? <Text style={[type.callout, { color: c.danger }]}>{error}</Text> : null}
      {data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }} accessibilityLabel="Siqa at a glance">
            <Kpi label="Members" value={n(data.members)} sub={`+${n(data.members_week)} this week`} icon="people-outline" />
            <Kpi label="Speakers" value={n(data.speakers)} sub={`${n(data.speakers_claimed)} claimed their profile`} icon="mic-outline" />
            <Kpi label="Gems published" value={n(data.gems_published)} sub={`of ${n(data.gems_total)} imported`} icon="diamond-outline" />
            <Kpi label="Organizations" value={n(data.orgs)} sub={`${n(data.orgs - data.masjids)} nonprofits · ${n(data.masjids)} masjid${data.masjids === 1 ? '' : 's'}`} icon="business-outline" />
            <Kpi label="Given through Siqa" value={usd(data.given_cents)} sub={`${n(data.gifts)} gift${data.gifts === 1 ? '' : 's'}`} icon="heart-outline" gold />
            <Kpi label="Masjid TVs" value={n(data.tvs)} sub="Linked screens" icon="tv-outline" />
          </View>

          <VisitorsPanel wide={wide} />

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
            <Panel title="Needs your review" action="See all" onAction={() => go('queue')} flush style={{ flex: 1.4, alignSelf: 'stretch' }}>
              {QUEUE_KINDS.map((k) => {
                const count = data.queues[k.key] ?? 0;
                return (
                  <Pressable key={k.key} onPress={() => go('queue', k.key)} accessibilityRole="button" accessibilityLabel={`${k.label}: ${count} waiting`}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: pressed ? c.bgSunk : 'transparent' })}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={k.icon} size={17} color={c.ink} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.subhead, font(600), { color: c.ink }]}>{k.label}</Text>
                      <Text style={[type.micro, font(400), { color: c.ink2 }]}>{count ? `Oldest waiting ${since(data.oldest[k.key])}` : 'All clear'}</Text>
                    </View>
                    {count ? <Pill label={`${n(count)} waiting`} tone={k.key === 'report' || k.key === 'claim' || k.key === 'tax' ? 'gold' : 'soft'} /> : <Pill label="0" tone="seed" />}
                    <Icon name="chevron-forward" size={16} color={c.ink3} />
                  </Pressable>
                );
              })}
            </Panel>
            <Panel title="Recent activity" flush style={{ flex: 1, alignSelf: 'stretch' }}>
              {data.activity.length === 0 ? <Text style={[type.callout, { color: c.ink2, padding: 20 }]}>Nothing yet.</Text> : null}
              {data.activity.map((a, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: a.kind === 'gift' ? c.goldTint : a.kind === 'org' ? c.seedTint : c.surfaceSoft }}>
                    <Icon name={ACT_ICON[a.kind] ?? 'ellipse-outline'} size={15} color={a.kind === 'gift' ? c.goldInk : a.kind === 'org' ? c.seed : c.ink} />
                  </View>
                  <Text style={[type.subhead, font(400), { color: c.ink, flex: 1 }]}>{a.text}</Text>
                  <Text style={[type.micro, font(400), { color: c.ink3 }]}>{since(a.at)}</Text>
                </View>
              ))}
            </Panel>
          </View>
        </>
      ) : null}
    </AdminPage>
  );
}
