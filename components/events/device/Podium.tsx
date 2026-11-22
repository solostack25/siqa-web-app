// Event device → Podium tablet: a big countdown, the speaker's script like a teleprompter, slide controls,
// and notes from the MC or organizers. Dark so it doesn't glow in the speaker's face.
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, useWindowDimensions } from 'react-native';
import { font } from '../../../lib/ds';
import { clockText, segmentClock, useTick, type LiveState } from '../../../lib/events';
import { DarkButton, N } from './kit';

export function PodiumView({ state, skew, act }: { state: LiveState; skew: number; act: (a: string, p?: Record<string, unknown>) => Promise<any> }) {
  useTick();
  const { width } = useWindowDimensions();
  const e = state.event;
  const { cur, next, left, total } = segmentClock(state, skew);
  const [size, setSize] = useState(34);
  const [asked, setAsked] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); setAsked(false); }, [cur?.id]);

  const over = left < 0;
  const warn = !over && left <= 120;
  const timeColor = over ? N.danger : warn ? N.gold : N.ink;
  const note = state.messages.find((m) => m.status === 'new' && (m.to_role === 'podium' || m.to_role === 'all') && m.kind === 'message');
  const slides = cur?.slides ?? [];
  const si = Math.min(e.slide_index, Math.max(0, slides.length - 1));
  const wide = width > 800;

  if (e.status !== 'live') {
    return (
      <View style={{ flex: 1, backgroundColor: N.bg, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
        <Text style={[font(800, 'display'), { fontSize: 44, color: N.ink, textAlign: 'center' }]}>{e.status === 'ended' ? 'The event has ended' : e.title}</Text>
        <Text style={[font(500), { fontSize: 20, color: N.ink2, textAlign: 'center' }]}>{e.status === 'ended' ? 'Jazakum Allahu khayran.' : 'Waiting for the MC to start the program. Your script and timer appear here.'}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: N.bg }}>
      {/* Timer bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, gap: 20, borderBottomWidth: 1, borderBottomColor: N.line, backgroundColor: over ? 'rgba(240,139,116,0.12)' : 'transparent' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[font(800, 'display'), { fontSize: 26, color: N.ink }]} numberOfLines={1}>{cur?.title}</Text>
          <Text style={[font(500), { fontSize: 16, color: N.ink2 }]} numberOfLines={1}>{cur?.speaker ? `${cur.speaker} · ` : ''}{next ? `Next: ${next.title}` : 'Last part'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[font(800, 'display'), { fontSize: wide ? 72 : 52, lineHeight: wide ? 76 : 56, letterSpacing: -2, color: timeColor }]}>{clockText(left)}</Text>
          <Text style={[font(600), { fontSize: 14, color: timeColor }]}>{over ? 'OVER TIME — PLEASE WRAP UP' : warn ? 'WRAP UP' : `of ${Math.round(total / 60)} min`}</Text>
        </View>
      </View>

      {note ? (
        <Pressable onPress={() => act('ack', { message_id: note.id })} accessibilityRole="button" accessibilityLabel={`Message: ${note.body}. Tap to dismiss`}
          style={{ margin: 16, marginBottom: 0, padding: 18, borderRadius: 18, backgroundColor: note.urgent ? N.danger : N.gold, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Text style={[font(800), { fontSize: 24, color: '#0a0f1c', flex: 1 }]}>{note.body}</Text>
          <Text style={[font(700), { fontSize: 15, color: '#0a0f1c' }]}>Got it ✓</Text>
        </Pressable>
      ) : null}

      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 28, paddingBottom: 120 }}>
          {cur?.script ? (
            <Text style={[font(500), { fontSize: size, lineHeight: size * 1.45, color: N.ink }]}>{cur.script}</Text>
          ) : (
            <Text style={[font(500), { fontSize: 22, color: N.ink3 }]}>No script for this part. Add one in the dashboard under Program.</Text>
          )}
        </ScrollView>
        {slides.length ? (
          <View style={{ width: wide ? 340 : '100%', padding: 16, gap: 12, borderLeftWidth: wide ? 1 : 0, borderTopWidth: wide ? 0 : 1, borderColor: N.line }}>
            <Text style={[font(700), { fontSize: 14, color: N.ink2 }]}>SLIDE {si + 1} OF {slides.length}</Text>
            <Image source={{ uri: slides[si] }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#000' }} resizeMode="contain" />
            {slides[si + 1] ? <Text style={[font(500), { fontSize: 13, color: N.ink3 }]}>Next slide:</Text> : null}
            {slides[si + 1] ? <Image source={{ uri: slides[si + 1] }} style={{ width: '60%', aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: '#000', opacity: 0.7 }} resizeMode="contain" /> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DarkButton label="◀ Back" onPress={() => act('slide_prev')} disabled={si === 0} />
              <DarkButton label="Next slide ▶" tone="gold" grow onPress={() => act('slide_next')} disabled={si >= slides.length - 1} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: N.line, flexWrap: 'wrap' }}>
        <DarkButton label="A−" onPress={() => setSize((s) => Math.max(20, s - 4))} />
        <DarkButton label="A+" onPress={() => setSize((s) => Math.min(72, s + 4))} />
        <View style={{ flex: 1 }} />
        <DarkButton label={asked ? 'Asked for 5 more min' : 'Need 5 more minutes'} disabled={asked}
          onPress={async () => { await act('message', { to: 'mc', body: `${cur?.speaker || 'The speaker'} asks for 5 more minutes`, change: { type: 'extend', minutes: 5 } }); setAsked(true); }} />
        <DarkButton label="I'm done ▶" tone="gold" onPress={() => act('next_segment')} disabled={!next} />
      </View>
    </View>
  );
}
