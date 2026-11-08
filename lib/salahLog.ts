// Salah Tracker storage. Signed in: salah_log in Supabase (owner-only RLS).
// Signed out: kept on this device, and moved to the account on sign-in.
// Private: never shown on profiles, never used for feeds, Insights or ads.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { PRAYERS, type PrayerKey } from './prayer';

export type SalahStatus = 'on_time' | 'late' | 'missed' | 'excused';
export type SalahEntry = { status: SalahStatus; jamaah: boolean; prayed_at: string | null };
export type DayLog = Partial<Record<PrayerKey, SalahEntry>>;
export type Log = Record<string, DayLog>; // dayKey → prayers

const LOCAL_KEY = 'siqa_salah_log_v1';
let cache: Log = {};
let userId: string | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

async function readLocal(): Promise<Log> {
  try { const r = await AsyncStorage.getItem(LOCAL_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
async function writeLocal(l: Log) {
  try { await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(l)); } catch {}
}

async function load() {
  const { data: { session } } = await supabase.auth.getSession();
  userId = session?.user.id ?? null;
  const local = await readLocal();
  if (!userId) { cache = local; loaded = true; emit(); return; }

  // Move anything logged while signed out onto the account.
  const rows = Object.entries(local).flatMap(([day, d]) =>
    Object.entries(d).map(([prayer, e]) => ({ user_id: userId, day, prayer, ...(e as SalahEntry), updated_at: new Date().toISOString() })));
  if (rows.length) {
    const { error } = await supabase.from('salah_log').upsert(rows, { onConflict: 'user_id,day,prayer', ignoreDuplicates: true });
    if (!error) await AsyncStorage.removeItem(LOCAL_KEY).catch(() => {});
  }

  const { data } = await supabase.from('salah_log').select('day, prayer, status, jamaah, prayed_at').eq('user_id', userId).limit(5000);
  const next: Log = {};
  for (const r of (data ?? []) as any[]) {
    (next[r.day] ??= {})[r.prayer as PrayerKey] = { status: r.status, jamaah: !!r.jamaah, prayed_at: r.prayed_at };
  }
  cache = next;
  loaded = true;
  emit();
}

export function loadSalahLog(force = false) {
  if (force) { loaded = false; loading = null; }
  if (loaded) return Promise.resolve();
  return (loading ??= load().catch(() => { loaded = true; emit(); }));
}

// Re-load when the account changes.
supabase.auth.onAuthStateChange((event, session) => {
  if ((session?.user.id ?? null) !== userId && (event === 'SIGNED_IN' || event === 'SIGNED_OUT')) {
    setTimeout(() => { loadSalahLog(true); }, 0);
  }
});

export function useSalahLog(): { log: Log; ready: boolean; signedIn: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    loadSalahLog();
    return () => { listeners.delete(l); };
  }, []);
  return { log: cache, ready: loaded, signedIn: !!userId };
}

export async function setSalah(day: string, prayer: PrayerKey, entry: SalahEntry | null) {
  const d = { ...(cache[day] ?? {}) };
  if (entry) d[prayer] = entry; else delete d[prayer];
  cache = { ...cache, [day]: d };
  emit();
  if (!userId) { await writeLocal(cache); return; }
  if (entry) {
    await supabase.from('salah_log').upsert({ user_id: userId, day, prayer, ...entry, updated_at: new Date().toISOString() });
  } else {
    await supabase.from('salah_log').delete().eq('user_id', userId).eq('day', day).eq('prayer', prayer);
  }
}

/** Excused day: every prayer that day is marked excused (or cleared). */
export async function setDayExcused(day: string, excused: boolean) {
  for (const p of PRAYERS) {
    const cur = cache[day]?.[p];
    if (excused) await setSalah(day, p, { status: 'excused', jamaah: false, prayed_at: null });
    else if (cur?.status === 'excused') await setSalah(day, p, null);
  }
}

export function isDayExcused(d?: DayLog) {
  return !!d && PRAYERS.every(p => d[p]?.status === 'excused');
}

/** Days in a row (ending today or yesterday) with all five logged, or excused. */
export function streakDays(log: Log, todayKey: string, prevKey: (k: string) => string): number {
  const full = (d?: DayLog) => !!d && PRAYERS.every(p => d[p] && d[p]!.status !== 'missed');
  let k = full(log[todayKey]) ? todayKey : prevKey(todayKey);
  let n = 0;
  while (full(log[k])) { n++; k = prevKey(k); }
  return n;
}

export function missedCount(log: Log) {
  let n = 0;
  for (const d of Object.values(log)) for (const e of Object.values(d)) if (e?.status === 'missed') n++;
  return n;
}

export function toCsv(log: Log) {
  const lines = ['day,prayer,status,jamaah,prayed_at'];
  for (const day of Object.keys(log).sort()) {
    for (const p of PRAYERS) {
      const e = log[day][p];
      if (e) lines.push([day, p, e.status, e.jamaah ? 'yes' : 'no', e.prayed_at ?? ''].join(','));
    }
  }
  return lines.join('\n');
}

export async function deleteAllSalah() {
  cache = {};
  emit();
  await AsyncStorage.removeItem(LOCAL_KEY).catch(() => {});
  if (userId) await supabase.from('salah_log').delete().eq('user_id', userId);
}
