// Siqa Events (banquets, conferences): shared types and helpers for the dashboard, event devices and guest pages.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const SITE = 'https://siqa.us';
export const FUNCTIONS_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co/functions/v1';
const ANON = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

export type EventStatus = 'draft' | 'published' | 'live' | 'ended';
export type StageMode = 'auto' | 'welcome' | 'program' | 'appeal' | 'slides' | 'speaker' | 'video' | 'thanks';
export type DeviceRole = 'stage' | 'podium' | 'mc' | 'registration' | 'volunteer';
export type SegmentKind = 'welcome' | 'talk' | 'recitation' | 'video' | 'appeal' | 'meal' | 'other';
export type Ladder = { amount_cents: number; label?: string }[];

export type EventRow = {
  id: string; org_id: string; slug: string; title: string; kind: string; starts_at: string | null; doors_at: string | null;
  venue: string | null; address: string | null; about: string | null; cover_url: string | null; in_person: boolean; online: boolean;
  fundraiser_id: string | null; goal_cents: number; pre_raised_cents: number; match_cents: number; match_by: string | null;
  ladder: Ladder; ladder_index: number | null; ask_names: boolean; ask_diet: boolean; checkout_gift: boolean; door_sales: boolean;
  status: EventStatus; stage_mode: StageMode; online_watch_token: string | null;
};
export type TicketType = {
  id: string; event_id: string; name: string; description: string | null; price_cents: number; quantity: number | null;
  kind: 'in_person' | 'online'; seats: number; deductible_cents: number; sort: number; active: boolean;
};
export type Segment = {
  id: string; title: string; speaker: string | null; kind: SegmentKind; minutes: number; remote: boolean;
  script?: string | null; slides: string[]; video_url: string | null; sort?: number;
};
export type Totals = {
  raised_cents: number; tonight_cents: number; goal_cents: number; donors: number; match_cents: number; match_used_cents: number;
  by_method?: Record<string, number>; pledged_cents: number; unconfirmed_cents?: number; checked_in?: number; attendees?: number;
  online_attendees?: number; feed: { name: string; amount_cents: number; method: string; at: string }[];
};
export type EventMessage = {
  id: string; from_label: string; from_role: string | null; to_role: string; body: string; urgent: boolean;
  kind: 'message' | 'change_request'; change: any; status: 'new' | 'ack' | 'approved' | 'declined'; created_at: string;
};
export type LiveState = {
  event: {
    id: string; slug: string; title: string; kind: string; status: EventStatus; starts_at: string | null; venue: string | null;
    goal_cents: number; match_cents: number; match_by: string | null; ladder: Ladder; ladder_index: number | null;
    stage_mode: StageMode; slide_index: number; current_segment_id: string | null; segment_started_at: string | null;
    segment_extra_min: number; online_watch_token: string | null; fundraiser_id: string | null; org_name: string | null; org_logo: string | null;
  };
  segments: Segment[];
  totals: Totals;
  messages: EventMessage[];
  server_now: string;
  devices?: { id: string; role: DeviceRole; name: string; last_seen_at: string | null }[];
  // device-only
  status?: 'paired' | 'unpaired' | 'unknown';
  role?: DeviceRole;
  name?: string;
  pair_code?: string;
};

export const ROLE_INFO: Record<DeviceRole, { label: string; icon: string; sub: string }> = {
  stage: { label: 'Big screen', icon: 'tv-outline', sub: 'The projector or TV everyone sees: program, slides, the giving thermometer.' },
  podium: { label: 'Podium', icon: 'mic-outline', sub: 'A tablet on the lectern: the speaker\'s script, a countdown timer and slide controls.' },
  mc: { label: 'MC', icon: 'headset-outline', sub: 'The emcee\'s phone: run of show, Next button, and messages read aloud in their earbud.' },
  registration: { label: 'Registration', icon: 'qr-code-outline', sub: 'Check-in desk: scan tickets, find names, add walk-ins.' },
  volunteer: { label: 'Volunteer', icon: 'hand-left-outline', sub: 'Floor volunteers: log cash, checks and pledges, message the MC.' },
};
export const SEGMENT_KINDS: { value: SegmentKind; label: string }[] = [
  { value: 'welcome', label: 'Welcome' }, { value: 'recitation', label: 'Quran' }, { value: 'talk', label: 'Talk' },
  { value: 'video', label: 'Video' }, { value: 'appeal', label: 'Appeal' }, { value: 'meal', label: 'Dinner' }, { value: 'other', label: 'Other' },
];
export const STATUS_LABEL: Record<EventStatus, string> = { draft: 'Draft', published: 'On sale', live: 'Live now', ended: 'Ended' };

export const usd = (cents: number | null | undefined, exact = false) => {
  const v = (cents ?? 0) / 100;
  return exact && v % 1 ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${Math.round(v).toLocaleString('en-US')}`;
};
export const shortUsd = (cents: number) => {
  const v = cents / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K`;
  return `$${Math.round(v)}`;
};
/** "250" / "$1,500.50" → cents, or null. */
export const parseUsd = (s: string): number | null => {
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
export const dollarsText = (cents: number | null | undefined) => (cents ? String(cents / 100) : '');

export const whenText = (iso: string | null | undefined) => {
  if (!iso) return 'Date to be announced';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const timeText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

export const eventUrl = (slug: string) => `${SITE}/e/${slug}`;
export const giveUrl = (slug: string) => `${SITE}/e/${slug}/give`;

/** Current segment, its position, and seconds left (negative = over time). */
export function segmentClock(s: LiveState | null, skew: number) {
  if (!s) return { cur: null as Segment | null, index: -1, next: null as Segment | null, left: 0, total: 0 };
  const index = Math.max(0, s.segments.findIndex((x) => x.id === s.event.current_segment_id));
  const cur = s.segments[index] ?? null;
  const next = s.segments[index + 1] ?? null;
  const total = cur ? (cur.minutes + (s.event.segment_extra_min || 0)) * 60 : 0;
  const started = s.event.segment_started_at ? new Date(s.event.segment_started_at).getTime() : null;
  const now = Date.now() + skew;
  const left = started && s.event.status === 'live' ? Math.round(total - (now - started) / 1000) : total;
  return { cur, index, next, left, total };
}
export const clockText = (sec: number) => {
  const neg = sec < 0;
  const a = Math.abs(sec);
  return `${neg ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
};

/** Polls a state RPC every `ms`; returns state, skew (server − local ms), refresh, and an act() helper. */
export function useLivePoll(fetcher: (() => Promise<LiveState | null>) | null, ms = 2000) {
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const f = useRef(fetcher);
  f.current = fetcher;
  const refresh = useCallback(async () => {
    if (!f.current) return;
    try {
      const s = await f.current();
      setState(s);
      setError(null);
      if (s?.server_now) setSkew(new Date(s.server_now).getTime() - Date.now());
    } catch (e: any) {
      setError(e?.message ?? 'Connection problem');
    }
  }, []);
  useEffect(() => {
    if (!fetcher) return;
    refresh();
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
  }, [!!fetcher, ms, refresh]);
  return { state, error, skew, refresh };
}

/** Ticks once a second, for countdowns. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

// ── Team (dashboard) ───────────────────────────────────────────────────
export async function teamState(eventId: string): Promise<LiveState> {
  const { data, error } = await supabase.rpc('event_team_state', { p_event: eventId });
  if (error) throw error;
  return data as LiveState;
}
export async function teamAct(eventId: string, action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('event_team_act', { p_event: eventId, p_action: action, p_payload: payload });
  if (error) throw error;
  return data as any;
}

// ── Devices ─────────────────────────────────────────────────────────────
const DEVICE_KEY = 'siqa_event_device';
export function readDeviceToken(): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(DEVICE_KEY); } catch { return null; }
}
export function writeDeviceToken(t: string | null) {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try { if (t) localStorage.setItem(DEVICE_KEY, t); else localStorage.removeItem(DEVICE_KEY); } catch { /* private mode */ }
}
export async function deviceState(token: string): Promise<LiveState> {
  const { data, error } = await supabase.rpc('event_device_state', { p_device_token: token });
  if (error) throw error;
  return data as LiveState;
}
export async function deviceAct(token: string, action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('event_device_act', { p_device_token: token, p_action: action, p_payload: payload });
  if (error) throw error;
  return data as any;
}

// ── Payments ────────────────────────────────────────────────────────────
export async function eventPay(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_URL}/event-pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ANON}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || 'Payment could not start. Try again.');
  return json as { clientSecret?: string; paymentIntentId?: string; testMode?: boolean; orderToken?: string; free?: boolean; ok?: boolean };
}

// ── Media ───────────────────────────────────────────────────────────────
export async function uploadEventFile(eventId: string, file: Blob, ext: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again to upload.');
  const path = `${user.id}/${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('event-media').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return supabase.storage.from('event-media').getPublicUrl(path).data.publicUrl;
}

/** Opens the browser's file picker (web only). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') { resolve([]); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

/** Turns a PDF (exported from PowerPoint, Keynote or Google Slides) into one JPEG per page, in the browser. */
export async function pdfToImages(file: File, onPage?: (n: number, of: number) => void): Promise<Blob[]> {
  const load = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
  const pdfjs = await load('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Blob[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages);
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 1920 / base.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    out.push(await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.88)));
  }
  return out;
}

/** Speaks text out loud after a short chime (MC earbud alerts). */
export function speak(text: string, chime = true) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const say = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    synth.speak(u);
  };
  if (!chime) { say(); return; }
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.4);
    setTimeout(() => { say(); ctx.close?.(); }, 420);
  } catch { say(); }
}

/** Keeps the screen awake while a device page is open (where supported). */
export function useWakeLock(on = true) {
  useEffect(() => {
    if (!on || Platform.OS !== 'web' || typeof navigator === 'undefined' || !(navigator as any).wakeLock) return;
    let lock: any = null;
    const get = async () => { try { lock = await (navigator as any).wakeLock.request('screen'); } catch { /* ignore */ } };
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.(); };
  }, [on]);
}
