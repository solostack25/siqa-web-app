// Event editor → Giving: the goal, a matching gift, the appeal ladder, and the gift log (confirm cash, void mistakes).
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button, IconButton, TextField } from '../../ui';
import { Card, CardTitle, Tag } from '../../masjid/admin/kit';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import { usd, teamAct, type Ladder } from '../../../lib/events';
import { MoneyField, Progress, Stat } from '../fields';
import type { EventData } from './EventsSection';

type Gift = { id: string; amount_cents: number; method: string; donor_name: string | null; anonymous: boolean; table_label: string | null; status: string; pledge_plan: string | null; logged_by: string | null; created_at: string; test_mode: boolean };

export function GivingTab({ data, reload, wide }: { data: EventData; reload: () => void; wide: boolean }) {
  const { c } = useDS();
  const ev = data.event;
  const [goal, setGoal] = useState(ev.goal_cents);
  const [pre, setPre] = useState(ev.pre_raised_cents);
  const [match, setMatch] = useState(ev.match_cents);
  const [matchBy, setMatchBy] = useState(ev.match_by ?? '');
  const [ladder, setLadder] = useState<Ladder>(ev.ladder ?? []);
  const [ladderKey, setLadderKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [gifts, setGifts] = useState<Gift[] | null>(null);

  const loadGifts = useCallback(async () => {
    const { data: g } = await supabase.from('event_gifts').select('*').eq('event_id', ev.id).neq('status', 'pending').order('created_at', { ascending: false }).limit(300);
    setGifts((g as Gift[]) ?? []);
  }, [ev.id]);
  useEffect(() => { loadGifts(); }, [loadGifts]);

  const save = async () => {
    setBusy(true);
    const clean = ladder.filter((l) => l.amount_cents > 0).sort((a, b) => b.amount_cents - a.amount_cents);
    const { error } = await supabase.from('events').update({
      goal_cents: goal, pre_raised_cents: pre, match_cents: match, match_by: matchBy.trim() || null, ladder: clean,
    }).eq('id', ev.id);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    setLadder(clean); setLadderKey((k) => k + 1);
    showToast('Saved.');
    reload();
  };
  const act = async (action: 'confirm_gift' | 'void_gift', g: Gift) => {
    if (action === 'void_gift' && !(await confirmDialog('Remove this gift from the total?', `${usd(g.amount_cents)} ${g.method}${g.donor_name ? ` from ${g.donor_name}` : ''}. Card payments still need a refund in Stripe.`, 'Remove'))) return;
    try { await teamAct(ev.id, action, { gift_id: g.id }); loadGifts(); } catch (e: any) { showToast(e.message); }
  };

  const valid = (gifts ?? []).filter((g) => g.status !== 'void');
  const tonight = valid.reduce((a, g) => a + g.amount_cents, 0);
  const unconfirmed = valid.filter((g) => g.status === 'unconfirmed');
  const pledged = valid.filter((g) => g.status === 'pledged').reduce((a, g) => a + g.amount_cents, 0);
  const raised = ev.pre_raised_cents + tonight;

  return (
    <View style={{ gap: space[4] }}>
      <Card>
        <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
          <Stat label="Raised" value={usd(raised)} sub={ev.goal_cents ? `of ${usd(ev.goal_cents)} goal` : undefined} />
          <Stat label="Tonight" value={usd(tonight)} sub={`${valid.length} gifts`} />
          <Stat label="Pledged" value={usd(pledged)} sub="Follow up after the event" />
        </View>
        {ev.goal_cents ? <Progress value={raised} max={ev.goal_cents} height={12} /> : null}
      </Card>

      <Card>
        <CardTitle>Goal & match</CardTitle>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[3] }}>
          <MoneyField label="Goal" cents={goal} onChange={(v) => setGoal(v ?? 0)} containerStyle={{ flex: 1 }} help="Shown as a thermometer on the big screen." />
          <MoneyField label="Already raised before tonight" cents={pre} onChange={(v) => setPre(v ?? 0)} containerStyle={{ flex: 1 }} help="Sponsorships or early gifts to start the bar." />
        </View>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[3] }}>
          <MoneyField label="Matching gift (optional)" cents={match} onChange={(v) => setMatch(v ?? 0)} containerStyle={{ flex: 1 }} help="Every dollar given is doubled up to this amount." />
          <TextField label="Matched by" value={matchBy} onChangeText={setMatchBy} placeholder="An anonymous family" containerStyle={{ flex: 1 }} />
        </View>
      </Card>

      <Card>
        <CardTitle action="Add level" onAction={() => { setLadder([...ladder, { amount_cents: 0 }]); setLadderKey((k) => k + 1); }}>Appeal ladder</CardTitle>
        <Text style={[type.caption, font(400), { color: c.ink2 }]}>The amounts the fundraiser calls out, biggest first. The MC moves down the ladder and the big screen shows the current ask and hands raised.</Text>
        <View key={ladderKey} style={{ gap: space[2] }}>
          {ladder.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
              <MoneyField label={i === 0 ? 'Amount' : ''} cents={l.amount_cents} containerStyle={{ flex: 1 }}
                onChange={(v) => setLadder((x) => x.map((y, k) => (k === i ? { ...y, amount_cents: v ?? 0 } : y)))} />
              <TextField label={i === 0 ? 'Name (optional)' : undefined} defaultValue={l.label ?? ''} placeholder="Founders circle" containerStyle={{ flex: 1.3 }}
                onChangeText={(v) => setLadder((x) => x.map((y, k) => (k === i ? { ...y, label: v.trim() || undefined } : y)))} />
              <IconButton icon="close" label="Remove level" onPress={() => { setLadder(ladder.filter((_, k) => k !== i)); setLadderKey((k) => k + 1); }} />
            </View>
          ))}
        </View>
      </Card>
      <Button label="Save giving settings" onPress={save} loading={busy} style={{ alignSelf: 'flex-end', minWidth: 220 }} />

      <Card>
        <CardTitle>Gifts</CardTitle>
        {unconfirmed.length ? (
          <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: c.goldTint }}>
            <Text style={[type.callout, { color: c.goldInk }]}>{unconfirmed.length} cash or check gift{unconfirmed.length === 1 ? '' : 's'} ({usd(unconfirmed.reduce((a, g) => a + g.amount_cents, 0))}) logged by volunteers. Confirm when the money is counted.</Text>
          </View>
        ) : null}
        {gifts && gifts.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>No gifts yet. They appear here as they come in — online, at checkout, or logged by volunteers.</Text> : null}
        {(gifts ?? []).map((g, i) => (
          <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: g.status === 'void' ? 0.45 : 1 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, font(600), { color: c.ink, textDecorationLine: g.status === 'void' ? 'line-through' : 'none' }]}>
                {g.anonymous ? 'Anonymous' : g.donor_name || 'Guest'}{g.table_label ? ` · Table ${g.table_label}` : ''}
              </Text>
              <Text style={[type.caption, font(400), { color: c.ink2 }]}>
                {g.method === 'card' ? 'Card' : g.method[0].toUpperCase() + g.method.slice(1)}{g.pledge_plan ? ` · ${g.pledge_plan}` : ''} · {new Date(g.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{g.logged_by ? ` · ${g.logged_by}` : ''}
              </Text>
            </View>
            {g.test_mode ? <Tag label="Test" /> : null}
            {g.status === 'unconfirmed' ? <Tag label="Not counted yet" tone="gold" /> : g.status === 'pledged' ? <Tag label="Pledge" tone="gold" /> : null}
            <Text style={[type.headline, { color: c.ink }]}>{usd(g.amount_cents)}</Text>
            {g.status === 'unconfirmed' ? <Button label="Confirm" size="sm" variant="secondary" onPress={() => act('confirm_gift', g)} /> : null}
            {g.status !== 'void' ? <IconButton icon="close" label="Remove gift" size="sm" onPress={() => act('void_gift', g)} /> : null}
          </View>
        ))}
      </Card>
    </View>
  );
}
