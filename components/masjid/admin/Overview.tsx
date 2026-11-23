import { useMemo } from 'react';
import { MasjidWatermarkCard } from './MasjidWatermark';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { font, space, type, useDS } from '../../../lib/ds';
import { Button } from '../../ui';
import { Card, CardTitle, Dot, Empty, PageHeader, Tag, screenOnline, ago, type SectionProps } from './kit';
import { useMasjidEvents, useMasjidLive, useMasjidSettings, useScreens, useSeeds } from './useMasjidData';
import { EVENT_KIND_LABEL, dayKeyIn, fmtDateLong, fmtHijri, fmtIn, fmtTime, masjidDay, money, occurrences } from '../../../lib/masjid';
import { useTick } from '../../../lib/screenDevice';

export function Overview({ masjid, go, wide }: SectionProps) {
  const { c } = useDS();
  const now = useTick(30000);
  const { settings } = useMasjidSettings(masjid.id);
  const { events } = useMasjidEvents(masjid.id);
  const { screens } = useScreens(masjid.id);
  const { seeds } = useSeeds(masjid.id);
  const live = useMasjidLive(masjid.id);

  const tz = settings?.timezone ?? 'America/Chicago';
  const today = useMemo(() => {
    if (!settings) return [];
    const key = dayKeyIn(now, tz);
    const day = masjidDay(settings, key);
    const rows: { at: Date; label: string; tag: string; tone: 'soft' | 'gold' | 'seed' }[] = [];
    day?.rows.forEach((r) => rows.push({ at: r.iqamah, label: `${r.name} iqamah`, tag: 'Salah', tone: 'soft' }));
    occurrences(events ?? [], key, 1, tz).forEach((o) => rows.push({
      at: o.start, label: [o.event.title, o.event.teacher].filter(Boolean).join(' · '),
      tag: EVENT_KIND_LABEL[o.event.kind] + (o.event.fundraiser_id ? ' · Seed' : ''), tone: o.event.fundraiser_id ? 'seed' : 'gold',
    }));
    return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [settings, events, now, tz]);

  const next = today.find((r) => r.at > now);
  const needsLocation = settings && (settings.lat == null || settings.lon == null);

  return (
    <>
      <PageHeader
        title="Overview"
        sub={`${fmtDateLong(now, tz)}${settings ? ` · ${fmtHijri(now, tz, settings.hijri_offset)}` : ''}`}
        right={<>
          <Button label="New announcement" variant="secondary" size="md" onPress={() => go('announcements')} />
          <Button label="Add to schedule" variant="secondary" size="md" onPress={() => go('schedule')} />
        </>}
      />

      <MasjidWatermarkCard orgId={masjid.id} canManage={['owner', 'admin', 'siqa'].includes(masjid.my_role)} nudge />

      {needsLocation ? (
        <Card style={{ backgroundColor: c.goldTint }}>
          <CardTitle>Set your masjid's location first</CardTitle>
          <Text style={[type.callout, { color: c.ink2 }]}>Prayer times are calculated from your address. Until it's set, screens can't show salah times.</Text>
          <Button label="Set prayer times" size="md" onPress={() => go('prayer')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[5], alignItems: 'flex-start' }}>
        <Card style={{ flex: wide ? 1.3 : undefined, alignSelf: 'stretch' }}>
          <CardTitle action="Open schedule" onAction={() => go('schedule')}>Today</CardTitle>
          {next ? (
            <View style={{ padding: space[4], borderRadius: 14, backgroundColor: c.goldTint, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.micro, { color: c.goldInk }]}>NEXT · IN {fmtIn(next.at.getTime() - now.getTime()).toUpperCase()}</Text>
                <Text style={[type.headline, { color: c.ink }]}>{next.label}</Text>
              </View>
              <Text style={[type.title1, { color: c.goldInk }]}>{fmtTime(next.at, tz)}</Text>
            </View>
          ) : null}
          {today.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>Nothing yet. Set your prayer times and add your weekly halaqas and classes.</Text> : null}
          {today.map((r, i) => {
            const past = r.at < now;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, borderBottomWidth: i === today.length - 1 ? 0 : 1, borderBottomColor: c.line, opacity: past ? 0.5 : 1 }}>
                <Text style={[type.subhead, font(700), { color: c.ink, width: 76 }]}>{fmtTime(r.at, tz)}</Text>
                <Text style={[type.callout, font(500), { color: c.ink, flex: 1 }]} numberOfLines={1}>{r.label}</Text>
                <Tag label={r.tag} tone={r.tone} />
              </View>
            );
          })}
        </Card>

        <View style={{ flex: wide ? 1 : undefined, gap: space[5], alignSelf: 'stretch' }}>
          <Card>
            <CardTitle action="Manage" onAction={() => go('screens')}>Screens</CardTitle>
            {screens && screens.length === 0 ? (
              <Text style={[type.callout, { color: c.ink2 }]}>No TVs yet. Open siqa.us/screen on the TV (or plug in a Siqa box) and add it with the code it shows.</Text>
            ) : null}
            {(screens ?? []).map((s, i) => {
              const on = screenOnline(s.last_seen_at);
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 8, borderBottomWidth: i === (screens?.length ?? 0) - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <Dot color={on ? c.seed : c.danger} />
                  <Text style={[type.callout, font(500), { color: c.ink, flex: 1 }]} numberOfLines={1}>{s.name || 'Screen'}</Text>
                  <Text style={[type.caption, { color: on ? c.ink2 : c.danger }]}>{on ? 'Online' : `Offline · ${ago(s.last_seen_at)}`}</Text>
                </View>
              );
            })}
          </Card>

          <Card>
            <CardTitle>Live khutbah</CardTitle>
            {live ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Tag label="LIVE NOW" tone="danger" /><Text style={[type.callout, font(600), { color: c.ink, flex: 1 }]} numberOfLines={1}>{live.title}</Text></View>
                <Text style={[type.caption, { color: c.ink2 }]}>{live.speaker_name ? `${live.speaker_name} · ` : ''}Your screens are showing it.</Text>
                <Button label="Watch" size="sm" variant="secondary" onPress={() => router.push(`/live/${live.watch_token}` as any)} style={{ alignSelf: 'flex-start' }} />
              </>
            ) : (
              <Text style={[type.callout, { color: c.ink2 }]}>Not live. When your khutbah camera goes live, every screen switches to it on its own and switches back when it ends.</Text>
            )}
          </Card>
        </View>
      </View>

      <Card>
        <CardTitle action="New Seed" onAction={() => router.push({ pathname: '/seed-create', params: { orgId: masjid.id } } as any)}>Seeds</CardTitle>
        {seeds && seeds.length === 0 ? <Empty icon="leaf-outline" title="No Seeds yet" sub="Start a Seed for a project, then attach it to a khutbah or halaqa so its QR code shows on your screens." /> : null}
        {(seeds ?? []).slice(0, 4).map((s, i, arr) => {
          const pct = s.goal_amount ? Math.min(100, Math.round(((s.raised_amount ?? 0) / s.goal_amount) * 100)) : 0;
          return (
            <View key={s.id} style={{ flexDirection: wide ? 'row' : 'column', gap: space[3], alignItems: wide ? 'center' : 'stretch', paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <Text style={[type.callout, font(600), { color: c.ink, flex: 1 }]} numberOfLines={1}>{s.title}</Text>
              <View style={{ width: wide ? 220 : '100%', height: 8, borderRadius: 999, backgroundColor: c.surfaceStrong, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.seed }} />
              </View>
              <Text style={[type.caption, { color: c.ink2, width: wide ? 150 : undefined, textAlign: wide ? 'right' : 'left' }]}>{money(s.raised_amount)} of {money(s.goal_amount)}</Text>
              {settings?.screen_seed_id === s.id ? <Tag label="On screens" tone="gold" /> : null}
            </View>
          );
        })}
      </Card>
    </>
  );
}
