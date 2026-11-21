// Sample data for previewing the TV screens without pairing a device:
//   siqa.us/screen?demo=normal | countdown | live | times | portrait     siqa.us/tv?demo=home
import { DEFAULT_IQAMAH, addDayKey, dayKeyIn, dowOfKey, type MasjidSettings } from '../../lib/masjid';

export function demoState(kind: string, now: Date): any {
  const tz = 'America/Chicago';
  const settings: MasjidSettings = {
    org_id: 'demo', address: 'Houston, TX', lat: 29.7174, lon: -95.5544, timezone: tz, calc_method: 'NorthAmerica', madhab: 'shafi',
    iqamah: DEFAULT_IQAMAH, jummah_times: ['13:30', '14:30'], hijri_offset: 0, countdown_minutes: 30,
    ticker: 'Please park in marked spaces only · Sunday school registration is open on Siqa', screen_seed_id: null,
  };
  const today = dayKeyIn(now, tz);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(now);
  const [h, m] = p.split(':').map(Number);
  const at = (mins: number) => { const t = h * 60 + m + mins; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  const ev = (o: any) => ({ id: Math.random().toString(36).slice(2), kind: 'halaqa', teacher: null, room: null, start_date: today, duration_min: 60, repeat_days: [], end_date: null, countdown_min: 30, live_on_siqa: false, registration: 'none', fundraiser_id: null, cancelled_dates: [], ...o });
  const events = [
    ev({ kind: 'class', title: 'Youth class', teacher: 'Br. Yusuf', room: 'Youth room', start_time: kind === 'countdown' ? at(12) : at(95), live_on_siqa: true, fundraiser_id: 'seed1' }),
    ev({ kind: 'khatirah', title: 'Patience in hard times', teacher: 'Imam Ahmad', room: 'Main hall', start_time: at(240) }),
    ev({ kind: 'halaqa', title: 'Tafsir of Surah Al-Kahf', teacher: 'Shaykh Omar', start_date: addDayKey(today, 1), start_time: '20:00', repeat_days: [dowOfKey(addDayKey(today, 1))], registration: 'free' }),
  ];
  const base = {
    status: 'paired', mode: 'masjid',
    screen: { id: 'demo', name: 'Main hall TV', layout: kind === 'times' ? 'times_only' : kind === 'portrait' ? 'portrait' : 'standard', show_live: true, live_audio: false, power_on: null, power_off: null },
    masjid: { id: 'demo', name: 'Masjid An-Noor', city: 'Houston', state: 'TX', logo_url: null },
    settings,
    events: kind === 'countdown' ? events : events.slice(1).concat([{ ...events[0], start_time: at(95) }]),
    announcements: [
      { id: 'a1', title: 'Sunday school registration is open', body: 'Ages 5 to 14. Sign up on Siqa or at the front desk.', image_url: null, pinned: true, created_at: new Date().toISOString() },
      { id: 'a2', title: 'Food drive this Saturday', body: 'Drop off canned food in the lobby after Fajr.', image_url: null, pinned: false, created_at: new Date().toISOString() },
    ],
    seeds: [{ id: 'seed1', title: 'Youth program fund', goal_amount: 2500000, raised_amount: 700000, donor_count: 48, cover_image_url: null }],
    live: kind === 'live' ? { watch_token: 'demo', title: "Jumu'ah khutbah", playback_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', started_at: new Date().toISOString(), speaker_name: 'Shaykh Shamikh' } : null,
  };
  if (kind === 'home') {
    return { status: 'paired', mode: 'home', screen: { id: 'demo', name: 'Living room TV' }, user: { id: 'demo', name: 'Gemma' }, following_speakers: [], following_masjids: [] };
  }
  return base;
}
