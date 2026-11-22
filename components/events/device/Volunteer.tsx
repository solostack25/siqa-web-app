// Event device → Volunteer phone: log cash, checks and pledges at the tables, let a donor pay by card on their own
// phone (QR with the amount filled in), and message the MC ("Table 4 just pledged $10K").
import { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { font } from '../../../lib/ds';
import { QRCode } from '../../masjid/QRCode';
import { giveUrl, usd, type LiveState } from '../../../lib/events';
import { DarkButton, DarkChip, H, N, Panel } from './kit';

type Method = 'cash' | 'check' | 'pledge' | 'card';
const PRESETS = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];

export function VolunteerView({ state, name, act }: { state: LiveState; name: string; act: (a: string, p?: Record<string, unknown>) => Promise<any> }) {
  const e = state.event;
  const [tab, setTab] = useState<'gift' | 'message'>('gift');
  const [method, setMethod] = useState<Method>('cash');
  const [amount, setAmount] = useState('');
  const [donor, setDonor] = useState('');
  const [table, setTable] = useState('');
  const [plan, setPlan] = useState('');
  const [showName, setShowName] = useState(true);
  const [tellMc, setTellMc] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [urgent, setUrgent] = useState(false);

  const cents = Math.round((parseFloat(amount.replace(/[$,]/g, '')) || 0) * 100);
  const ask = e.ladder_index != null ? e.ladder?.[e.ladder_index] : null;

  const log = async () => {
    if (!cents) return;
    await act('log_gift', {
      amount_cents: cents, method, donor_name: donor, table_label: table, pledge_plan: method === 'pledge' ? plan : null,
      show_name: showName && !!donor.trim(), anonymous: !donor.trim(), tell_mc: tellMc,
    });
    setDone(`${usd(cents)} ${method}${donor.trim() ? ` from ${donor.trim()}` : ''} logged`);
    setAmount(''); setDonor(''); setPlan('');
    setTimeout(() => setDone(null), 4000);
  };
  const send = async (body: string, isUrgent = urgent) => {
    if (!body.trim()) return;
    await act('message', { to: 'mc', body: table ? `${body} (table ${table})` : body, urgent: isUrgent });
    setMsg(''); setUrgent(false);
    setDone('Sent to the MC');
    setTimeout(() => setDone(null), 2500);
  };

  const input = (v: string, set: (s: string) => void, ph: string, opts: any = {}) => (
    <TextInput value={v} onChangeText={set} placeholder={ph} placeholderTextColor={N.ink3} {...opts}
      style={[font(500), { minHeight: 52, borderRadius: 14, paddingHorizontal: 14, backgroundColor: N.panel2, color: N.ink, fontSize: 17, outlineStyle: 'none' } as any, opts.style]} />
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: N.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[font(800, 'display'), { fontSize: 18, color: N.ink }]} numberOfLines={1}>{name}</Text>
          <Text style={[font(500), { fontSize: 14, color: N.ink2 }]}>{usd(state.totals.raised_cents)} raised{ask ? ` · asking ${usd(ask.amount_cents)}` : ''}</Text>
        </View>
        <DarkChip label="Log a gift" on={tab === 'gift'} onPress={() => setTab('gift')} />
        <DarkChip label="Message MC" on={tab === 'message'} onPress={() => setTab('message')} />
      </View>

      {done ? <View style={{ padding: 16, borderRadius: 16, backgroundColor: N.seed }}><Text style={[font(800), { fontSize: 18, color: '#0a0f1c' }]}>✓ {done}</Text></View> : null}

      {tab === 'gift' ? (
        <>
          <Panel>
            <H>How are they giving?</H>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['cash', 'check', 'pledge', 'card'] as Method[]).map((m) => (
                <DarkChip key={m} label={m === 'card' ? 'Card (their phone)' : m[0].toUpperCase() + m.slice(1)} on={method === m} onPress={() => setMethod(m)} />
              ))}
            </View>
            <H>Amount</H>
            {input(amount, (v) => setAmount(v.replace(/[^0-9.]/g, '')), '$0', { keyboardType: 'decimal-pad', style: { fontSize: 34, minHeight: 70, ...font(800, 'display') } })}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PRESETS.map((p) => <DarkChip key={p} label={usd(p)} on={cents === p} onPress={() => setAmount(String(p / 100))} />)}
            </View>
          </Panel>

          {method === 'card' ? (
            <Panel style={{ alignItems: 'center' }}>
              <H>Have them scan this to pay</H>
              <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: 20 }}>
                <QRCode value={`${giveUrl(e.slug)}${cents ? `?a=${cents}` : ''}${table ? `${cents ? '&' : '?'}t=${encodeURIComponent(table)}` : ''}`} size={230} />
              </View>
              <Text style={[font(500), { fontSize: 15, color: N.ink2, textAlign: 'center' }]}>Opens the give page{cents ? ` with ${usd(cents)} filled in` : ''}. Card gifts count automatically — no need to log them.</Text>
            </Panel>
          ) : (
            <Panel>
              <H>Who's it from?</H>
              {input(donor, setDonor, 'Name (leave empty for anonymous)')}
              {input(table, setTable, 'Table (optional)')}
              {method === 'pledge' ? input(plan, setPlan, 'Plan, e.g. 12 monthly payments') : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <DarkChip label={showName ? '✓ Name on big screen' : 'Name on big screen'} on={showName} onPress={() => setShowName(!showName)} />
                <DarkChip label={tellMc ? '✓ Tell the MC' : 'Tell the MC'} on={tellMc} onPress={() => setTellMc(!tellMc)} />
              </View>
              <DarkButton label={cents ? `Log ${usd(cents)} ${method}` : 'Enter an amount'} tone="gold" big disabled={!cents} onPress={log} />
              <Text style={[font(500), { fontSize: 13, color: N.ink3 }]}>{method === 'pledge' ? 'Pledges count toward the total; the team follows up after the event.' : 'Hand cash and checks to the finance table. The team confirms them once counted.'}</Text>
            </Panel>
          )}
        </>
      ) : (
        <Panel>
          <H>Message the MC</H>
          {input(table, setTable, 'Your table or area (optional)')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Hands up at my table', 'Need more pledge cards', 'Need a mic runner', 'Sound is too low back here', 'Speaker running long'].map((t) => (
              <DarkChip key={t} label={t} on={false} onPress={() => send(t, false)} />
            ))}
          </View>
          {input(msg, setMsg, 'Type a message', { multiline: true, style: { minHeight: 90, paddingTop: 14 } })}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DarkChip label={urgent ? '⚠ Urgent' : 'Urgent'} on={urgent} onPress={() => setUrgent(!urgent)} />
            <DarkButton label="Send to MC" tone="gold" grow disabled={!msg.trim()} onPress={() => send(msg)} />
          </View>
        </Panel>
      )}

      <Panel>
        <H>Recent gifts</H>
        {state.totals.feed.length === 0 ? <Text style={[font(500), { fontSize: 15, color: N.ink3 }]}>None yet.</Text> : null}
        {state.totals.feed.slice(0, 6).map((g, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[font(500), { fontSize: 16, color: N.ink }]}>{g.name}</Text>
            <Text style={[font(800), { fontSize: 16, color: N.gold }]}>{usd(g.amount_cents)}</Text>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}
