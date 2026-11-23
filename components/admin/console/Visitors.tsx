// Siqa Admin → Overview → Visitors: people visiting siqa.us (Vercel Web Analytics, read by /api/visitors).
import { useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { Panel, Pill } from './kit';

type Data = {
  connected: boolean; error?: string;
  today?: { visitors: number; pageviews: number }; week?: { visitors: number; pageviews: number }; month?: { visitors: number; pageviews: number };
  daily?: { day: string; visitors: number; pageviews: number }[];
  pages?: { path: string; visitors: number }[]; referrers?: { host: string; visitors: number }[]; countries?: { country: string; visitors: number }[];
};

const API = Platform.OS === 'web' ? '/api/visitors' : 'https://www.siqa.us/api/visitors';
const n = (x: number | undefined) => (x ?? 0).toLocaleString('en-US');
const COUNTRY: Record<string, string> = { US: 'United States', CA: 'Canada', GB: 'United Kingdom', AE: 'UAE', SA: 'Saudi Arabia', PK: 'Pakistan', IN: 'India', EG: 'Egypt', AU: 'Australia', MY: 'Malaysia' };

export function VisitorsPanel({ wide }: { wide: boolean }) {
  const { c } = useDS();
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      try {
        const r = await fetch(API, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
        const j = await r.json();
        setD(r.ok ? j : { connected: true, error: j.error || 'Could not load visitors' });
      } catch { setD({ connected: true, error: 'Could not load visitors' }); }
    })();
  }, []);

  if (!d) return <Panel title="Visitors"><Text style={[type.callout, { color: c.ink2 }]}>Loading…</Text></Panel>;
  if (!d.connected) {
    return (
      <Panel title="Visitors">
        <Text style={[type.subhead, font(400), { color: c.ink2 }]}>
          siqa.us is counting visitors, but the dashboard can't read them yet. In Vercel, create an access token
          (Account Settings → Tokens, scope: SoloStack) and add it to the siqa-web-app project as the environment variable
          VERCEL_ANALYTICS_TOKEN, then redeploy.
        </Text>
      </Panel>
    );
  }
  if (d.error) return <Panel title="Visitors"><Text style={[type.callout, { color: c.danger }]}>{d.error}</Text></Panel>;

  const days = d.daily ?? [];
  const max = Math.max(1, ...days.map((x) => x.visitors));
  const list = (title: string, rows: { label: string; v: number }[]) => (
    <View style={{ flex: 1, minWidth: 200, gap: 6 }}>
      <Text style={[type.micro, { color: c.ink2 }]}>{title}</Text>
      {rows.length === 0 ? <Text style={[type.caption, font(400), { color: c.ink3 }]}>No data yet</Text> : null}
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={[type.caption, font(500), { color: c.ink, flex: 1 }]} numberOfLines={1}>{r.label}</Text>
          <Text style={[type.caption, font(600), { color: c.ink2 }]}>{n(r.v)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Panel title="Visitors">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[5], marginBottom: space[4] }}>
        {[['Today', d.today], ['Last 7 days', d.week], ['Last 30 days', d.month]].map(([label, v]: any) => (
          <View key={label} style={{ gap: 2, minWidth: 120 }}>
            <Text style={[type.micro, { color: c.ink2 }]}>{label}</Text>
            <Text style={[{ fontSize: 26, lineHeight: 30, letterSpacing: -0.6 }, font(800, 'display'), { color: c.ink }]}>{n(v?.visitors)}</Text>
            <Text style={[type.micro, font(400), { color: c.ink2 }]}>{n(v?.pageviews)} page views</Text>
          </View>
        ))}
        <View style={{ flex: 1 }} />
        <Pill label="Counting since Nov 22" />
      </View>
      {/* Visitors per day, last 30 days */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 90, marginBottom: 6 }} accessibilityLabel="Visitors per day for the last 30 days">
        {days.map((x) => (
          <View key={x.day} style={{ flex: 1, height: `${Math.max(2, (x.visitors / max) * 100)}%`, borderRadius: 3, backgroundColor: x.visitors ? c.gold : c.surfaceStrong }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space[4] }}>
        <Text style={[type.micro, font(400), { color: c.ink3 }]}>{days[0]?.day ?? ''}</Text>
        <Text style={[type.micro, font(400), { color: c.ink3 }]}>Today</Text>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[5], paddingTop: space[3], borderTopWidth: 1, borderTopColor: c.line }}>
        {list('TOP PAGES · 7 DAYS', (d.pages ?? []).map((p) => ({ label: p.path || '/', v: p.visitors })))}
        {list('WHERE THEY CAME FROM', (d.referrers ?? []).map((r) => ({ label: r.host, v: r.visitors })))}
        {list('COUNTRIES', (d.countries ?? []).map((r) => ({ label: COUNTRY[r.country] ?? r.country, v: r.visitors })))}
      </View>
    </Panel>
  );
}
