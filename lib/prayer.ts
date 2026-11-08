// Prayer times, calculated on the device with adhan-js (no API, works offline).
// Settings live on the device and, when signed in, sync to salah_settings so
// they follow the user to other devices.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalculationMethod, Coordinates, Madhab, PrayerTimes, HighLatitudeRule } from 'adhan';
import { supabase } from './supabase';
import { getSavedLocation } from './location';

export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export type AlertMode = 'athan' | 'silent' | 'off';
export type LeadMinutes = 0 | 10 | 15 | 30;
export const LEAD_OPTIONS: LeadMinutes[] = [0, 10, 15, 30];

export const METHODS = {
  NorthAmerica: { label: 'ISNA (North America)', sub: 'Most US masjids' },
  MuslimWorldLeague: { label: 'Muslim World League', sub: 'Europe, Far East' },
  UmmAlQura: { label: 'Umm al-Qura', sub: 'Saudi Arabia' },
  Egyptian: { label: 'Egyptian General Authority', sub: 'Africa, Middle East' },
  Karachi: { label: 'University of Karachi', sub: 'South Asia' },
  Dubai: { label: 'Dubai', sub: 'UAE' },
  Qatar: { label: 'Qatar', sub: '' },
  Kuwait: { label: 'Kuwait', sub: '' },
  MoonsightingCommittee: { label: 'Moonsighting Committee', sub: 'Some North American masjids' },
  Singapore: { label: 'Singapore', sub: 'Southeast Asia' },
  Turkey: { label: 'Turkey (Diyanet)', sub: '' },
  Tehran: { label: 'Tehran', sub: '' },
} as const;
export type MethodKey = keyof typeof METHODS;

export type PrayerLocation = { lat: number; lon: number; label: string; mode: 'auto' | 'manual' };

export type PrayerSettings = {
  method: MethodKey;
  madhab: 'shafi' | 'hanafi';
  alerts: Record<PrayerKey, AlertMode>;
  /** Minutes before each prayer for the countdown banner + heads-up notification. 0 = off. */
  leadMinutes: LeadMinutes;
  location: PrayerLocation | null;
  /** Tracker: streaks are opt-in. */
  streaks: boolean;
  /** Tracker: older prayers owed that the user adds by hand, and how many they've made up. */
  qadaExtra: number;
  qadaMadeUp: number;
  updatedAt: number;
};

export const DEFAULT_SETTINGS: PrayerSettings = {
  method: 'NorthAmerica',
  madhab: 'shafi',
  alerts: { fajr: 'athan', dhuhr: 'athan', asr: 'athan', maghrib: 'athan', isha: 'athan' },
  leadMinutes: 30,
  location: null,
  streaks: false,
  qadaExtra: 0,
  qadaMadeUp: 0,
  updatedAt: 0,
};

export const PRAYER_LABEL: Record<PrayerKey, string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

/** Dhuhr shows as Jumu'ah on Fridays. */
export function prayerName(p: PrayerKey, date: Date): string {
  if (p === 'dhuhr' && date.getDay() === 5) return "Jumu'ah";
  return PRAYER_LABEL[p];
}

// ── Settings store (tiny pub-sub so every screen stays in step) ─────────
const KEY = 'siqa_prayer_settings_v1';
let current: PrayerSettings = DEFAULT_SETTINGS;
let loaded = false;
let loading: Promise<PrayerSettings> | null = null;
const listeners = new Set<(s: PrayerSettings) => void>();

function merge(raw: any): PrayerSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  s.alerts = { ...DEFAULT_SETTINGS.alerts, ...(raw?.alerts ?? {}) };
  if (!(s.method in METHODS)) s.method = 'NorthAmerica';
  if (!LEAD_OPTIONS.includes(s.leadMinutes)) s.leadMinutes = 30;
  return s;
}

export function loadPrayerSettings(): Promise<PrayerSettings> {
  if (loaded) return Promise.resolve(current);
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      current = merge(raw ? JSON.parse(raw) : null);
    } catch {}
    // First run: borrow the location Local & services already has.
    if (!current.location) {
      const loc = await getSavedLocation();
      if (loc && loc.lat != null && loc.lon != null) {
        current = { ...current, location: { lat: loc.lat, lon: loc.lon, label: loc.label, mode: loc.mode === 'auto' ? 'auto' : 'manual' } };
      }
    }
    // Signed in: take the server copy if it's newer.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('salah_settings').select('settings').eq('user_id', session.user.id).maybeSingle();
        const remote = data?.settings ? merge(data.settings) : null;
        if (remote && remote.updatedAt > current.updatedAt) {
          current = { ...remote, location: remote.location ?? current.location };
          AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
        }
      }
    } catch {}
    loaded = true;
    listeners.forEach(l => l(current));
    return current;
  })();
  return loading;
}

export function getPrayerSettings() { return current; }

/** Subscribe to settings changes (returns an unsubscribe). */
export function onPrayerSettingsChange(fn: (s: PrayerSettings) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function updatePrayerSettings(patch: Partial<PrayerSettings>) {
  current = merge({ ...current, ...patch, updatedAt: Date.now() });
  listeners.forEach(l => l(current));
  try { await AsyncStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from('salah_settings').upsert({ user_id: session.user.id, settings: current, updated_at: new Date().toISOString() });
    }
  } catch {}
}

export function usePrayerSettings(): [PrayerSettings, boolean] {
  const [s, setS] = useState(current);
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    const l = (n: PrayerSettings) => { setS(n); setReady(true); };
    listeners.add(l);
    loadPrayerSettings().then(l);
    return () => { listeners.delete(l); };
  }, []);
  return [s, ready];
}

/** Re-render on an interval (1s for countdowns, 30s for strips). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ── Calculation ─────────────────────────────────────────────────────────
export type DayTimes = Record<PrayerKey, Date> & { sunrise: Date; date: Date };

function params(s: PrayerSettings) {
  const p = (CalculationMethod as any)[s.method]();
  p.madhab = s.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  p.highLatitudeRule = HighLatitudeRule.recommended(new Coordinates(s.location!.lat, s.location!.lon));
  return p;
}

export function timesFor(date: Date, s: PrayerSettings): DayTimes | null {
  if (!s.location) return null;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const pt = new PrayerTimes(new Coordinates(s.location.lat, s.location.lon), d, params(s));
  return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha, date: d };
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** yyyy-mm-dd in local time. */
export function dayKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
export function parseDayKey(k: string) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * The prayer day `now` falls in. Until today's Fajr it's still yesterday,
 * so Isha marked at 12:30am counts for the night it belongs to.
 */
export function prayerDay(now: Date, s: PrayerSettings): Date {
  const today = timesFor(now, s);
  if (today && now < today.fajr) return addDays(now, -1);
  if (!today && now.getHours() < 4) return addDays(now, -1);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

export type PrayerInstance = { prayer: PrayerKey; at: Date; day: Date };

/** The next prayer start after `now` (today's or tomorrow's). */
export function nextPrayer(now: Date, s: PrayerSettings): PrayerInstance | null {
  for (let i = 0; i < 2; i++) {
    const d = addDays(now, i);
    const t = timesFor(d, s);
    if (!t) return null;
    for (const p of PRAYERS) if (t[p] > now) return { prayer: p, at: t[p], day: d };
  }
  return null;
}

/** The prayer whose time it currently is, with when its window ends. */
export function currentPrayer(now: Date, s: PrayerSettings): (PrayerInstance & { endsAt: Date }) | null {
  const t0 = timesFor(addDays(now, -1), s);
  const t1 = timesFor(now, s);
  if (!t0 || !t1) return null;
  const seq: { p: PrayerKey; at: Date; end: Date; day: Date }[] = [
    { p: 'isha', at: t0.isha, end: t1.fajr, day: t0.date },
    { p: 'fajr', at: t1.fajr, end: t1.sunrise, day: t1.date },
    { p: 'dhuhr', at: t1.dhuhr, end: t1.asr, day: t1.date },
    { p: 'asr', at: t1.asr, end: t1.maghrib, day: t1.date },
    { p: 'maghrib', at: t1.maghrib, end: t1.isha, day: t1.date },
  ];
  const t2 = timesFor(addDays(now, 1), s)!;
  seq.push({ p: 'isha', at: t1.isha, end: t2.fajr, day: t1.date });
  const hit = seq.find(x => now >= x.at && now < x.end);
  return hit ? { prayer: hit.p, at: hit.at, endsAt: hit.end, day: hit.day } : null;
}

/** On time if logged before that prayer's window closes. */
export function statusIfPrayedNow(day: Date, prayer: PrayerKey, now: Date, s: PrayerSettings): 'on_time' | 'late' {
  const t = timesFor(day, s);
  if (!t) return 'on_time';
  const next = addDays(day, 1);
  const end = prayer === 'fajr' ? t.sunrise
    : prayer === 'dhuhr' ? t.asr
    : prayer === 'asr' ? t.maghrib
    : prayer === 'maghrib' ? t.isha
    : timesFor(next, s)!.fajr;
  return now < end ? 'on_time' : 'late';
}

export function formatTime(d: Date) {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "1h 12m" or "29:41". */
export function formatCountdown(ms: number, clock = false) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (clock) return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

/** True during Ramadan (Umm al-Qura calendar, when the device supports it). */
export function isRamadan(d: Date): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).formatToParts(d);
    const m = parts.find(p => p.type === 'month')?.value;
    return m === '9';
  } catch { return false; }
}
