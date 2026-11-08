// Athan + heads-up notifications on the phone app (expo-notifications).
// The web app has no background alerts; it shows the in-app banner instead.
//
// iOS keeps at most 64 scheduled local notifications, so we schedule a
// rolling window (up to 60) and re-schedule every time the app opens or
// settings change. Someone who doesn't open Siqa for about a week stops
// getting alerts until they open it again.
//
// Athan sound: put the recording at assets/sounds/athan.wav (under 30s,
// one you have the rights to), add it to the expo-notifications plugin's
// "sounds" in app.json, set ATHAN_SOUND below to 'athan.wav', and rebuild.
// Until then Athan alerts use the phone's default notification sound.

import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import {
  PRAYERS, addDays, dayKey, getPrayerSettings, loadPrayerSettings, prayerName, statusIfPrayedNow,
  timesFor, isRamadan, onPrayerSettingsChange, type PrayerKey, type PrayerSettings,
} from './prayer';
import { setSalah } from './salahLog';

export const ATHAN_SOUND: string | null = null;
const MAX_SCHEDULED = 60;
const CATEGORY = 'prayer';
const MARK_ACTION = 'mark-prayed';

// The 2.0 App Store build doesn't include the native module; never crash on it.
let N: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  try {
    N = require('expo-notifications');
    // Touch the native side once; throws if the module isn't in this build.
    N!.getPermissionsAsync;
  } catch { N = null; }
}

export const nativeAlertsAvailable = () => !!N;

export async function notificationPermission(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!N) return 'unsupported';
  try { return (await N.getPermissionsAsync()).status as any; } catch { return 'unsupported'; }
}

export async function requestNotificationPermission() {
  if (!N) return false;
  try {
    const r = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return r.status === 'granted';
  } catch { return false; }
}

let setupDone = false;
async function setup() {
  if (!N || setupDone) return;
  setupDone = true;
  N.setNotificationHandler({
    handleNotification: async (n) => {
      const silent = (n.request.content.data as any)?.silent;
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !silent, shouldSetBadge: false };
    },
  });
  await N.setNotificationCategoryAsync(CATEGORY, [
    { identifier: MARK_ACTION, buttonTitle: 'Mark as prayed', options: { opensAppToForeground: true } },
  ]).catch(() => {});
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('athan', {
      name: 'Athan', importance: N.AndroidImportance.HIGH, sound: ATHAN_SOUND ?? 'default',
    }).catch(() => {});
    await N.setNotificationChannelAsync('prayer-silent', {
      name: 'Prayer reminders (silent)', importance: N.AndroidImportance.DEFAULT, sound: null as any, vibrationPattern: [0],
    }).catch(() => {});
  }
}

type Planned = { at: Date; title: string; body: string; silent: boolean; data: any };

function plan(s: PrayerSettings, now: Date): Planned[] {
  const out: Planned[] = [];
  for (let i = 0; i < 8 && out.length < MAX_SCHEDULED; i++) {
    const day = addDays(now, i);
    const t = timesFor(day, s);
    if (!t) break;
    const ramadan = isRamadan(day);
    for (const p of PRAYERS) {
      const mode = s.alerts[p];
      if (mode === 'off') continue;
      const name = prayerName(p, day);
      const base = { prayer: p, day: dayKey(day), kind: 'prayer' };
      if (s.leadMinutes > 0) {
        const lead = new Date(t[p].getTime() - s.leadMinutes * 60000);
        const title = ramadan && p === 'fajr' ? `Suhoor ends in ${s.leadMinutes} minutes`
          : ramadan && p === 'maghrib' ? `Iftar in ${s.leadMinutes} minutes`
          : `${name} in ${s.leadMinutes} minutes`;
        if (lead > now) out.push({ at: lead, title, body: `${name} begins at ${fmt(t[p])}`, silent: true, data: { ...base, lead: true, silent: true } });
      }
      if (t[p] > now) {
        out.push({
          at: t[p],
          title: ramadan && p === 'maghrib' ? `It's time for Iftar and ${name}` : `It's time for ${name}`,
          body: mode === 'athan' ? 'Allahu Akbar, Allahu Akbar' : 'Tap Mark as prayed when you’re done',
          silent: mode === 'silent',
          data: { ...base, silent: mode === 'silent' },
        });
      }
    }
  }
  return out.sort((a, b) => +a.at - +b.at).slice(0, MAX_SCHEDULED);
}

function fmt(d: Date) {
  const h = d.getHours();
  return `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

let running: Promise<void> | null = null;
/** Cancel and re-create every prayer notification from the current settings. */
export function reschedulePrayerNotifications() {
  if (!N) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      await setup();
      const s = await loadPrayerSettings();
      const all = await N!.getAllScheduledNotificationsAsync();
      await Promise.all(all.filter(n => (n.content.data as any)?.kind === 'prayer').map(n => N!.cancelScheduledNotificationAsync(n.identifier)));
      if (!s.location) return;
      if ((await N!.getPermissionsAsync()).status !== 'granted') return;
      for (const p of plan(s, new Date())) {
        await N!.scheduleNotificationAsync({
          content: {
            title: p.title,
            body: p.body,
            data: p.data,
            sound: p.silent ? false : (ATHAN_SOUND && !p.data.lead ? ATHAN_SOUND : 'default'),
            categoryIdentifier: p.data.lead ? undefined : CATEGORY,
            interruptionLevel: p.silent ? 'passive' : 'timeSensitive',
          } as any,
          trigger: {
            type: N!.SchedulableTriggerInputTypes.DATE,
            date: p.at,
            channelId: p.silent ? 'prayer-silent' : 'athan',
          } as any,
        });
      }
    } catch {}
  })().finally(() => { running = null; });
  return running;
}

/** Mount once at the app root: schedules on open/foreground, handles "Mark as prayed". */
export function usePrayerNotifications() {
  useEffect(() => {
    if (!N) return;
    reschedulePrayerNotifications();
    const app = AppState.addEventListener('change', st => { if (st === 'active') reschedulePrayerNotifications(); });
    const sub = N.addNotificationResponseReceivedListener(resp => {
      if (resp.actionIdentifier !== MARK_ACTION) return;
      const d = resp.notification.request.content.data as any;
      if (!d?.prayer || !d?.day) return;
      const [y, m, dd] = String(d.day).split('-').map(Number);
      const status = statusIfPrayedNow(new Date(y, m - 1, dd, 12), d.prayer as PrayerKey, new Date(), getPrayerSettings());
      setSalah(d.day, d.prayer, { status, jamaah: false, prayed_at: new Date().toISOString() });
    });
    // Settings changed (alert mode, lead time, location): re-plan, debounced.
    let t: any;
    const off = onPrayerSettingsChange(() => { clearTimeout(t); t = setTimeout(reschedulePrayerNotifications, 800); });
    return () => { app.remove(); sub.remove(); off(); clearTimeout(t); };
  }, []);
}
