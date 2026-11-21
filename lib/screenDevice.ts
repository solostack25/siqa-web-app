// The device side of Siqa screens and TV boxes (siqa.us/screen and siqa.us/tv).
// A device keeps one token for good. Inside the Android TV app the token lives in the
// app (window.SiqaBox); in a plain browser it lives in localStorage.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

type Bridge = {
  getToken?: () => string | null;
  setToken?: (t: string) => void;
  info?: () => string;              // JSON: version, model, ssid, signal, resolution
  reboot?: () => void;
  syncWifi?: (json: string) => void; // [{ssid,password,security}]
  setMode?: (mode: string) => void;  // 'masjid' | 'home' | 'unpaired'
};
const bridge = (): Bridge | null => (Platform.OS === 'web' && typeof window !== 'undefined' ? (window as any).SiqaBox ?? null : null);

const KEY = 'siqa_screen_token_v1';
export function readToken(): string | null {
  const b = bridge();
  try { const t = b?.getToken?.(); if (t) return t; } catch {}
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; } catch { return null; }
}
function writeToken(t: string) {
  try { bridge()?.setToken?.(t); } catch {}
  try { localStorage.setItem(KEY, t); } catch {}
}
export function forgetToken() {
  try { localStorage.removeItem(KEY); } catch {}
}

function deviceInfo() {
  const base: Record<string, unknown> = {};
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    base.resolution = `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`;
    base.ua = navigator.userAgent.slice(0, 160);
    base.app = (window as any).SiqaBox ? 'box' : 'browser';
  }
  try { const extra = bridge()?.info?.(); if (extra) Object.assign(base, JSON.parse(extra)); } catch {}
  return base;
}

const CACHE = 'siqa_screen_state_v1';

export type ScreenState = { status: 'loading' | 'unknown' | 'unpaired' | 'paired' | 'offline'; [k: string]: any };

/**
 * Registers the device, polls its state every 20 s (also its heartbeat), runs commands
 * from the admin center and keeps the last good state for when the internet drops.
 */
export function useScreenDevice(pollMs = 20000) {
  const [state, setState] = useState<ScreenState>(() => {
    try {
      const cached = localStorage.getItem(CACHE);
      if (cached) return { ...JSON.parse(cached), stale: true };
    } catch {}
    return { status: 'loading' };
  });
  const [online, setOnline] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const register = useCallback(async () => {
    const { data, error } = await supabase.rpc('screen_register', { p_device_token: readToken() });
    if (error || !data) throw error ?? new Error('register failed');
    tokenRef.current = (data as any).device_token;
    writeToken(tokenRef.current!);
    return data as any;
  }, []);

  const poll = useCallback(async () => {
    try {
      if (!tokenRef.current) tokenRef.current = readToken();
      if (!tokenRef.current) await register();
      let { data, error } = await supabase.rpc('screen_state', { p_device_token: tokenRef.current, p_info: deviceInfo() });
      if (error) throw error;
      if ((data as any)?.status === 'unknown') {
        // The admin removed this screen, or the token is from an old setup: start over.
        forgetToken(); tokenRef.current = null;
        await register();
        ({ data } = await supabase.rpc('screen_state', { p_device_token: tokenRef.current, p_info: deviceInfo() }));
      }
      const s = data as ScreenState;
      setOnline(true);
      setState(s);
      try { bridge()?.setMode?.(s.status === 'paired' ? s.mode : 'unpaired'); } catch {}
      if (s.status === 'paired') { try { localStorage.setItem(CACHE, JSON.stringify(s)); } catch {} }
      // Commands from the admin center.
      const cmd = s.command;
      if (cmd?.id) {
        await supabase.rpc('screen_ack', { p_device_token: tokenRef.current, p_command_id: String(cmd.id) });
        if (cmd.type === 'reload') { if (typeof location !== 'undefined') location.reload(); }
        else if (cmd.type === 'reboot') { const b = bridge(); if (b?.reboot) b.reboot(); else if (typeof location !== 'undefined') location.reload(); }
        else if (cmd.type === 'wifi_sync') { try { bridge()?.syncWifi?.(JSON.stringify(s.wifi ?? [])); } catch {} }
      }
    } catch {
      setOnline(false);
      setState((prev) => (prev.status === 'loading' ? { status: 'offline' } : { ...prev, stale: true }));
    }
  }, [register]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, pollMs);
    return () => clearInterval(t);
  }, [poll, pollMs]);

  return { state, online, refresh: poll };
}

/** Re-render every `ms`. */
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
