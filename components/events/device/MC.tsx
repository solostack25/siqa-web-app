// Event device → MC phone: run of show with one big Next button, the timer, the appeal ladder,
// and messages from volunteers and organizers read aloud into the MC's earbud.
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Platform } from 'react-native';
import { font } from '../../../lib/ds';
import { clockText, segmentClock, speak, useTick, usd, type LiveState, type StageMode } from '../../../lib/events';
import { DarkButton, DarkChip, H, N, Panel } from './kit';

const MODES: { value: StageMode; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'welcome', label: 'Welcome' }, { value: 'program', label: 'Program' },
  { value: 'appeal', label: 'Appeal' }, { value: 'thanks', label: 'Thank you' },
];

export function MCView({ state, skew, act }: { state: LiveState; skew: number; act: (a: string, p?: Record<string, unknown>) => Promise<any> }) {
  useTick();
  const e = state.event;
  const { cur, next, left, index } = segmentClock(state, skew);
  const [voice, setVoice] = useState(false);
  const [reply, setReply] = useState('');
  const spoken = useRef<Set<string> | null>(null);

  // Read new messages aloud once voice is on (browsers need a tap before they'll talk).
  useEffect(() => {
    const ids = state.messages.map((m) => m.id);
    if (spoken.current === null) { spoken.current = new Set(ids); return; }
    const fresh = state.messages.filter((m) => !spoken.current!.has(m.id) && m.from_role !== 'mc').reverse();
    fresh.forEach((m) => {
      spoken.current!.add(m.id);
      if (voice) speak(`${m.urgent ? 'Urgent. ' : ''}${m.from_label} says: ${m.body}`);
      else if (Platform.OS === 'web' && navigator.vibrate) navigator.vibrate(m.urgent ? [200, 100, 200] : 150);
    });
  }, [state.messages, voice]);

  const over = left < 0;
  const inbox = state.messages.filter((m) => m.to_role !== 'podium');
  const isAppeal = cur?.kind === 'appeal' || e.stage_mode === 'appeal';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: N.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={[font(800, 'display'), { fontSize: 18, color: N.ink, flex: 1 }]} numberOfLines={1}>{e.title}</Text>
        <DarkChip label={voice ? '🔊 Reading aloud' : '🔈 Read messages aloud'} on={voice}
          onPress={() => { const v = !voice; setVoice(v); if (v) speak('Messages will be read aloud.', true); }} />
      </View>

      {e.status !== 'live' ? (
        <Panel>
          <Text style={[font(800, 'display'), { fontSize: 28, color: N.ink }]}>{e.status === 'ended' ? 'The event has ended' : 'Ready to begin?'}</Text>
          <Text style={[font(500), { fontSize: 16, color: N.ink2 }]}>{e.status === 'ended' ? 'Screens show the thank-you slide.' : `Starting puts every screen on “${state.segments[0]?.title ?? 'the program'}” and starts the timer.`}</Text>
          {e.status !== 'ended' ? <DarkButton label="Start the event" tone="gold" big onPress={() => act('start_event')} disabled={!state.segments.length} /> : null}
        </Panel>
      ) : (
        <Panel style={{ backgroundColor: over ? 'rgba(240,139,116,0.15)' : N.panel }}>
          <H>{`Now · ${index + 1} of ${state.segments.length}`}</H>
          <Text style={[font(800, 'display'), { fontSize: 30, lineHeight: 34, color: N.ink }]}>{cur?.title}</Text>
          {cur?.speaker ? <Text style={[font(600), { fontSize: 18, color: N.gold }]}>{cur.speaker}</Text> : null}
          <Text style={[font(800, 'display'), { fontSize: 64, lineHeight: 68, letterSpacing: -2, color: over ? N.danger : left < 120 ? N.gold : N.ink }]}>{clockText(left)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DarkButton label="Back" onPress={() => act('prev_segment')} disabled={index <= 0} />
            <DarkButton label="+5 min" onPress={() => act('extend', { minutes: 5 })} />
          </View>
          <DarkButton label={next ? `Next: ${next.title}` : 'This is the last part'} tone="gold" big onPress={() => act('next_segment')} disabled={!next} />
        </Panel>
      )}

      {cur?.script ? (
        <Panel>
          <H>Your notes</H>
          <Text style={[font(500), { fontSize: 18, lineHeight: 26, color: N.ink }]}>{cur.script}</Text>
        </Panel>
      ) : null}

      {isAppeal && e.ladder?.length ? (
        <Panel>
          <H>Appeal — tap the amount you're asking for</H>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {e.ladder.map((l, i) => <DarkChip key={i} label={usd(l.amount_cents)} on={e.ladder_index === i} onPress={() => act('ladder', { index: i })} />)}
          </View>
          <Text style={[font(800, 'display'), { fontSize: 36, color: N.gold }]}>{usd(state.totals.raised_cents)}</Text>
          <Text style={[font(500), { fontSize: 15, color: N.ink2 }]}>{state.totals.donors} gifts tonight{state.totals.goal_cents ? ` · goal ${usd(state.totals.goal_cents)}` : ''}</Text>
        </Panel>
      ) : null}

      <Panel>
        <H>Messages</H>
        {inbox.length === 0 ? <Text style={[font(500), { fontSize: 15, color: N.ink3 }]}>Volunteers and organizers can message you here. Turn on “Read messages aloud” and wear an earbud.</Text> : null}
        {inbox.slice(0, 15).map((m) => (
          <View key={m.id} style={{ padding: 14, borderRadius: 14, gap: 8, backgroundColor: m.urgent && m.status === 'new' ? 'rgba(240,139,116,0.18)' : N.panel2, opacity: m.status === 'new' ? 1 : 0.6 }}>
            <Text style={[font(700), { fontSize: 13, color: N.ink2 }]}>{m.from_label} · {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
            <Text style={[font(600), { fontSize: 18, color: N.ink }]}>{m.body}</Text>
            {m.status === 'new' ? (
              m.kind === 'change_request' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <DarkButton label="Approve" tone="seed" grow onPress={() => act('approve', { message_id: m.id })} />
                  <DarkButton label="Decline" grow onPress={() => act('decline', { message_id: m.id })} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <DarkButton label="Got it" grow onPress={() => act('ack', { message_id: m.id })} />
                  {voice ? <DarkButton label="Repeat" onPress={() => speak(m.body, false)} /> : null}
                </View>
              )
            ) : <Text style={[font(600), { fontSize: 13, color: N.ink3 }]}>{m.status === 'ack' ? 'Seen' : m.status === 'approved' ? 'Approved' : 'Declined'}</Text>}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput value={reply} onChangeText={setReply} placeholder="Note to the speaker at the podium" placeholderTextColor={N.ink3}
            style={[font(500), { flex: 1, minHeight: 52, borderRadius: 14, paddingHorizontal: 14, backgroundColor: N.panel2, color: N.ink, fontSize: 16, outlineStyle: 'none' } as any]} />
          <DarkButton label="Send" tone="gold" disabled={!reply.trim()} onPress={async () => { await act('message', { to: 'podium', body: reply }); setReply(''); }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['2 minutes left', 'Please wrap up', 'Slow down a little'].map((t) => <DarkChip key={t} label={t} on={false} onPress={() => act('message', { to: 'podium', body: t })} />)}
        </View>
      </Panel>

      <Panel>
        <H>Big screen</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MODES.map((m) => <DarkChip key={m.value} label={m.label} on={e.stage_mode === m.value} onPress={() => act('stage_mode', { mode: m.value })} />)}
        </View>
        {cur?.slides?.length ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DarkButton label="◀ Slide" onPress={() => act('slide_prev')} />
            <DarkButton label={`Slide ${Math.min(e.slide_index + 1, cur.slides.length)}/${cur.slides.length} ▶`} grow onPress={() => act('slide_next')} />
          </View>
        ) : null}
      </Panel>
    </ScrollView>
  );
}
