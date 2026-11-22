// siqa.us/e/<slug>/give — the QR on the big screen and on volunteer phones opens this. ?a=<cents> pre-fills, ?t=<table>.
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { type, useDS } from '../../../lib/ds';
import { GuestPage } from '../../../components/events/guest/GuestKit';
import { GivePanel, useLivePublic } from '../../../components/events/guest/GivePanel';

export default function GivePage() {
  const { slug, a, t } = useLocalSearchParams<{ slug: string; a?: string; t?: string }>();
  const { c } = useDS();
  const live = useLivePublic(slug ? String(slug) : undefined);
  if (live === undefined) return <GuestPage><Text style={[type.body, { color: c.ink2 }]}>Loading…</Text></GuestPage>;
  if (live === null) return <GuestPage><Text style={[type.title2, { color: c.ink }]}>This event isn't available.</Text></GuestPage>;
  const pre = a ? parseInt(String(a), 10) : NaN;
  return (
    <GuestPage title={`Give · ${live.title}`} max={560}>
      <View style={{ gap: 4 }}>
        <Text style={[type.subhead, { color: c.ink2 }]}>{live.org_name}</Text>
        <Text style={[type.title1, { color: c.ink }]}>{live.title}</Text>
      </View>
      <GivePanel live={live} initialCents={Number.isFinite(pre) && pre >= 100 ? pre : null} table={t ? String(t) : null} />
    </GuestPage>
  );
}
