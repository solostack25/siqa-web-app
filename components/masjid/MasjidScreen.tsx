// The masjid TV screen: salah times, what's coming up, announcements and the Seed QR code.
// Switches to a big countdown inside the countdown window, to "Iqamah now" right at iqamah,
// and to the live khutbah whenever the masjid's camera is live. Night theme throughout:
// easier on the eyes in a musalla, and kinder to TVs left on all day.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { font } from '../../lib/ds';
import {
  EVENT_KIND_LABEL, fmtClock, fmtCountdown, fmtDateLong, fmtHijri, fmtIn, fmtTime, masjidDay, dayKeyIn, upcoming, countdownItem,
  iqamahNow, masjidInitials, money, seedUrl, type Announcement, type LiveInfo, type MasjidEvent, type MasjidSettings, type SeedLite, type NextItem,
} from '../../lib/masjid';
import { QRCode } from './QRCode';
import { TVStage, Ticker } from './TVStage';
import { LivePlayer } from './LivePlayer';

const C = {
  bg: '#0a0f1c', panel: '#141c30', panel2: '#1b2438', line: '#222b40', ink: '#edf1f7', ink2: '#9facc4', ink3: '#7e89a3',
  gold: '#d4ac73', goldInk: '#e6c290', goldTint: '#2b2618', seed: '#3fa070', seedTint: '#15302a', danger: '#e0664f',
};
const disp = (w: 700 | 800 = 800) => font(w, 'display');
const sans = (w: 400 | 500 | 600 | 700 = 500) => font(w);

export type MasjidScreenData = {
  screen: { id: string; name: string; layout: 'standard' | 'portrait' | 'times_only'; show_live: boolean; live_audio: boolean; power_on: string | null; power_off: string | null };
  masjid: { id: string; name: string; city: string | null; state: string | null; logo_url: string | null };
  settings: MasjidSettings | null;
  events: MasjidEvent[];
  announcements: Announcement[];
  seeds: SeedLite[];
  live: LiveInfo | null;
};

export function MasjidScreen({ data, now, offline }: { data: MasjidScreenData; now: Date; offline?: boolean }) {
  const s = data.settings;
  const tz = s?.timezone ?? 'America/Chicago';
  const portrait = data.screen.layout === 'portrait';
  const [annIdx, setAnnIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAnnIdx((i) => i + 1), 12000);
    return () => clearInterval(t);
  }, []);

  const day = useMemo(() => (s ? masjidDay(s, dayKeyIn(now, tz)) : null), [s, Math.floor(now.getTime() / 60000), tz]);
  const items = useMemo(() => (s ? upcoming(s, data.events, now) : []), [s, data.events, Math.floor(now.getTime() / 15000)]);
  const cd = countdownItem(items, now);
  const iqNow = s ? iqamahNow(s, now) : null;
  const nextSalah = items.find((i) => i.type === 'salah') as Extract<NextItem, { type: 'salah' }> | undefined;
  const seed = pickSeed(data, cd);
  const ann = data.announcements.length ? data.announcements[annIdx % data.announcements.length] : null;
  const live = data.screen.show_live ? data.live : null;

  // Power schedule (the Siqa box also turns the TV off over HDMI-CEC).
  const asleep = isAsleep(data.screen.power_on, data.screen.power_off, now, tz);
  useEffect(() => {
    try { (window as any).SiqaBox?.setScreenPower?.(!asleep); } catch {}
  }, [asleep]);
  if (asleep) return <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#000' }} />;

  if (!s || s.lat == null) {
    return (
      <TVStage>
        <Header data={data} now={now} tz={tz} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 80 }}>
          <Text style={[disp(), { fontSize: 64, color: C.ink, textAlign: 'center' }]}>Almost ready</Text>
          <Text style={[sans(500), { fontSize: 30, color: C.ink2, textAlign: 'center' }]}>Set the masjid's address in Siqa for Masjids → Prayer times, and salah times appear here.</Text>
        </View>
      </TVStage>
    );
  }

  // ── Live khutbah ──────────────────────────────────────────────────────
  if (live) {
    return (
      <TVStage portrait={portrait} bg="#000">
        <LivePlayer src={live.playback_url} muted={!data.screen.live_audio} style={{ position: 'absolute', left: 0, top: 0, width: portrait ? 1080 : 1920, height: portrait ? 608 : 1080 }} />
        <View style={{ position: 'absolute', left: 40, top: 36, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.danger, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 }}>
            <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#fff' }} />
            <Text style={[sans(700), { fontSize: 22, color: '#fff' }]}>LIVE</Text>
          </View>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 }}>
            <Text style={[sans(600), { fontSize: 22, color: '#fff' }]} numberOfLines={1}>{live.title}{live.speaker_name ? ` · ${live.speaker_name}` : ''}</Text>
          </View>
        </View>
        <View style={{ position: 'absolute', left: portrait ? 0 : 40, right: portrait ? 0 : 40, bottom: portrait ? 0 : 36, top: portrait ? 640 : undefined, flexDirection: portrait ? 'column' : 'row', gap: 20, padding: portrait ? 40 : 0 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 28, backgroundColor: 'rgba(10,15,28,0.86)', borderRadius: 24, paddingHorizontal: 32, paddingVertical: 20 }}>
            {day?.rows.map((r) => (
              <View key={r.key} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={[sans(600), { fontSize: 22, color: nextSalah?.row.key === r.key ? C.goldInk : C.ink2 }]}>{r.name}</Text>
                <Text style={[disp(), { fontSize: 40, color: nextSalah?.row.key === r.key ? C.goldInk : C.ink }]}>{r.jummah ? fmtClock(r.jummah[0], false) : fmtTime(r.iqamah, tz, false)}</Text>
              </View>
            ))}
          </View>
          {seed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: 'rgba(10,15,28,0.86)', borderRadius: 24, padding: 16, maxWidth: portrait ? undefined : 560 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 8 }}><QRCode value={seedUrl(seed.id)} size={112} label="Scan to give" /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[sans(700), { fontSize: 16, color: C.gold, letterSpacing: 1 }]}>SCAN TO GIVE</Text>
                <Text style={[sans(700), { fontSize: 24, color: C.ink }]} numberOfLines={2}>{seed.title}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </TVStage>
    );
  }

  // ── Iqamah now ────────────────────────────────────────────────────────
  if (iqNow && data.screen.layout !== 'times_only') {
    return (
      <TVStage portrait={portrait}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <Text style={[sans(600), { fontSize: 34, color: C.goldInk, letterSpacing: 2 }]}>IQAMAH</Text>
          <Text style={[disp(), { fontSize: 180, color: C.ink, letterSpacing: -4 }]}>{iqNow.name}</Text>
          <Text style={[sans(500), { fontSize: 40, color: C.ink2 }]}>Straighten the rows · silence your phones</Text>
        </View>
      </TVStage>
    );
  }

  const ticker = s.ticker?.trim() || (ann ? ann.title : '');
  const width = portrait ? 1080 : 1920;

  // ── Countdown (inside the window before the next iqamah or event) ─────
  if (cd && data.screen.layout !== 'times_only') {
    const total = cd.countdownMin * 60000;
    const left = cd.at.getTime() - now.getTime();
    const pct = Math.max(0, Math.min(1, 1 - left / total));
    return (
      <TVStage portrait={portrait}>
        <Header data={data} now={now} tz={tz} />
        <View style={{ flex: 1, flexDirection: portrait ? 'column' : 'row', gap: 40, padding: 56, paddingBottom: 120 }}>
          <View style={{ flex: 1, gap: 28 }}>
            <View style={{ borderRadius: 32, backgroundColor: C.goldTint, borderWidth: 3, borderColor: C.gold, padding: 52, gap: 14 }}>
              <Text style={[sans(600), { fontSize: 22, color: C.goldInk, letterSpacing: 1 }]}>NEXT · STARTS IN</Text>
              <Text style={[disp(), { fontSize: 210, lineHeight: 210, color: C.ink, letterSpacing: -8 }]}>{fmtCountdown(left)}</Text>
              <Text style={[sans(700), { fontSize: 54, color: C.goldInk }]} numberOfLines={1}>{cd.label} · {fmtTime(cd.at, tz)}</Text>
              <View style={{ height: 16, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)', overflow: 'hidden', marginTop: 8 }}>
                <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: C.gold }} />
              </View>
              <Text style={[sans(500), { fontSize: 26, color: C.ink2 }]}>
                {cd.type === 'salah' ? 'Please silence your phones · straighten the rows' : [cd.occ.event.teacher, cd.occ.event.room, cd.occ.event.live_on_siqa ? 'Also live on Siqa' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <SalahStrip day={day} tz={tz} nextKey={nextSalah?.row.key} compact />
          </View>
          <View style={{ width: portrait ? undefined : 640, gap: 28 }}>
            <ComingUp items={items.filter((i) => i !== cd)} tz={tz} now={now} title="AFTER THAT" max={3} />
            {seed ? <SeedQR seed={seed} /> : null}
          </View>
        </View>
        <Footer text={ticker} width={width} offline={offline} />
      </TVStage>
    );
  }

  // ── Normal ────────────────────────────────────────────────────────────
  const timesOnly = data.screen.layout === 'times_only';
  return (
    <TVStage portrait={portrait}>
      <Header data={data} now={now} tz={tz} />
      <View style={{ flex: 1, flexDirection: portrait || timesOnly ? 'column' : 'row', gap: 40, padding: 56, paddingTop: 40, paddingBottom: 120 }}>
        <View style={{ flex: 1, gap: timesOnly ? 44 : 30, justifyContent: timesOnly ? 'center' : 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={[sans(600), { fontSize: 20, color: C.ink2, letterSpacing: 1 }]}>IQAMAH TIMES</Text>
            {nextSalah ? <Text style={[sans(600), { fontSize: 26, color: C.goldInk }]}>{nextSalah.label} in {fmtIn(nextSalah.at.getTime() - now.getTime())}</Text> : null}
          </View>
          <SalahStrip day={day} tz={tz} nextKey={nextSalah?.row.key} big={timesOnly} />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {s.jummah_times?.length ? (
              <View style={{ flex: 1, backgroundColor: C.panel, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[sans(700), { fontSize: 28, color: C.ink }]}>Jumu'ah</Text>
                <Text style={[disp(), { fontSize: 40, color: C.ink }]}>{s.jummah_times.map((t) => fmtClock(t, false)).join(' · ')}</Text>
              </View>
            ) : null}
            {day ? (
              <View style={{ flex: 1, backgroundColor: C.panel, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[sans(700), { fontSize: 28, color: C.ink2 }]}>Sunrise</Text>
                <Text style={[disp(), { fontSize: 40, color: C.ink2 }]}>{fmtTime(day.sunrise, tz, false)}</Text>
              </View>
            ) : null}
          </View>
          {!timesOnly ? <ComingUp items={items.filter((i) => i.type === 'event')} tz={tz} now={now} title="COMING UP" max={portrait ? 4 : 3} /> : null}
        </View>
        {!timesOnly ? (
          <View style={{ width: portrait ? undefined : 640, gap: 28 }}>
            {ann ? (
              <View style={{ backgroundColor: C.panel, borderRadius: 28, padding: 36, gap: 18, minHeight: 420 }}>
                <Text style={[sans(600), { fontSize: 20, color: C.ink2, letterSpacing: 1 }]}>ANNOUNCEMENT</Text>
                {ann.image_url ? <Image source={{ uri: ann.image_url }} resizeMode="cover" style={{ height: 200, borderRadius: 18, backgroundColor: C.panel2 }} /> : null}
                <Text style={[sans(700), { fontSize: 36, lineHeight: 42, color: C.ink }]} numberOfLines={3}>{ann.title}</Text>
                {ann.body ? <Text style={[sans(500), { fontSize: 24, lineHeight: 32, color: C.ink2 }]} numberOfLines={ann.image_url ? 2 : 5}>{ann.body}</Text> : null}
                {data.announcements.length > 1 ? (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
                    {data.announcements.map((a, i) => (
                      <View key={a.id} style={{ width: i === annIdx % data.announcements.length ? 36 : 8, height: 8, borderRadius: 999, backgroundColor: i === annIdx % data.announcements.length ? C.gold : '#243049' }} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {seed ? <SeedQR seed={seed} /> : null}
          </View>
        ) : null}
      </View>
      <Footer text={ticker} width={width} offline={offline} />
    </TVStage>
  );
}

function pickSeed(data: MasjidScreenData, cd: NextItem | null): SeedLite | null {
  // An event's own Seed wins while it's counting down; else the masjid's chosen Seed (first in the list).
  if (cd?.type === 'event' && cd.occ.event.fundraiser_id) {
    const s = data.seeds.find((x) => x.id === cd.occ.event.fundraiser_id);
    if (s) return s;
  }
  return data.seeds[0] ?? null;
}

function isAsleep(on: string | null, off: string | null, now: Date, tz: string) {
  if (!on || !off) return false;
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(now);
  const cur = p.slice(0, 5);
  const a = on.slice(0, 5), b = off.slice(0, 5);
  return a < b ? !(cur >= a && cur < b) : (cur >= b && cur < a);
}

function Header({ data, now, tz }: { data: MasjidScreenData; now: Date; tz: string }) {
  const m = data.masjid;
  const initials = masjidInitials(m.name);
  return (
    <View style={{ height: 128, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 56, gap: 24, borderBottomWidth: 2, borderBottomColor: C.line }}>
      {m.logo_url ? <Image source={{ uri: m.logo_url }} style={{ width: 76, height: 76, borderRadius: 20 }} /> : (
        <View style={{ width: 76, height: 76, borderRadius: 20, backgroundColor: C.goldTint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[disp(), { fontSize: 28, color: C.goldInk }]}>{initials}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[disp(), { fontSize: 40, lineHeight: 46, color: C.ink, letterSpacing: -1 }]} numberOfLines={1}>{m.name}</Text>
        <Text style={[sans(500), { fontSize: 22, color: C.ink2 }]} numberOfLines={1}>{fmtDateLong(now, tz)} · {fmtHijri(now, tz, data.settings?.hijri_offset ?? 0)}</Text>
      </View>
      <Text style={[disp(), { fontSize: 84, lineHeight: 90, color: C.ink, letterSpacing: -2 }]}>{fmtTime(now, tz, false)}</Text>
      <Text style={[sans(700), { fontSize: 26, color: C.ink2, marginTop: 26 }]}>{fmtTime(now, tz).slice(-2)}</Text>
    </View>
  );
}

function SalahStrip({ day, tz, nextKey, compact, big }: { day: ReturnType<typeof masjidDay>; tz: string; nextKey?: string; compact?: boolean; big?: boolean }) {
  if (!day) return null;
  return (
    <View style={{ flexDirection: 'row', gap: compact ? 12 : 16 }}>
      {day.rows.map((r) => {
        const next = r.key === nextKey;
        return (
          <View key={r.key} style={{
            flex: 1, borderRadius: 24, backgroundColor: next ? C.goldTint : C.panel, alignItems: 'center',
            paddingVertical: compact ? 16 : big ? 72 : 26, gap: compact ? 2 : 8, borderWidth: next ? 3 : 0, borderColor: C.gold,
          }}>
            <Text style={[sans(700), { fontSize: compact ? 24 : big ? 40 : 30, color: next ? C.goldInk : C.ink }]}>{r.name}</Text>
            {!compact ? <Text style={[sans(500), { fontSize: big ? 28 : 22, color: C.ink2 }]}>Athan {fmtTime(r.athan, tz, false)}</Text> : null}
            <Text style={[disp(), { fontSize: compact ? 38 : big ? 84 : 52, color: next ? C.goldInk : C.ink, letterSpacing: -1 }]}>
              {r.jummah ? fmtClock(r.jummah[0], false) : fmtTime(r.iqamah, tz, false)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ComingUp({ items, tz, now, title, max }: { items: NextItem[]; tz: string; now: Date; title: string; max: number }) {
  const list = items.slice(0, max);
  if (!list.length) return null;
  const todayKey = dayKeyIn(now, tz);
  return (
    <View style={{ backgroundColor: title === 'AFTER THAT' ? C.panel : 'transparent', borderRadius: 28, padding: title === 'AFTER THAT' ? 36 : 0 }}>
      <Text style={[sans(600), { fontSize: 20, color: C.ink2, letterSpacing: 1 }]}>{title}</Text>
      {list.map((it, i) => {
        const ev = it.type === 'event' ? it.occ.event : null;
        const sameDay = dayKeyIn(it.at, tz) === todayKey;
        const when = sameDay ? fmtTime(it.at, tz, false) : `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(it.at)} ${fmtTime(it.at, tz, false)}`;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 24, paddingVertical: 20, borderBottomWidth: i === list.length - 1 ? 0 : 2, borderBottomColor: C.line }}>
            <Text style={[disp(), { fontSize: 32, color: C.ink, width: sameDay ? 120 : 190 }]}>{when}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[sans(700), { fontSize: 30, color: C.ink }]} numberOfLines={1}>{it.label}</Text>
              {ev ? <Text style={[sans(500), { fontSize: 22, color: C.ink2 }]} numberOfLines={1}>{[ev.teacher, ev.room, ev.live_on_siqa ? 'also live on Siqa' : null, ev.registration !== 'none' ? 'register on Siqa' : null].filter(Boolean).join(' · ')}</Text> : null}
            </View>
            {ev ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: ev.kind === 'class' || ev.kind === 'event' ? C.seedTint : '#243049' }}>
                <Text style={[sans(700), { fontSize: 18, color: ev.kind === 'class' || ev.kind === 'event' ? C.seed : C.ink }]}>{EVENT_KIND_LABEL[ev.kind]}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function SeedQR({ seed }: { seed: SeedLite }) {
  const pct = seed.goal_amount ? Math.min(1, (seed.raised_amount ?? 0) / seed.goal_amount) : 0;
  return (
    <View style={{ backgroundColor: C.panel, borderRadius: 28, padding: 32, flexDirection: 'row', gap: 28, alignItems: 'center' }}>
      <View style={{ width: 210, height: 210, borderRadius: 20, backgroundColor: '#fff', padding: 16 }}>
        <QRCode value={seedUrl(seed.id)} size={178} label="Scan to give" />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <Text style={[sans(600), { fontSize: 20, color: C.gold, letterSpacing: 1 }]}>SCAN TO GIVE</Text>
        <Text style={[sans(700), { fontSize: 32, lineHeight: 38, color: C.ink }]} numberOfLines={2}>{seed.title}</Text>
        {seed.goal_amount ? (
          <>
            <View style={{ height: 12, borderRadius: 999, backgroundColor: '#243049', overflow: 'hidden' }}>
              <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: C.seed }} />
            </View>
            <Text style={[sans(500), { fontSize: 22, color: C.ink2 }]}><Text style={{ color: C.seed, fontWeight: '700' }}>{money(seed.raised_amount)}</Text> of {money(seed.goal_amount)}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function Footer({ text, width, offline }: { text: string; width: number; offline?: boolean }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, backgroundColor: C.panel, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 40, gap: 24 }}>
      {offline ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: '#33201f' }}>
          <Text style={[sans(700), { fontSize: 18, color: '#f08b74' }]}>OFFLINE · showing saved times</Text>
        </View>
      ) : text ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: C.gold }}>
          <Text style={[sans(700), { fontSize: 18, color: C.bg }]}>NOTICE</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {text ? <Ticker text={text} width={width - 560} style={[sans(500), { fontSize: 26, color: C.ink }]} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.gold, fontSize: 24, fontWeight: '700' }}>ص</Text>
        </View>
        <Text style={[sans(600), { fontSize: 22, color: C.ink2 }]}>Follow us on Siqa</Text>
      </View>
    </View>
  );
}
