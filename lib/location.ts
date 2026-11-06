import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * The viewer's location for local results (Local & services, and anything
 * else that wants "near me"). Saved on the device:
 *  - auto:     use the device's current location (asks permission once)
 *  - manual:   a city, state or ZIP the viewer typed
 *  - anywhere: no location filter
 *
 * Geocoding uses free public services from the viewer's browser:
 *  - BigDataCloud reverse-geocode-client (coordinates → city/state/ZIP)
 *  - OpenStreetMap Nominatim search (typed place → coordinates)
 * If either is unavailable, typed places fall back to plain city/state/ZIP
 * matching.
 */

export type LocationMode = 'auto' | 'manual' | 'anywhere';

export type SavedLocation = {
  mode: LocationMode;
  label: string;
  lat?: number | null;
  lon?: number | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  radius: number; // miles
  updatedAt: number;
};

const KEY = 'siqa_location_v1';
const ASKED_KEY = 'siqa_location_asked_v1';
export const RADIUS_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_RADIUS = 25;

export const ANYWHERE: SavedLocation = { mode: 'anywhere', label: 'Anywhere', radius: DEFAULT_RADIUS, updatedAt: 0 };

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const STATE_CODES = new Set(Object.values(US_STATES));

export function stateCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (t.length === 2 && STATE_CODES.has(t.toUpperCase())) return t.toUpperCase();
  return US_STATES[t.toLowerCase()] ?? null;
}

export async function getSavedLocation(): Promise<SavedLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedLocation) : null;
  } catch {
    return null;
  }
}

export async function saveLocation(loc: SavedLocation) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify({ ...loc, updatedAt: Date.now() })); } catch {}
}

export async function clearLocation() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

export async function hasAskedBefore() {
  try { return (await AsyncStorage.getItem(ASKED_KEY)) === '1'; } catch { return true; }
}
async function markAsked() {
  try { await AsyncStorage.setItem(ASKED_KEY, '1'); } catch {}
}

// Native (iOS/Android) uses expo-location; web uses the browser API.
const ExpoLocation: typeof import('expo-location') | null =
  Platform.OS === 'web' ? null : require('expo-location');

/** 'granted' | 'prompt' | 'denied' | 'unsupported' */
export async function locationPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (ExpoLocation) {
    try {
      const p = await ExpoLocation.getForegroundPermissionsAsync();
      if (p.status === 'granted') return 'granted';
      if (p.status === 'denied' && !p.canAskAgain) return 'denied';
      return 'prompt';
    } catch { return 'unsupported'; }
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  try {
    const p: any = await (navigator as any).permissions?.query({ name: 'geolocation' });
    if (p?.state === 'granted' || p?.state === 'denied' || p?.state === 'prompt') return p.state;
  } catch {}
  return 'prompt';
}

export function deviceLocationSupported() {
  if (ExpoLocation) return true;
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/** Current device coordinates, or null if unavailable / refused. */
export async function getDeviceCoords(timeoutMs = 10000): Promise<{ lat: number; lon: number } | null> {
  if (!deviceLocationSupported()) return null;
  markAsked();
  if (ExpoLocation) {
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return null;
      const last = await ExpoLocation.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
      if (last) return { lat: last.coords.latitude, lon: last.coords.longitude };
      const pos = await Promise.race([
        ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }),
        new Promise<null>(r => setTimeout(() => r(null), timeoutMs)),
      ]);
      return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
    } catch { return null; }
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Coordinates → city / state / ZIP. */
export async function reverseGeocode(lat: number, lon: number) {
  const d = await fetchJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
  );
  if (!d) return null;
  const city: string | null = d.city || d.locality || null;
  const state = (typeof d.principalSubdivisionCode === 'string' && d.principalSubdivisionCode.startsWith('US-'))
    ? d.principalSubdivisionCode.slice(3) : stateCode(d.principalSubdivision);
  return { city, state, zip: d.postcode ? String(d.postcode).slice(0, 5) : null };
}

/** Typed place ("Katy, TX", "77494", "Houston") → coordinates. */
export async function geocodePlace(text: string) {
  const q = text.trim();
  if (!q) return null;
  const isZip = /^\d{5}$/.test(q);
  const url = isZip
    ? `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=1&addressdetails=1&postalcode=${q}`
    : `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
  const d = await fetchJson(url);
  const hit = Array.isArray(d) ? d[0] : null;
  if (!hit) return null;
  const a = hit.address ?? {};
  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    city: a.city || a.town || a.village || a.hamlet || a.suburb || null,
    state: stateCode(a.state) ?? null,
    zip: a.postcode ? String(a.postcode).slice(0, 5) : isZip ? q : null,
  };
}

/** Plain-text fallback: "77494" → zip, "TX" → state, "Katy, TX" → city + state, "Houston" → city. */
export function parsePlace(text: string): { city: string | null; state: string | null; zip: string | null } {
  const t = text.trim();
  const zip = t.match(/\b(\d{5})\b/)?.[1] ?? null;
  if (zip) return { city: null, state: null, zip };
  const parts = t.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state: stateCode(parts[parts.length - 1]), zip: null };
  const st = stateCode(t);
  if (st) return { city: null, state: st, zip: null };
  return { city: t || null, state: null, zip: null };
}

export function labelFor(p: { city?: string | null; state?: string | null; zip?: string | null }, fallback = 'your area') {
  const cs = [p.city, p.state].filter(Boolean).join(', ');
  return cs || p.zip || fallback;
}

/** Resolve "use my current location" into a saved location. */
export async function locateDevice(radius = DEFAULT_RADIUS): Promise<SavedLocation | null> {
  const coords = await getDeviceCoords();
  if (!coords) return null;
  const place = await reverseGeocode(coords.lat, coords.lon);
  return {
    mode: 'auto', lat: coords.lat, lon: coords.lon,
    city: place?.city ?? null, state: place?.state ?? null, zip: place?.zip ?? null,
    label: labelFor(place ?? {}, 'your location'), radius, updatedAt: Date.now(),
  };
}

/** Resolve a typed place into a saved location (coordinates when possible). */
export async function locateText(text: string, radius = DEFAULT_RADIUS): Promise<SavedLocation | null> {
  const t = text.trim();
  if (!t) return null;
  const geo = await geocodePlace(t);
  if (geo) {
    return { mode: 'manual', ...geo, label: labelFor(geo, t), radius, updatedAt: Date.now() };
  }
  const p = parsePlace(t);
  return { mode: 'manual', lat: null, lon: null, ...p, label: labelFor(p, t), radius, updatedAt: Date.now() };
}

/** Haversine distance in miles. */
export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
