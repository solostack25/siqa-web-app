// siqa.us/e/<slug> — an event's public page: what, when, where, the program, and ticket checkout.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Platform, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { Button, Stepper, TextField } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { eventPay, usd, whenText, timeText } from '../../../lib/events';
import { AmountChips, GuestPage, PayStep } from '../../../components/events/guest/GuestKit';

type Ticket = { id: string; name: string; description: string | null; price_cents: number; kind: 'in_person' | 'online'; seats: number; deductible_cents: number; remaining: number | null };
type Pub = {
  id: string; slug: string; title: string; kind: string; status: string; starts_at: string | null; doors_at: string | null; venue: string | null;
  address: string | null; about: string | null; cover_url: string | null; in_person: boolean; online: boolean; ask_names: boolean; ask_diet: boolean;
  checkout_gift: boolean; org: { id: string; name: string; logo_url: string | null }; tickets: Ticket[];
  program: { title: string; speaker: string | null; kind: string; minutes: number }[];
};
type Guest = { name: string; email: string; diet: string };

export default function EventPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c, shadow } = useDS();
  const [ev, setEv] = useState<Pub | null | undefined>(undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [guests, setGuests] = useState<Guest[]>([]);
  const [gift, setGift] = useState<number>(0);
  const [step, setStep] = useState<'pick' | 'details' | 'pay'>('pick');
  const [pay, setPay] = useState<{ secret: string; token: string; test: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    supabase.rpc('event_public', { p_slug: String(slug) }).then(({ data }) => setEv((data as Pub) ?? null));
  }, [slug]);

  const lines = useMemo(() => (ev?.tickets ?? []).filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ t, n: qty[t.id] })), [ev, qty]);
  const seats = lines.reduce((a, l) => a + l.n * l.t.seats, 0);
  const subtotal = lines.reduce((a, l) => a + l.n * l.t.price_cents, 0);
  const total = subtotal + gift;
  useEffect(() => { setGuests((g) => Array.from({ length: seats }, (_, i) => g[i] ?? { name: '', email: '', diet: '' })); }, [seats]);

  if (ev === undefined) return <GuestPage><Text style={[type.body, { color: c.ink2 }]}>Loading…</Text></GuestPage>;
  if (ev === null) return <GuestPage><Text style={[type.title2, { color: c.ink }]}>This event isn't available.</Text><Text style={[type.body, { color: c.ink2 }]}>It may not be published yet, or the link is wrong.</Text></GuestPage>;

  const onSale = ev.status === 'published' || ev.status === 'live';
  const checkout = async () => {
    if (!buyer.name.trim()) { setErr('Enter your name.'); return; }
    if (!/.+@.+\..+/.test(buyer.email)) { setErr('Enter your email.'); return; }
    setErr(null); setBusy(true);
    try {
      const g = guests.map((x, i) => (i === 0 ? { ...x, name: x.name || buyer.name, email: x.email || buyer.email } : x));
      const r = await eventPay({ action: 'create', kind: 'tickets', slug: ev.slug, items: lines.map((l) => ({ ticket_type_id: l.t.id, qty: l.n })), guests: g, buyer, gift_cents: gift });
      if (r.free && r.orderToken) { router.replace(`/t/${r.orderToken}` as any); return; }
      setPay({ secret: r.clientSecret!, token: r.orderToken!, test: !!r.testMode });
      setStep('pay');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const paid = async (pi: string) => {
    try { await eventPay({ action: 'confirm', payment_intent_id: pi }); } catch { /* the ticket page retries */ }
    router.replace(`/t/${pay!.token}` as any);
  };
  const maps = () => {
    const url = `https://maps.google.com/?q=${encodeURIComponent([ev.venue, ev.address].filter(Boolean).join(', '))}`;
    if (Platform.OS === 'web') window.open(url, '_blank'); else Linking.openURL(url);
  };

  return (
    <GuestPage title={ev.title}>
      {ev.cover_url ? <Image source={{ uri: ev.cover_url }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.xl, backgroundColor: c.bgSunk }} resizeMode="cover" /> : null}
      <View style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {ev.org.logo_url ? <Image source={{ uri: ev.org.logo_url }} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.surfaceSoft }} /> : null}
          <Text style={[type.subhead, font(600), { color: c.ink2 }]}>{ev.org.name}</Text>
        </View>
        <Text style={[type.display, { color: c.ink }]}>{ev.title}</Text>
        <Info icon="calendar-outline" text={whenText(ev.starts_at)} sub={ev.doors_at ? `Doors open ${timeText(ev.doors_at)}` : undefined} />
        {ev.in_person && (ev.venue || ev.address) ? <Info icon="location-outline" text={ev.venue ?? ev.address ?? ''} sub={ev.venue ? ev.address ?? undefined : undefined} onPress={maps} /> : null}
        {ev.online ? <Info icon="laptop-outline" text="You can also join online" /> : null}
      </View>

      {ev.status === 'live' ? (
        <View style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.goldTint, gap: space[3] }}>
          <Text style={[type.headline, { color: c.goldInk }]}>Happening now</Text>
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <Button label="Give now" variant="gold" size="md" onPress={() => router.push(`/e/${ev.slug}/give` as any)} />
          </View>
        </View>
      ) : null}

      {ev.about ? <Text style={[type.body, { color: c.ink, lineHeight: 25 }]}>{ev.about}</Text> : null}

      {/* Tickets */}
      <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[5], gap: space[4] }, shadow('card')]} nativeID="tickets">
        <Text style={[type.title2, { color: c.ink }]}>{step === 'pick' ? 'Tickets' : step === 'details' ? 'Your details' : 'Payment'}</Text>
        {!onSale ? <Text style={[type.body, { color: c.ink2 }]}>{ev.status === 'ended' ? 'This event has ended.' : 'Tickets aren\'t on sale.'}</Text> : null}

        {onSale && step === 'pick' ? (
          <>
            {ev.tickets.map((t) => {
              const sold = t.remaining === 0;
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, font(700), { color: c.ink }]}>{t.name}</Text>
                    <Text style={[type.caption, font(400), { color: c.ink2 }]}>
                      {t.price_cents ? usd(t.price_cents, true) : 'Free'}{t.seats > 1 ? ` · seats ${t.seats}` : ''}{t.kind === 'online' ? ' · online' : ''}
                      {t.remaining != null && t.remaining <= 20 && !sold ? ` · ${t.remaining} left` : ''}
                    </Text>
                    {t.description ? <Text style={[type.caption, font(400), { color: c.ink3 }]}>{t.description}</Text> : null}
                  </View>
                  {sold ? <Text style={[type.subhead, font(700), { color: c.ink3 }]}>Sold out</Text>
                    : <Stepper label={t.name} value={qty[t.id] ?? 0} onChange={(v) => setQty({ ...qty, [t.id]: v })} min={0} max={Math.min(20, t.remaining ?? 20)} />}
                </View>
              );
            })}
            {ev.checkout_gift && seats ? (
              <View style={{ gap: space[2] }}>
                <Text style={[type.body, font(600), { color: c.ink }]}>Add a gift? <Text style={[type.caption, { color: c.ink2 }]}>(optional)</Text></Text>
                <AmountChips amounts={[0, 2500, 5000, 10000, 25000]} value={gift} onPick={setGift} />
              </View>
            ) : null}
            <Button label={seats ? `Continue — ${usd(total, true)}` : 'Choose tickets'} disabled={!seats} onPress={() => setStep('details')} />
          </>
        ) : null}

        {onSale && step === 'details' ? (
          <>
            <TextField label="Your name" value={buyer.name} onChangeText={(v) => setBuyer({ ...buyer, name: v })} autoComplete="name" />
            <TextField label="Email" value={buyer.email} onChangeText={(v) => setBuyer({ ...buyer, email: v })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" help="For your receipt, and so the organizers can reach you." />
            <TextField label="Phone (optional)" value={buyer.phone} onChangeText={(v) => setBuyer({ ...buyer, phone: v })} keyboardType="phone-pad" autoComplete="tel" />
            {(ev.ask_names && seats > 1) || ev.ask_diet ? (
              <View style={{ gap: space[3] }}>
                <Text style={[type.headline, { color: c.ink }]}>Guests</Text>
                {guests.map((g, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                    {ev.ask_names ? <TextField label={i === 0 ? 'Guest 1 (you)' : `Guest ${i + 1}`} value={i === 0 && !g.name ? buyer.name : g.name} placeholder="Name"
                      onChangeText={(v) => setGuests(guests.map((x, k) => (k === i ? { ...x, name: v } : x)))} containerStyle={{ flex: 2, minWidth: 180 }} /> : null}
                    {ev.ask_diet ? <TextField label={ev.ask_names ? 'Dietary needs' : `Guest ${i + 1} dietary needs`} value={g.diet} placeholder="None"
                      onChangeText={(v) => setGuests(guests.map((x, k) => (k === i ? { ...x, diet: v } : x)))} containerStyle={{ flex: 1, minWidth: 140 }} /> : null}
                  </View>
                ))}
                {ev.ask_names ? <Text style={[type.caption, font(400), { color: c.ink3 }]}>Don't know everyone yet? Leave names empty — you can still check in with the QR codes.</Text> : null}
              </View>
            ) : null}
            <Summary lines={lines} gift={gift} total={total} />
            {err ? <Text style={[type.callout, { color: c.danger }]}>{err}</Text> : null}
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button label="Back" variant="secondary" onPress={() => setStep('pick')} />
              <Button label={total ? `Pay ${usd(total, true)}` : 'Get tickets'} onPress={checkout} loading={busy} grow />
            </View>
          </>
        ) : null}

        {onSale && step === 'pay' && pay ? (
          <>
            <Summary lines={lines} gift={gift} total={total} />
            <PayStep clientSecret={pay.secret} testMode={pay.test} label={`Pay ${usd(total, true)}`} onPaid={paid} onCancel={() => { setPay(null); setStep('details'); }} />
          </>
        ) : null}
      </View>

      {ev.program.length ? (
        <View style={{ gap: space[2] }}>
          <Text style={[type.title2, { color: c.ink }]}>Program</Text>
          {ev.program.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space[3], paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Text style={[type.body, font(600), { color: c.ink, flex: 1 }]}>{p.title}{p.speaker ? <Text style={{ color: c.ink2, ...font(400) }}> · {p.speaker}</Text> : null}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </GuestPage>
  );
}

function Info({ icon, text, sub, onPress }: { icon: any; text: string; sub?: string; onPress?: () => void }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <Icon name={icon} size={20} color={c.ink2} />
      <View style={{ flex: 1 }}>
        <Text onPress={onPress} style={[type.body, font(600), { color: c.ink, textDecorationLine: onPress ? 'underline' : 'none' }]}>{text}</Text>
        {sub ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Summary({ lines, gift, total }: { lines: { t: Ticket; n: number }[]; gift: number; total: number }) {
  const { c } = useDS();
  const row = (a: string, b: string, bold = false) => (
    <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type.callout, bold ? font(700) : null, { color: c.ink }]}>{a}</Text>
      <Text style={[type.callout, bold ? font(700) : null, { color: c.ink }]}>{b}</Text>
    </View>
  );
  const deductible = lines.reduce((a, l) => a + l.n * l.t.deductible_cents, 0) + gift;
  return (
    <View style={{ gap: 6, padding: space[3], borderRadius: radius.md, backgroundColor: c.surfaceSoft }}>
      {lines.map((l) => row(`${l.n} × ${l.t.name}`, usd(l.n * l.t.price_cents, true)))}
      {gift ? row('Gift', usd(gift, true)) : null}
      {row('Total', usd(total, true), true)}
      {deductible ? <Text style={[type.caption, { color: c.ink2 }]}>{usd(deductible, true)} of this is tax-deductible.</Text> : null}
    </View>
  );
}
