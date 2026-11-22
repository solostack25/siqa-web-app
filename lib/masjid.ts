// Siqa for Masjids: shared logic for the admin center, the masjid screen (siqa.us/screen)
// and the TV box. Prayer times are calculated on the device with adhan-js from the
// masjid's coordinates, and every time is shown in the masjid's own timezone, so a
// box with the wrong clock zone still shows the right iqamah.

import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import type { MethodKey, PrayerKey } from './prayer';

export const SALAH: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const SALAH_LABEL: Record<PrayerKey, string> = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

export type IqamahRule = { mode: 'offset'; minutes: number } | { mode: 'fixed'; time: string };
export type MasjidSettings = {
  org_id: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string;
  calc_method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  iqamah: Record<PrayerKey, IqamahRule>;
  jummah_times: string[];
  hijri_offset: number;
  countdown_minutes: number;
  ticker: string | null;
  screen_seed_id: string | null;
  updated_at?: string;
};

export type EventKind = 'halaqa' | 'khatirah' | 'class' | 'event';
export const EVENT_KIND_LABEL: Record<EventKind, string> = { halaqa: 'Halaqa', khatirah: 'Khatirah', class: 'Class', event: 'Event' };

export type MasjidEvent = {
  id: string;
  org_id?: string;
  kind: EventKind;
  title: string;
  teacher: string | null;
  description?: string | null;
  room: string | null;
  start_date: string;          // yyyy-mm-dd, masjid local
  start_time: string;          // HH:MM[:SS], masjid local
  duration_min: number;
  repeat_days: number[];       // 0 = Sunday
  end_date: string | null;
  show_on_screens?: boolean;
  countdown_min: number;
  live_on_siqa: boolean;
  registration: 'none' | 'free' | 'paid';
  price_text?: string | null;
  fundraiser_id: string | null;
  cancelled_dates: string[];
};

export type Announcement = { id: string; title: string; body: string | null; image_url: string | null; pinned: boolean; created_at: string };
export type SeedLite = { id: string; title: string; goal_amount: number | null; raised_amount: number | null; donor_count: number | null; cover_image_url: string | null };
export type LiveInfo = { watch_token: string; title: string; playback_url: string; started_at: string; speaker_name: string | null; room?: boolean };

// ── Timezone helpers ────────────────────────────────────────────────────
type Parts = { y: number; m: number; d: number; hh: number; mm: number; ss: number; dow: number };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock parts of an instant in a timezone. */
export function zoned(date: Date, tz: string): Parts {
  const out: any = {};
  for (const p of partsFmt(tz).formatToParts(date)) out[p.type] = p.value;
  return { y: +out.year, m: +out.month, d: +out.day, hh: +out.hour % 24, mm: +out.minute, ss: +out.second, dow: DOW[out.weekday] ?? 0 };
}

/** The instant when the wall clock in `tz` reads y-m-d hh:mm. */
export function zonedToDate(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (t: number) => {
    const p = zoned(new Date(t), tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t); // second pass settles DST edges
  return new Date(t);
}

/** yyyy-mm-dd for the day `date` falls on in `tz`. */
export function dayKeyIn(date: Date, tz: string) {
  const p = zoned(date, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function addDayKey(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function dowOfKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function hm(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h || 0, m || 0];
}
function atKey(key: string, time: string, tz: string) {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hm(time);
  return zonedToDate(y, m, d, h, mi, tz);
}

export function fmtTime(date: Date, tz: string, withAmPm = true) {
  const p = zoned(date, tz);
  const h12 = ((p.hh + 11) % 12) + 1;
  const base = `${h12}:${String(p.mm).padStart(2, '0')}`;
  return withAmPm ? `${base} ${p.hh < 12 ? 'AM' : 'PM'}` : base;
}
/** "13:30" → "1:30 PM". */
export function fmtClock(time: string, withAmPm = true) {
  const [h, m] = hm(time);
  const base = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
  return withAmPm ? `${base} ${h < 12 ? 'AM' : 'PM'}` : base;
}
export function fmtDateLong(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}
export function fmtHijri(date: Date, tz: string, offsetDays = 0) {
  try {
    const d = new Date(date.getTime() + offsetDays * 86400000);
    return new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' })
      .format(d).replace(/\s?AH$/, '') + ' AH';
  } catch { return ''; }
}
/** "12:48" under an hour, "1h 12m" above. */
export function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
export function fmtIn(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── Prayer times + iqamah ───────────────────────────────────────────────
export type SalahRow = { key: PrayerKey; name: string; athan: Date; iqamah: Date; jummah?: string[] };
export type MasjidDay = { key: string; dow: number; sunrise: Date; rows: SalahRow[] };

export const DEFAULT_IQAMAH: Record<PrayerKey, IqamahRule> = {
  fajr: { mode: 'offset', minutes: 20 },
  dhuhr: { mode: 'offset', minutes: 15 },
  asr: { mode: 'offset', minutes: 15 },
  maghrib: { mode: 'offset', minutes: 5 },
  isha: { mode: 'offset', minutes: 15 },
};

export function masjidDay(s: MasjidSettings, key: string): MasjidDay | null {
  if (s.lat == null || s.lon == null) return null;
  const [y, m, d] = key.split('-').map(Number);
  const coords = new Coordinates(s.lat, s.lon);
  const p = ((CalculationMethod as any)[s.calc_method] ?? CalculationMethod.NorthAmerica)();
  p.madhab = s.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  p.highLatitudeRule = HighLatitudeRule.recommended(coords);
  // adhan reads the calendar date from local fields; noon avoids any day slip.
  const pt = new PrayerTimes(coords, new Date(y, m - 1, d, 12), p);
  const dow = dowOfKey(key);
  const rows: SalahRow[] = SALAH.map((k) => {
    const athan: Date = (pt as any)[k];
    const rule = (s.iqamah?.[k] ?? DEFAULT_IQAMAH[k]) as IqamahRule;
    let iqamah = rule.mode === 'fixed' && rule.time ? atKey(key, rule.time, s.timezone)
      : new Date(athan.getTime() + ((rule as any).minutes ?? 10) * 60000);
    if (iqamah < athan) iqamah = athan;
    const isJummah = k === 'dhuhr' && dow === 5 && (s.jummah_times?.length ?? 0) > 0;
    if (isJummah) iqamah = atKey(key, s.jummah_times[0], s.timezone);
    return { key: k, name: isJummah ? "Jumu'ah" : SALAH_LABEL[k], athan, iqamah, jummah: isJummah ? s.jummah_times : undefined };
  });
  return { key, dow, sunrise: pt.sunrise, rows };
}

// ── Schedule ────────────────────────────────────────────────────────────
export type Occurrence = { event: MasjidEvent; dayKey: string; start: Date; end: Date };

export function occursOn(e: MasjidEvent, key: string) {
  if (e.cancelled_dates?.includes(key)) return false;
  if (key < e.start_date) return false;
  if (e.end_date && key > e.end_date) return false;
  if (e.repeat_days?.length) return e.repeat_days.includes(dowOfKey(key));
  return key === e.start_date;
}

export function occurrences(events: MasjidEvent[], fromKey: string, days: number, tz: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDayKey(fromKey, i);
    for (const e of events) {
      if (!occursOn(e, key)) continue;
      const start = atKey(key, e.start_time, tz);
      out.push({ event: e, dayKey: key, start, end: new Date(start.getTime() + e.duration_min * 60000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ── What's next on the screen ───────────────────────────────────────────
export type NextItem =
  | { type: 'salah'; label: string; at: Date; countdownMin: number; row: SalahRow }
  | { type: 'event'; label: string; at: Date; countdownMin: number; occ: Occurrence };

export function upcoming(s: MasjidSettings, events: MasjidEvent[], now: Date): NextItem[] {
  const tz = s.timezone;
  const today = dayKeyIn(now, tz);
  const items: NextItem[] = [];
  for (const key of [today, addDayKey(today, 1)]) {
    const day = masjidDay(s, key);
    if (!day) continue;
    for (const r of day.rows) items.push({ type: 'salah', label: `${r.name} iqamah`, at: r.iqamah, countdownMin: s.countdown_minutes, row: r });
  }
  for (const o of occurrences(events, today, 2, tz)) {
    items.push({ type: 'event', label: o.event.title, at: o.start, countdownMin: o.event.countdown_min, occ: o });
  }
  return items.filter((x) => x.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The item to count down to right now, if one starts within its countdown window. */
export function countdownItem(items: NextItem[], now: Date): NextItem | null {
  for (const it of items) {
    const ms = it.at.getTime() - now.getTime();
    if (it.countdownMin > 0 && ms <= it.countdownMin * 60000) return it;
  }
  return null;
}

/** A salah whose iqamah just happened (show "Iqamah now" for a few minutes). */
export function iqamahNow(s: MasjidSettings, now: Date, minutes = 4): SalahRow | null {
  const day = masjidDay(s, dayKeyIn(now, s.timezone));
  if (!day) return null;
  return day.rows.find((r) => now.getTime() >= r.iqamah.getTime() && now.getTime() < r.iqamah.getTime() + minutes * 60000) ?? null;
}

export function masjidInitials(name: string) {
  const words = name.split(/\s+/).map((w) => w.replace(/^(al|an|as|ar|at|ad|ash|az)-/i, '')).filter((w) => /^[A-Za-z]/.test(w) && !/^(masjid|masjed|mosque|the|of|islamic|center|centre|society)$/i.test(w));
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'M';
}

export const SITE = 'https://www.siqa.us';
export const seedUrl = (id: string) => `${SITE}/seed/${id}`;
export const money = (cents: number | null | undefined) =>
  `$${Math.round((cents ?? 0) / 100).toLocaleString('en-US')}`;

export const US_TIMEZONES = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
];
