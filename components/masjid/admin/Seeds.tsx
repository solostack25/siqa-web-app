import { View, Text, Image, Pressable } from 'react-native';
import { router } from 'expo-router';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button } from '../../ui';
import { Card, CardTitle, Empty, PageHeader, Tag, type SectionProps } from './kit';
import { useMasjidEvents, useMasjidSettings, useSeeds } from './useMasjidData';
import { EVENT_KIND_LABEL, money } from '../../../lib/masjid';
import { QRCode } from '../QRCode';
import { showToast } from '../../Toast';

export function SeedsSection({ masjid, go, wide }: SectionProps) {
  const { c } = useDS();
  const { seeds } = useSeeds(masjid.id);
  const { events } = useMasjidEvents(masjid.id);
  const { settings, save } = useMasjidSettings(masjid.id);

  const setScreenSeed = async (id: string | null) => {
    const err = await save({ screen_seed_id: id });
    showToast(err ? err.message : id ? 'This Seed\'s QR code now shows on your screens.' : 'Screens show your newest Seed.');
  };

  return (
    <>
      <PageHeader title="Seeds" sub="Fundraisers for your masjid. Attach one to a khutbah or halaqa from the schedule."
        right={<Button label="Start a Seed" icon="add" size="md" onPress={() => router.push({ pathname: '/seed-create', params: { orgId: masjid.id } } as any)} />} />
      {seeds && seeds.length === 0 ? (
        <Empty icon="leaf-outline" title="No Seeds yet" sub="A Seed has a goal, a story and a donate page. Its QR code goes on your screens so people can give from their phones." />
      ) : null}
      <View style={{ gap: space[4] }}>
        {(seeds ?? []).map((s) => {
          const pct = s.goal_amount ? Math.min(100, Math.round(((s.raised_amount ?? 0) / s.goal_amount) * 100)) : 0;
          const attached = (events ?? []).filter((e) => e.fundraiser_id === s.id);
          const onScreens = settings?.screen_seed_id === s.id;
          return (
            <Card key={s.id}>
              <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[4] }}>
                {s.cover_image_url ? <Image source={{ uri: s.cover_image_url }} style={{ width: wide ? 180 : '100%', height: 120, borderRadius: radius.lg, backgroundColor: c.bgSunk }} /> : null}
                <View style={{ flex: 1, gap: space[2] }}>
                  <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                    <Tag label={s.status === 'active' ? 'Live' : s.status === 'draft' ? 'Draft' : s.status} tone={s.status === 'active' ? 'seed' : 'soft'} />
                    {onScreens ? <Tag label="QR on screens" tone="gold" /> : null}
                  </View>
                  <Text style={[type.headline, { color: c.ink }]}>{s.title}</Text>
                  <View style={{ height: 8, borderRadius: 999, backgroundColor: c.surfaceStrong, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.seed }} />
                  </View>
                  <Text style={[type.caption, { color: c.ink2 }]}><Text style={{ color: c.seed, fontWeight: '700' }}>{money(s.raised_amount)}</Text> of {money(s.goal_amount)} · {s.donor_count ?? 0} donors</Text>
                  <Text style={[type.caption, { color: c.ink2 }]}>
                    {attached.length ? `Attached to ${attached.map((e) => `${e.title} (${EVENT_KIND_LABEL[e.kind]})`).join(', ')}` : 'Not attached to anything yet.'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap', marginTop: space[1] }}>
                    <Button label="View" size="sm" variant="secondary" onPress={() => router.push(`/seed/${s.id}` as any)} />
                    {s.status === 'active' ? (onScreens
                      ? <Button label="Stop showing on screens" size="sm" variant="soft" onPress={() => setScreenSeed(null)} />
                      : <Button label="Show QR on screens" size="sm" variant="soft" onPress={() => setScreenSeed(s.id)} />) : null}
                    <Button label="Attach in schedule" size="sm" variant="ghost" onPress={() => go('schedule')} />
                  </View>
                </View>
                {s.status === 'active' ? (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <View style={{ padding: 8, backgroundColor: '#fff', borderRadius: 12 }}><QRCode value={`https://www.siqa.us/seed/${s.id}`} size={104} label={`QR code for ${s.title}`} /></View>
                    <Text style={[type.micro, { color: c.ink3 }]}>Scan to give</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>
      <Card style={{ backgroundColor: c.bgSunk }}>
        <CardTitle>How Seeds reach people</CardTitle>
        <Text style={[type.callout, { color: c.ink2 }]}>On screens: the QR code sits next to your iqamah times. During a live khutbah or halaqa: viewers at home see a Donate button for the attached Seed. On your Siqa page: active Seeds are listed for followers.</Text>
      </Card>
    </>
  );
}
