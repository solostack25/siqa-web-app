// Siqa Admin → Organizations: every nonprofit and masjid with its listing, 501(c)(3) and payments status.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { Button, TextField } from '../../ui';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import { openOnSiqa } from '../../dashboard/links';
import { router } from 'expo-router';
import { AdminPage, FilterTab, Panel, Pill } from './kit';

type Org = {
  id: string; org_name: string; slug: string | null; org_kind: string | null; city: string | null; state: string | null; logo_url: string | null;
  is_verified: boolean | null; approval_status: string | null; tax_exempt_status: string | null; stripe_onboarded: boolean | null; created_at: string;
};
type Filter = 'all' | 'nonprofit' | 'masjid' | 'tax' | 'unlisted';

export function AdminOrgs({ wide }: { wide: boolean }) {
  const { c } = useDS();
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('organizations')
      .select('id, org_name, slug, org_kind, city, state, logo_url, is_verified, approval_status, tax_exempt_status, stripe_onboarded, created_at')
      .order('org_name');
    if (error) showToast(error.message);
    setOrgs((data as Org[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const listed = (o: Org) => !!o.is_verified && o.approval_status === 'approved';
  const all = orgs ?? [];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((o) =>
      (f === 'all' || (f === 'masjid' ? o.org_kind === 'masjid' : f === 'nonprofit' ? o.org_kind !== 'masjid' : f === 'tax' ? o.tax_exempt_status !== 'verified' : !listed(o)))
      && (!s || [o.org_name, o.city, o.state, o.slug].some((x) => x?.toLowerCase().includes(s))));
  }, [orgs, q, f]);

  const setListed = async (o: Org, on: boolean) => {
    if (!on && !(await confirmDialog(`Take ${o.org_name} off the directory?`, 'Their page still works by link. You can list them again any time.', 'Unlist'))) return;
    const { error } = await supabase.from('organizations').update(on ? { is_verified: true, approval_status: 'approved' } : { approval_status: 'pending' }).eq('id', o.id);
    if (error) { showToast(error.message); return; }
    showToast(on ? `${o.org_name} is listed` : `${o.org_name} is off the directory`);
    load();
  };

  const countOf = (fn: (o: Org) => boolean) => all.filter(fn).length;
  const cols = wide ? [2.4, 1, 1.4, 1, 1.1, 1.1, 0.8, 1.1] : null;

  return (
    <AdminPage wide={wide} title="Organizations" sub="Nonprofits and masjids on Siqa: listing, 501(c)(3) proof and payments at a glance."
      right={<Button label="Add a nonprofit" icon="add" size="md" onPress={() => openOnSiqa('/org-register')} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Summary label="Listed" value={String(countOf(listed))} sub={`${countOf((o) => o.org_kind !== 'masjid')} nonprofits · ${countOf((o) => o.org_kind === 'masjid')} masjids`} />
        <Summary label="Waiting for review" value={String(countOf((o) => !listed(o)))} sub="Approve in the review queue" />
        <Summary label="501(c)(3) confirmed" value={`${countOf((o) => o.tax_exempt_status === 'verified')} of ${all.length}`} sub="Donations stay off until confirmed" />
        <Summary label="Payments connected" value={`${countOf((o) => !!o.stripe_onboarded)} of ${all.length}`} sub="Stripe Connect" />
      </View>
      <Panel flush>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap', padding: 14, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <TextField value={q} onChangeText={setQ} placeholder="Search by name, city or link" containerStyle={{ flex: 1, minWidth: 220, maxWidth: 360 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            <FilterTab label="All" count={all.length} on={f === 'all'} onPress={() => setF('all')} />
            <FilterTab label="Nonprofits" on={f === 'nonprofit'} onPress={() => setF('nonprofit')} />
            <FilterTab label="Masjids" on={f === 'masjid'} onPress={() => setF('masjid')} />
            <FilterTab label="Needs 501(c)(3)" on={f === 'tax'} onPress={() => setF('tax')} />
            <FilterTab label="Not listed" on={f === 'unlisted'} onPress={() => setF('unlisted')} />
          </ScrollView>
        </View>
        <ScrollView horizontal={wide ? false : true} contentContainerStyle={{ minWidth: wide ? undefined : 900, flexGrow: 1 }}>
          <View style={{ flex: 1 }}>
            <Row c={c} cols={cols} head cells={['Organization', 'Type', 'Location', 'Directory', '501(c)(3)', 'Payments', 'Joined', '']} />
            {shown.map((o) => (
              <Row key={o.id} c={c} cols={cols} onPress={() => openOnSiqa(`/org/${o.slug || o.id}`)} cells={[
                <View key="n" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {o.logo_url ? <Image source={{ uri: o.logo_url }} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.surfaceSoft }} />
                    : <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: o.org_kind === 'masjid' ? c.night : c.seedTint }}>
                        <Text style={[type.caption, font(700), { color: o.org_kind === 'masjid' ? c.brandGold : c.seed }]}>{o.org_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
                      </View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={1}>{o.org_name}</Text>
                    <Text style={[type.micro, font(400), { color: c.ink2 }]} numberOfLines={1}>siqa.us/org/{o.slug || o.id.slice(0, 8)}</Text>
                  </View>
                </View>,
                o.org_kind === 'masjid' ? 'Masjid' : o.org_kind === 'content' ? 'Publisher' : 'Nonprofit',
                [o.city, o.state].filter(Boolean).join(', ') || '—',
                <Pill key="d" label={listed(o) ? 'Listed' : 'Not listed'} tone={listed(o) ? 'seed' : 'gold'} dot />,
                <Pill key="t" label={o.tax_exempt_status === 'verified' ? 'Confirmed' : o.tax_exempt_status === 'pending' ? 'To check' : o.tax_exempt_status === 'rejected' ? 'Not confirmed' : 'No proof yet'}
                  tone={o.tax_exempt_status === 'verified' ? 'seed' : o.tax_exempt_status === 'pending' ? 'gold' : o.tax_exempt_status === 'rejected' ? 'danger' : 'soft'} />,
                <Pill key="p" label={o.stripe_onboarded ? 'Connected' : 'Not connected'} tone={o.stripe_onboarded ? 'seed' : 'soft'} />,
                new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(o.created_at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }),
                <View key="a" style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
                  {o.org_kind === 'masjid'
                    ? <Button label="Console" size="sm" variant="soft" onPress={() => router.setParams({ space: `masjid:${o.id}`, page: 'overview' } as any)} />
                    : null}
                  <Button label={listed(o) ? 'Unlist' : 'List'} size="sm" variant="secondary" onPress={() => setListed(o, !listed(o))} />
                </View>,
              ]} />
            ))}
            {orgs && shown.length === 0 ? <Text style={[type.callout, { color: c.ink2, padding: 20 }]}>No organizations match.</Text> : null}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 14 }}>
          <Text style={[type.caption, font(400), { color: c.ink2 }]}>{shown.length} of {all.length} organizations</Text>
          <Text style={[type.caption, font(400), { color: c.ink2 }]}>Click a row to open its page</Text>
        </View>
      </Panel>
    </AdminPage>
  );
}

function Summary({ label, value, sub }: { label: string; value: string; sub: string }) {
  const { c } = useDS();
  return (
    <View style={{ flexGrow: 1, flexBasis: 200, padding: 18, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 4 }}>
      <Text style={[type.caption, font(600), { color: c.ink2 }]}>{label}</Text>
      <Text style={[{ fontSize: 24, lineHeight: 30, letterSpacing: -0.5 }, font(800, 'display'), { color: c.ink }]}>{value}</Text>
      <Text style={[type.micro, font(400), { color: c.ink2 }]}>{sub}</Text>
    </View>
  );
}

function Row({ cells, cols, head, onPress, c }: { cells: React.ReactNode[]; cols: number[] | null; head?: boolean; onPress?: () => void; c: any }) {
  const widths = cols ?? [2.4, 1, 1.4, 1, 1.1, 1.1, 0.8, 1.1];
  const content = cells.map((cell, i) => (
    <View key={i} style={{ flex: widths[i], minWidth: 0, paddingHorizontal: 8 }}>
      {typeof cell === 'string' ? <Text style={[head ? type.micro : type.subhead, font(head ? 600 : 400), { color: head ? c.ink2 : i === 0 ? c.ink : c.ink2, textAlign: i === cells.length - 1 ? 'right' : 'left' }]} numberOfLines={1}>{cell}</Text> : cell}
    </View>
  ));
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 12, paddingVertical: head ? 10 : 12, borderBottomWidth: 1, borderBottomColor: c.line };
  if (head || !onPress) return <View style={style}>{content}</View>;
  return <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [style, { backgroundColor: pressed ? c.bgSunk : 'transparent' }]}>{content}</Pressable>;
}
