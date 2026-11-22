// Event editor → Run the night: one control room for the organizer. Start the event, move the program,
// choose what the big screen shows, run the appeal ladder, watch giving, and message the MC or podium.
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button, Chip, SegmentedControl, TextField } from '../../ui';
import { Card, CardTitle, Dot, Tag, screenOnline } from '../../masjid/admin/kit';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import {
  ROLE_INFO, clockText, giveUrl, segmentClock, teamAct, teamState, useLivePoll, useTick, usd,
  type DeviceRole, type LiveState, type StageMode,
} from '../../../lib/events';
import { MoneyField, Progress, Stat } from '../fields';
import type { EventData } from './EventsSection';

const MODES: { value: StageMode; label: string }[] = [
  { value: 'auto', label: 'Follow the program' }, { value: 'welcome', label: 'Welcome' }, { value: 'program', label: 'Program' },
  { value: 'slides', label: 'Slides' }, { value: 'speaker', label: 'Speaker' }, { value: 'video', label: 'Video' },
  { value: 'appeal', label: 'Appeal' }, { value: 'thanks', label: 'Thank you' },
];

export function LiveControl({ data, reload, wide }: { data: EventData; reload: () => void; wide: boolean }) {
  const { c } = useDS();
  const ev = data.event;
  const { state, skew, refresh, error } = useLivePoll(() => teamState(ev.id), 2000);
  useTick();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (action: string, payload: Record<string, unknown> = {}, label?: string) => {
    setBusy(action);
    try {
      const r = await teamAct(ev.id, action, payload);
      if (r?.ok === false && r.reason === 'no_more') showToast(action === 'next_segment' ? 'That was the last part of the program.' : 'Already at the start.');
      else if (label) showToast(label);
      await refresh();
    } catch (e: any) { showToast(e.message); }
    setBusy(null);
  };

  if (!state) return <Text style={[type.callout, { color: c.ink2 }]}>{error ?? 'Connecting…'}</Text>;
  const s = state.event;
  const clk = segmentClock(state, skew);
  const devs = state.devices ?? [];
  const has = (r: DeviceRole) => devs.some((d) => d.role === r);

  if (s.status === 'draft' || s.status === 'published') {
    return (
      <View style={{ gap: space[4] }}>
        <Card>
          <CardTitle>Ready when you are</CardTitle>
          <Text style={[type.callout, { color: c.ink2 }]}>Starting the event puts every linked screen on the first part of the program and starts the timer. The MC can also start it from their phone.</Text>
          {(['stage', 'podium', 'mc', 'registration', 'volunteer'] as DeviceRole[]).map((r) => (
            <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 6 }}>
              <Dot color={has(r) ? c.seed : c.surfaceStrong} />
              <Text style={[type.body, { color: c.ink, flex: 1 }]}>{ROLE_INFO[r].label}</Text>
              <Text style={[type.caption, { color: c.ink2 }]}>{has(r) ? `${devs.filter((d) => d.role === r).length} linked` : r === 'volunteer' ? 'Optional' : 'Not linked'}</Text>
            </View>
          ))}
          {s.status === 'draft' ? <Text style={[type.caption, { color: c.goldInk }]}>The event is still a draft. You can run it anyway, but guests can't buy tickets until you publish.</Text> : null}
          <Button label="Start the event" icon="play" onPress={async () => {
            if (await confirmDialog('Start the event?', 'Screens switch to the program and the first timer starts.', 'Start')) { await act('start_event'); reload(); }
          }} loading={busy === 'start_event'} disabled={!state.segments.length} />
          {!state.segments.length ? <Text style={[type.caption, { color: c.danger }]}>Add at least one part to the program first.</Text> : null}
        </Card>
        <Totals state={state} />
      </View>
    );
  }

  const cur = clk.cur;
  const over = clk.left < 0;
  const isAppeal = cur?.kind === 'appeal' || s.stage_mode === 'appeal';

  return (
    <View style={{ gap: space[4] }}>
      {s.status === 'ended' ? (
        <View style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.seedTint }}>
          <Text style={[type.headline, { color: c.seed }]}>The event has ended. Screens show the thank-you slide.</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[4], alignItems: 'flex-start' }}>
        <View style={{ flex: 1.3, gap: space[4], alignSelf: 'stretch' }}>
          <Card style={{ backgroundColor: c.night ?? '#0a0f1c' }}>
            <Text style={[type.micro, { color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8 }]}>NOW · {clk.index + 1} OF {state.segments.length}</Text>
            <Text style={[type.title1, { color: '#fff' }]}>{cur?.title ?? '—'}</Text>
            {cur?.speaker ? <Text style={[type.body, { color: 'rgba(255,255,255,0.75)' }]}>{cur.speaker}</Text> : null}
            <Text style={[{ fontSize: 64, lineHeight: 70, ...font(800, 'display'), letterSpacing: -2, color: over ? '#f08b74' : clk.left < 120 ? '#d4ac73' : '#fff' }]} accessibilityLabel={`Time ${over ? 'over' : 'left'} ${clockText(clk.left)}`}>
              {clockText(clk.left)}
            </Text>
            <Text style={[type.caption, { color: 'rgba(255,255,255,0.6)' }]}>{over ? 'Over time' : 'Left'}{s.segment_extra_min ? ` · ${s.segment_extra_min > 0 ? '+' : ''}${s.segment_extra_min} min added` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
              <Button label="Back" icon="play-back" size="md" variant="light" onPress={() => act('prev_segment')} loading={busy === 'prev_segment'} />
              <Button label="+5 min" size="md" variant="light" onPress={() => act('extend', { minutes: 5 })} />
              <Button label="−1 min" size="md" variant="light" onPress={() => act('extend', { minutes: -1 })} />
              <Button label={clk.next ? `Next: ${clk.next.title}` : 'Last part'} iconRight="play-forward" size="md" variant="gold" grow
                onPress={() => act('next_segment')} loading={busy === 'next_segment'} disabled={!clk.next} />
            </View>
          </Card>

          <Card>
            <CardTitle>Big screen shows</CardTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {MODES.map((m) => <Chip key={m.value} label={m.label} selected={s.stage_mode === m.value} onPress={() => act('stage_mode', { mode: m.value })} />)}
            </View>
            {cur?.slides?.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Button label="Previous slide" icon="chevron-back" size="sm" variant="secondary" onPress={() => act('slide_prev')} />
                <Text style={[type.subhead, { color: c.ink, flex: 1, textAlign: 'center' }]}>Slide {Math.min(s.slide_index + 1, cur.slides.length)} of {cur.slides.length}</Text>
                <Button label="Next slide" iconRight="chevron-forward" size="sm" variant="secondary" onPress={() => act('slide_next')} />
              </View>
            ) : null}
          </Card>

          {isAppeal || s.ladder?.length ? (
            <Card>
              <CardTitle>Appeal ladder</CardTitle>
              <Text style={[type.caption, font(400), { color: c.ink2 }]}>Tap the amount being asked for. The big screen and online givers see it.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {(s.ladder ?? []).map((l, i) => (
                  <Chip key={i} label={`${usd(l.amount_cents)}${l.label ? ` · ${l.label}` : ''}`} selected={s.ladder_index === i} onPress={() => act('ladder', { index: i })} />
                ))}
                <Chip label="Hide" selected={s.ladder_index == null} onPress={() => act('ladder', { index: null })} />
              </View>
              <Text style={[type.caption, font(400), { color: c.ink3 }]}>Online give page: {giveUrl(s.slug).replace('https://', '')}</Text>
            </Card>
          ) : null}

          <Card>
            <CardTitle>Program</CardTitle>
            {state.segments.map((g, i) => (
              <Pressable key={g.id} onPress={() => act('goto_segment', { segment_id: g.id })} accessibilityRole="button" accessibilityLabel={`Jump to ${g.title}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 8, paddingHorizontal: space[2], borderRadius: radius.md, backgroundColor: i === clk.index ? c.goldTint : 'transparent', opacity: i < clk.index ? 0.5 : 1 }}>
                <Text style={[type.caption, { color: c.ink3, width: 20 }]}>{i + 1}</Text>
                <Text style={[type.body, font(i === clk.index ? 700 : 500), { color: c.ink, flex: 1 }]} numberOfLines={1}>{g.title}{g.speaker ? ` — ${g.speaker}` : ''}</Text>
                <Text style={[type.caption, { color: c.ink2 }]}>{g.minutes} min</Text>
              </Pressable>
            ))}
          </Card>
        </View>

        <View style={{ flex: 1, gap: space[4], alignSelf: 'stretch' }}>
          <Totals state={state} />
          <Messages state={state} act={act} />
          <LogGift act={act} />
          <Card>
            <CardTitle>Devices</CardTitle>
            {devs.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>No devices linked. Add them in the Devices tab.</Text> : null}
            {devs.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Dot color={screenOnline(d.last_seen_at) ? c.seed : c.danger} />
                <Text style={[type.callout, { color: c.ink, flex: 1 }]}>{d.name}</Text>
                <Text style={[type.caption, { color: c.ink2 }]}>{ROLE_INFO[d.role].label}</Text>
              </View>
            ))}
          </Card>
          {s.status === 'live' ? (
            <Button label="End the event" variant="danger" onPress={async () => {
              if (await confirmDialog('End the event?', 'Screens show the thank-you slide. Volunteers can still log gifts.', 'End event')) { await act('end_event'); reload(); }
            }} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Totals({ state }: { state: LiveState }) {
  const { c } = useDS();
  const t = state.totals;
  return (
    <Card>
      <CardTitle>Giving</CardTitle>
      <Text style={[type.display, { color: c.ink }]}>{usd(t.raised_cents)}</Text>
      {t.goal_cents ? <><Progress value={t.raised_cents} max={t.goal_cents} height={12} /><Text style={[type.caption, { color: c.ink2 }]}>{Math.round((t.raised_cents / t.goal_cents) * 100)}% of {usd(t.goal_cents)}</Text></> : null}
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        <Stat label="Tonight" value={usd(t.tonight_cents)} sub={`${t.donors} gifts`} />
        <Stat label="Checked in" value={`${t.checked_in ?? 0}/${t.attendees ?? 0}`} sub={t.online_attendees ? `${t.online_attendees} online` : undefined} />
      </View>
      {t.match_cents ? <Text style={[type.caption, { color: c.goldInk }]}>Match: {usd(t.match_used_cents)} of {usd(t.match_cents)} used</Text> : null}
      {t.unconfirmed_cents ? <Text style={[type.caption, { color: c.ink2 }]}>{usd(t.unconfirmed_cents)} in cash/checks not counted yet</Text> : null}
      {t.feed.slice(0, 5).map((g, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
          <Text style={[type.callout, { color: c.ink }]}>{g.name}</Text>
          <Text style={[type.callout, font(700), { color: c.ink }]}>{usd(g.amount_cents)}</Text>
        </View>
      ))}
    </Card>
  );
}

function Messages({ state, act }: { state: LiveState; act: (a: string, p?: Record<string, unknown>, label?: string) => Promise<void> }) {
  const { c } = useDS();
  const [to, setTo] = useState<'mc' | 'podium' | 'all'>('mc');
  const [body, setBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const send = async () => {
    if (!body.trim()) return;
    await act('message', { to, body, urgent }, 'Sent.');
    setBody(''); setUrgent(false);
  };
  return (
    <Card>
      <CardTitle>Messages</CardTitle>
      <SegmentedControl label="Send to" value={to} onChange={setTo} options={[{ value: 'mc', label: 'MC' }, { value: 'podium', label: 'Podium' }, { value: 'all', label: 'Everyone' }]} />
      <TextField value={body} onChangeText={setBody} placeholder={to === 'podium' ? 'Please wrap up in 2 minutes' : 'Thank the Ahmed family, table 4, for $10,000'} multiline onSubmitEditing={send} />
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Chip label="Urgent" icon="alert-circle-outline" selected={urgent} onPress={() => setUrgent(!urgent)} />
        <Button label="Send" size="md" onPress={send} disabled={!body.trim()} grow />
      </View>
      {state.messages.slice(0, 12).map((m) => (
        <View key={m.id} style={{ gap: 4, padding: space[3], borderRadius: radius.md, backgroundColor: m.urgent ? c.dangerTint : c.surfaceSoft }}>
          <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
            <Text style={[type.caption, font(700), { color: c.ink, flex: 1 }]}>{m.from_label} → {m.to_role === 'all' ? 'Everyone' : m.to_role === 'mc' ? 'MC' : m.to_role === 'podium' ? 'Podium' : 'Team'}</Text>
            {m.status !== 'new' ? <Tag label={m.status === 'ack' ? 'Seen' : m.status === 'approved' ? 'Approved' : 'Declined'} tone={m.status === 'declined' ? 'danger' : 'seed'} /> : null}
          </View>
          <Text style={[type.callout, { color: c.ink }]}>{m.body}</Text>
          {m.kind === 'change_request' && m.status === 'new' ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button label="Approve" size="sm" onPress={() => act('approve', { message_id: m.id })} />
              <Button label="Decline" size="sm" variant="secondary" onPress={() => act('decline', { message_id: m.id })} />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

function LogGift({ act }: { act: (a: string, p?: Record<string, unknown>, label?: string) => Promise<void> }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'cash' | 'check' | 'pledge' | 'other'>('pledge');
  const [k, setK] = useState(0);
  const log = async () => {
    if (!amount) { showToast('Enter an amount.'); return; }
    await act('log_gift', { amount_cents: amount, donor_name: name, method, show_name: !!name.trim() }, 'Gift added to the total.');
    setAmount(null); setName(''); setK((x) => x + 1);
  };
  return (
    <Card>
      <CardTitle>Add a gift</CardTitle>
      <SegmentedControl label="Method" value={method} onChange={setMethod} options={[{ value: 'pledge', label: 'Pledge' }, { value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }, { value: 'other', label: 'Other' }]} />
      <View key={k} style={{ flexDirection: 'row', gap: space[2] }}>
        <MoneyField label="Amount" cents={amount} onChange={setAmount} containerStyle={{ flex: 1 }} />
        <TextField label="Name (optional)" value={name} onChangeText={setName} containerStyle={{ flex: 1.4 }} />
      </View>
      <Button label="Add to total" size="md" variant="gold" onPress={log} />
    </Card>
  );
}
