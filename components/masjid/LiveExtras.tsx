// What the host puts on screen during a live, shown on masjid TVs: the live poll (with a QR code so
// people in the masjid can vote from their phones), the question on air, and ayah/hadith cards.
// Same live data viewers see on the watch page; refreshed every 3 seconds.
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../../lib/supabase';
import { font } from '../../lib/ds';
import { QRCode } from './QRCode';
import { watchUrl } from '../../lib/studioLink';

type Poll = { id: string; question: string; options: string[]; counts: number[]; open: boolean; total: number };
type Card = { arabic?: string; english: string; ref: string };
type OnAir = { name: string | null; body: string };

const C = { ink: '#edf1f7', ink2: '#9facc4', gold: '#d4ac73', goldInk: '#e6c290', panel: 'rgba(10,15,28,0.9)', bar: '#d4ac73', track: 'rgba(255,255,255,0.08)' };
const disp = () => font(800, 'display');
const sans = (w: 500 | 600 | 700 = 500) => font(w);

export function useLiveExtras(watchToken?: string | null) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [onAir, setOnAir] = useState<OnAir | null>(null);
  useEffect(() => {
    if (!watchToken) return;
    let alive = true;
    const load = async () => {
      const [info, extra, pl] = await Promise.all([
        supabase.rpc('studio_watch_info', { p_watch: watchToken }),
        supabase.rpc('studio_watch_extra', { p_watch: watchToken }),
        supabase.rpc('studio_poll_current', { p_watch: watchToken }),
      ]);
      if (!alive) return;
      const i = ((info.data as { on_air_name: string | null; on_air_body: string | null }[]) || [])[0];
      setOnAir(i?.on_air_body ? { name: i.on_air_name, body: i.on_air_body } : null);
      setCard((((extra.data as { card: Card | null }[]) || [])[0]?.card) || null);
      setPoll(((pl.data as Poll[]) || [])[0] || null);
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [watchToken]);
  return { poll, card, onAir };
}

/** Right-hand column over the live video (landscape TVs). Sits above the salah-times bar. */
export function LiveExtras({ watchToken, bottom }: { watchToken?: string | null; bottom: number }) {
  const { poll, card, onAir } = useLiveExtras(watchToken);
  if (!poll && !card && !onAir) return null;
  return (
    <>
      {poll ? (
        <View style={{ position: 'absolute', right: 40, top: 110, width: 600, backgroundColor: C.panel, borderRadius: 24, padding: 28, gap: 16 }}>
          <Text style={[sans(700), { fontSize: 18, color: C.gold, letterSpacing: 1.5 }]}>{poll.open ? 'LIVE POLL' : 'POLL RESULTS'}</Text>
          <Text style={[disp(), { fontSize: 32, color: C.ink, lineHeight: 38 }]} numberOfLines={3}>{poll.question}</Text>
          {poll.options.map((o, i) => {
            const pct = poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0;
            return (
              <View key={i} style={{ height: 54, borderRadius: 14, backgroundColor: C.track, overflow: 'hidden', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: 'rgba(212,172,115,0.35)' }} />
                <View style={{ flexDirection: 'row', paddingHorizontal: 18, alignItems: 'center' }}>
                  <Text style={[sans(600), { fontSize: 24, color: C.ink, flex: 1 }]} numberOfLines={1}>{o}</Text>
                  <Text style={[sans(700), { fontSize: 24, color: C.goldInk }]}>{pct}%</Text>
                </View>
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }}>
            {poll.open && watchToken ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 6 }}><QRCode value={watchUrl(watchToken)} size={96} label="Scan to vote" /></View>
            ) : null}
            <Text style={[sans(500), { fontSize: 20, color: C.ink2, flex: 1 }]}>
              {poll.total} vote{poll.total === 1 ? '' : 's'}{poll.open ? ' · Scan to vote on your phone' : ''}
            </Text>
          </View>
        </View>
      ) : null}
      {onAir || card ? (
        <View style={{ position: 'absolute', left: 40, right: poll ? 680 : 40, bottom, gap: 14 }}>
          {card ? (
            <View style={{ backgroundColor: C.panel, borderRadius: 24, paddingHorizontal: 32, paddingVertical: 22, gap: 8, borderLeftWidth: 6, borderLeftColor: C.gold }}>
              {card.arabic ? <Text style={[{ fontSize: 40, color: C.ink, textAlign: 'right', writingDirection: 'rtl', lineHeight: 64 }]} numberOfLines={3}>{card.arabic}</Text> : null}
              <Text style={[sans(500), { fontSize: 28, color: C.ink, lineHeight: 36 }]} numberOfLines={4}>{card.english}</Text>
              <Text style={[sans(600), { fontSize: 20, color: C.gold }]}>{card.ref}</Text>
            </View>
          ) : null}
          {onAir ? (
            <View style={{ backgroundColor: C.panel, borderRadius: 24, paddingHorizontal: 32, paddingVertical: 22, gap: 6, borderLeftWidth: 6, borderLeftColor: C.gold }}>
              <Text style={[sans(700), { fontSize: 18, color: C.gold, letterSpacing: 1.5 }]}>QUESTION{onAir.name ? ` · ${onAir.name.toUpperCase()}` : ''}</Text>
              <Text style={[sans(600), { fontSize: 32, color: C.ink, lineHeight: 40 }]} numberOfLines={3}>{onAir.body}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
