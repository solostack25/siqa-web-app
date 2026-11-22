// siqa.us/t/<token> — a buyer's tickets: one QR per guest for check-in, plus the address, calendar and online seat link.
import { useEffect, useState } from 'react';
import { View, Text, Platform, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { font, radius, space, type, useDS } from '../../lib/ds';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui';
import { QRCode } from '../../components/masjid/QRCode';
import { GuestPage, TestModeNote } from '../../components/events/guest/GuestKit';
import { usd, whenText, timeText } from '../../lib/events';

type Data = {
  order: { id: string; status: string; buyer_name: string | null; total_cents: number; gift_cents: number; test_mode: boolean; paid_at: string | null };
  event: { slug: string; title: string; starts_at: string | null; doors_at: string | null; venue: string | null; address: string | null; online: boolean; org_name: string | null };
  attendees: { name: string | null; code: string; kind: string; table_label: string | null; diet: string | null; ticket: string | null; checked_in: boolean }[];
};

export default function TicketPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { c, shadow } = useDS();
  const [d, setD] = useState<Data | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    let tries = 0;
    const load = async () => {
      const { data } = await supabase.rpc('event_order_public', { p_token: String(token) });
      if (!alive) return;
      setD((data as Data) ?? null);
      // Just paid: the tickets appear once the payment is confirmed.
      if ((data as Data)?.order.status === 'pending' && tries++ < 20) setTimeout(load, 3000);
    };
    load();
    return () => { alive = false; };
  }, [token]);

  if (d === undefined) return <GuestPage><Text style={[type.body, { color: c.ink2 }]}>Loading your tickets…</Text></GuestPage>;
  if (d === null) return <GuestPage><Text style={[type.title2, { color: c.ink }]}>We couldn't find these tickets.</Text><Text style={[type.body, { color: c.ink2 }]}>Check the link and try again, or contact the organizers.</Text></GuestPage>;

  const e = d.event;
  const open = (url: string) => (Platform.OS === 'web' ? window.open(url, '_blank') : Linking.openURL(url));
  const calendar = () => {
    if (!e.starts_at || Platform.OS !== 'web') return;
    const s = new Date(e.starts_at);
    const end = new Date(s.getTime() + 3 * 3600_000);
    const f = (x: Date) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Siqa//Events//EN', 'BEGIN:VEVENT', `UID:${d.order.id}@siqa.us`, `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(s)}`, `DTEND:${f(end)}`, `SUMMARY:${e.title}`, `LOCATION:${[e.venue, e.address].filter(Boolean).join(', ')}`,
      `URL:${window.location.href}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'event.ics';
    a.click();
  };
  const pending = d.order.status === 'pending';
  const hasOnline = d.attendees.some((a) => a.kind === 'online');

  return (
    <GuestPage title={`Tickets · ${e.title}`} max={560}>
      <View style={{ gap: 4 }}>
        <Text style={[type.subhead, { color: c.ink2 }]}>{e.org_name}</Text>
        <Text style={[type.title1, { color: c.ink }]}>{pending ? 'Confirming your payment…' : `You're going${d.order.buyer_name ? `, ${d.order.buyer_name.split(' ')[0]}` : ''}!`}</Text>
        <Text style={[type.body, { color: c.ink }]}>{e.title}</Text>
        <Text style={[type.callout, { color: c.ink2 }]}>{whenText(e.starts_at)}{e.doors_at ? ` · doors ${timeText(e.doors_at)}` : ''}</Text>
        {e.venue || e.address ? <Text style={[type.callout, { color: c.ink2 }]}>{[e.venue, e.address].filter(Boolean).join(', ')}</Text> : null}
      </View>
      {d.order.test_mode ? <TestModeNote /> : null}
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        {Platform.OS === 'web' && e.starts_at ? <Button label="Add to calendar" icon="calendar-outline" size="md" variant="secondary" onPress={calendar} /> : null}
        {e.venue || e.address ? <Button label="Directions" icon="navigate-outline" size="md" variant="secondary" onPress={() => open(`https://maps.google.com/?q=${encodeURIComponent([e.venue, e.address].filter(Boolean).join(', '))}`)} /> : null}
        {hasOnline ? <Button label="Your online seat" icon="laptop-outline" size="md" onPress={() => router.push(`/e/${e.slug}/live` as any)} /> : null}
      </View>
      {!pending ? <Text style={[type.callout, { color: c.ink2 }]}>Show a code at the door — on your phone or printed. Each guest has their own. Bookmark this page or take a screenshot — it's how you get back to your tickets.</Text> : null}
      {d.attendees.map((a, i) => (
        <View key={a.code} style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[5], gap: space[3], alignItems: 'center' }, shadow('card')]}>
          <Text style={[type.micro, { color: c.ink2 }]}>GUEST {i + 1} OF {d.attendees.length}</Text>
          <Text style={[type.title2, { color: c.ink, textAlign: 'center' }]}>{a.name || 'Guest'}</Text>
          <Text style={[type.callout, { color: c.ink2 }]}>{[a.ticket, a.table_label ? `Table ${a.table_label}` : null].filter(Boolean).join(' · ')}</Text>
          {a.kind === 'online' ? (
            <Button label="Join online" icon="laptop-outline" onPress={() => router.push(`/e/${e.slug}/live` as any)} />
          ) : (
            <>
              <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: radius.lg, opacity: a.checked_in ? 0.4 : 1 }}>
                <QRCode value={a.code} size={220} label={`Ticket code ${a.code}`} />
              </View>
              <Text style={[font(700), { fontSize: 20, letterSpacing: 4, color: c.ink }]}>{a.code}</Text>
              {a.checked_in ? <Text style={[type.callout, font(700), { color: c.seed }]}>✓ Checked in</Text> : null}
            </>
          )}
        </View>
      ))}
      {!pending ? (
        <Text style={[type.caption, { color: c.ink3, textAlign: 'center' }]}>
          Paid {usd(d.order.total_cents, true)}{d.order.gift_cents ? ` including a ${usd(d.order.gift_cents)} gift` : ''}.
        </Text>
      ) : null}
    </GuestPage>
  );
}
