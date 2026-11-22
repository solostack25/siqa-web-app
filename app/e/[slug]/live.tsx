// siqa.us/e/<slug>/live — the online seat: watch the event and give during the appeal, from home.
import React from 'react';
import { View, Text, Platform, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { STUDIO_URL } from '../../../lib/studioLink';
import { usd } from '../../../lib/events';
import { GuestPage } from '../../../components/events/guest/GuestKit';
import { GivePanel, useLivePublic } from '../../../components/events/guest/GivePanel';
import { Progress } from '../../../components/events/fields';

export default function OnlineSeat() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c } = useDS();
  const { width } = useWindowDimensions();
  const live = useLivePublic(slug ? String(slug) : undefined, 5000);
  if (live === undefined) return <GuestPage><Text style={[type.body, { color: c.ink2 }]}>Loading…</Text></GuestPage>;
  if (live === null) return <GuestPage><Text style={[type.title2, { color: c.ink }]}>This event isn't available.</Text></GuestPage>;
  const wide = width > 980;
  const t = live.totals;

  const player = live.online_watch_token && Platform.OS === 'web'
    ? React.createElement('iframe', {
        src: `${STUDIO_URL}/watch/${live.online_watch_token}?embed=1`, title: live.title,
        allow: 'autoplay; fullscreen; picture-in-picture', style: { width: '100%', height: '100%', border: 0, background: '#0a0f1c' },
      })
    : null;

  return (
    <GuestPage title={live.title} max={1240}>
      <View style={{ gap: 4 }}>
        <Text style={[type.subhead, { color: c.ink2 }]}>{live.org_name} · Online seat</Text>
        <Text style={[type.title1, { color: c.ink }]}>{live.title}</Text>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[5], alignItems: 'flex-start' }}>
        <View style={{ flex: 1.6, width: '100%', gap: space[3] }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0a0f1c', alignItems: 'center', justifyContent: 'center' }}>
            {player ?? (
              <Text style={[type.body, { color: '#9facc4', textAlign: 'center', padding: space[6] }]}>
                {live.status === 'ended' ? 'The event has ended. Thank you for joining.' : 'The stream starts when the event begins. Keep this page open.'}
              </Text>
            )}
          </View>
          {live.current ? (
            <Text style={[type.headline, { color: c.ink }]}>Now: {live.current.title}{live.current.speaker ? <Text style={[font(500), { color: c.ink2 }]}> · {live.current.speaker}</Text> : null}</Text>
          ) : null}
          {t.goal_cents ? (
            <View style={{ gap: space[2] }}>
              <Text style={[type.title2, { color: c.ink }]}>{usd(t.raised_cents)} <Text style={[type.callout, { color: c.ink2 }]}>raised of {usd(t.goal_cents)}</Text></Text>
              <Progress value={t.raised_cents} max={t.goal_cents} height={10} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, width: '100%', padding: space[5], borderRadius: radius.xl, backgroundColor: c.surface, gap: space[3] }}>
          <Text style={[type.title2, { color: c.ink }]}>Give from home</Text>
          <GivePanel live={live} compact />
        </View>
      </View>
    </GuestPage>
  );
}
