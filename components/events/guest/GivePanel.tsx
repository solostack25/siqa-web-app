// Give during the appeal: amount (the ask is pre-selected), name, card. Used on /e/<slug>/give and the online seat.
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { Button, Switch, TextField } from '../../ui';
import { Icon } from '../../Icon';
import { eventPay, usd, type Ladder } from '../../../lib/events';
import { AmountChips, PayStep } from './GuestKit';
import { Progress } from '../fields';

export type LivePublic = {
  id: string; slug: string; title: string; status: string; ladder: Ladder; ladder_index: number | null; match_by: string | null;
  online_watch_token: string | null; org_name: string | null;
  current: { title: string; speaker: string | null; kind: string } | null;
  totals: { raised_cents: number; tonight_cents: number; goal_cents: number; donors: number; match_cents: number; match_used_cents: number; pledged_cents: number; feed: { name: string; amount_cents: number; at: string }[] };
};

export function useLivePublic(slug: string | undefined, ms = 4000) {
  const [data, setData] = useState<LivePublic | null | undefined>(undefined);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const load = async () => {
      const { data: d } = await supabase.rpc('event_live_public', { p_slug: slug });
      if (alive) setData((d as LivePublic) ?? null);
    };
    load();
    const t = setInterval(load, ms);
    return () => { alive = false; clearInterval(t); };
  }, [slug, ms]);
  return data;
}

export function GivePanel({ live, initialCents, table, compact }: { live: LivePublic; initialCents?: number | null; table?: string | null; compact?: boolean }) {
  const { c } = useDS();
  const ask = live.ladder_index != null ? live.ladder?.[live.ladder_index] : null;
  const ladder = (live.ladder ?? []).map((l) => l.amount_cents).filter((a) => a <= 2_500_000);
  const amounts = Array.from(new Set([...(ladder.length ? ladder.slice(-4) : []), 2500, 5000, 10000, 25000, 50000, 100000])).sort((a, b) => a - b).slice(0, 8);
  const [cents, setCents] = useState<number | null>(initialCents ?? ask?.amount_cents ?? null);
  const [custom, setCustom] = useState(initialCents && !amounts.includes(initialCents) ? String(initialCents / 100) : '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [anon, setAnon] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<{ secret: string; test: boolean } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [userTouched, setUserTouched] = useState(!!initialCents);

  // Follow the fundraiser's ask until the giver picks their own amount.
  useEffect(() => { if (!userTouched && ask) setCents(ask.amount_cents); }, [ask?.amount_cents]);

  const start = async () => {
    if (!cents || cents < 100) { setErr('Choose an amount.'); return; }
    if (!email.trim() || !/.+@.+\..+/.test(email)) { setErr('Enter your email for the receipt.'); return; }
    setErr(null); setBusy(true);
    try {
      const r = await eventPay({ action: 'create', kind: 'gift', slug: live.slug, amount_cents: cents, donor: { name, email }, anonymous: anon, show_name: onScreen && !anon, table_label: table });
      setPay({ secret: r.clientSecret!, test: !!r.testMode });
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const paid = async (pi: string) => {
    try { await eventPay({ action: 'confirm', payment_intent_id: pi }); } catch { /* counted by retry below */ }
    setDone(cents); setPay(null);
  };

  const t = live.totals;
  if (done) {
    return (
      <View style={{ gap: space[3], alignItems: 'center', padding: space[6], borderRadius: radius.xl, backgroundColor: c.seedTint }}>
        <Icon name="heart" size={36} color={c.seed} />
        <Text style={[type.title1, { color: c.ink, textAlign: 'center' }]}>JazakAllahu khayran{name.trim() && !anon ? `, ${name.trim().split(' ')[0]}` : ''}</Text>
        <Text style={[type.body, { color: c.ink2, textAlign: 'center' }]}>Your {usd(done)} gift to {live.org_name ?? 'the event'} is in{onScreen && !anon && name.trim() ? ' and your name is going up on the screen' : ''}.</Text>
        <Button label="Give again" variant="secondary" size="md" onPress={() => { setDone(null); setUserTouched(false); }} />
      </View>
    );
  }

  return (
    <View style={{ gap: space[4] }}>
      {!compact ? (
        <View style={{ gap: space[2] }}>
          <Text style={[type.amount, { color: c.ink }]}>{usd(t.raised_cents)}</Text>
          {t.goal_cents ? <><Progress value={t.raised_cents} max={t.goal_cents} height={12} /><Text style={[type.caption, { color: c.ink2 }]}>{Math.round((t.raised_cents / t.goal_cents) * 100)}% of {usd(t.goal_cents)} · {t.donors} gifts tonight</Text></> : null}
          {t.match_cents && t.match_used_cents < t.match_cents ? (
            <Text style={[type.callout, font(700), { color: c.goldInk }]}>Your gift is doubled{live.match_by ? ` by ${live.match_by}` : ''} — {usd(t.match_cents - t.match_used_cents)} of matching left.</Text>
          ) : null}
        </View>
      ) : null}
      {ask ? (
        <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: c.goldTint }}>
          <Text style={[type.callout, { color: c.goldInk }]}>Right now the room is being asked for <Text style={font(800)}>{usd(ask.amount_cents)}</Text>{ask.label ? ` (${ask.label})` : ''}. Any amount helps.</Text>
        </View>
      ) : null}

      {pay ? (
        <PayStep clientSecret={pay.secret} testMode={pay.test} label={`Give ${usd(cents)}`} variant="gold" onPaid={paid} onCancel={() => setPay(null)} />
      ) : (
        <>
          <AmountChips amounts={ask && ask.amount_cents > 100000 && !amounts.includes(ask.amount_cents) ? [ask.amount_cents, ...amounts] : amounts}
            value={custom ? null : cents} onPick={(a) => { setCents(a); setCustom(''); setUserTouched(true); }} />
          <TextField label="Or another amount" value={custom} keyboardType="decimal-pad" placeholder="$"
            onChangeText={(v) => { const s = v.replace(/[^0-9.]/g, ''); setCustom(s); setUserTouched(true); const n = Math.round(parseFloat(s) * 100); setCents(Number.isFinite(n) ? n : null); }} />
          <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
            <TextField label="Your name" value={name} onChangeText={setName} containerStyle={{ flex: 1, minWidth: 200 }} autoComplete="name" />
            <TextField label="Email for your receipt" value={email} onChangeText={setEmail} containerStyle={{ flex: 1, minWidth: 200 }} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          </View>
          <Row label="Give anonymously" value={anon} onChange={setAnon} />
          {!anon ? <Row label="Show my name on the big screen" value={onScreen} onChange={setOnScreen} /> : null}
          {err ? <Text style={[type.callout, { color: c.danger }]}>{err}</Text> : null}
          <Button label={cents ? `Continue — ${usd(cents, true)}` : 'Choose an amount'} variant="gold" onPress={start} loading={busy} disabled={!cents} />
          <Text style={[type.caption, { color: c.ink3, textAlign: 'center' }]}>Payments are processed securely by Stripe.</Text>
        </>
      )}
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Text style={[type.body, { color: c.ink }]}>{label}</Text>
      <Switch label={label} value={value} onValueChange={onChange} />
    </View>
  );
}
