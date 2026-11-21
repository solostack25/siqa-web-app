// Loads a masjid's settings, schedule, announcements, Seeds and screens for the console.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { DEFAULT_IQAMAH, type Announcement, type MasjidEvent, type MasjidSettings } from '../../../lib/masjid';

export type ScreenRow = {
  id: string; mode: string | null; name: string | null; layout: string; show_live: boolean; live_audio: boolean;
  power_on: string | null; power_off: string | null; paired_at: string | null; last_seen_at: string | null;
  info: Record<string, any>; command: any; wifi_event: any; created_at: string;
};
export type SeedRow = {
  id: string; title: string; status: string; goal_amount: number | null; raised_amount: number | null;
  donor_count: number | null; cover_image_url: string | null; created_at: string;
};
export type AnnouncementRow = Announcement & { starts_on: string; ends_on: string | null; on_screens: boolean; on_page: boolean };

export function defaultSettings(orgId: string): MasjidSettings {
  return {
    org_id: orgId, address: null, lat: null, lon: null, timezone: 'America/Chicago', calc_method: 'NorthAmerica',
    madhab: 'shafi', iqamah: DEFAULT_IQAMAH, jummah_times: ['13:30'], hijri_offset: 0, countdown_minutes: 30,
    ticker: null, screen_seed_id: null,
  };
}

export function useMasjidSettings(orgId: string) {
  const [settings, setSettings] = useState<MasjidSettings | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('masjid_settings').select('*').eq('org_id', orgId).maybeSingle();
    setSettings(data ? ({ ...defaultSettings(orgId), ...(data as any) }) : defaultSettings(orgId));
  }, [orgId]);
  useEffect(() => { setSettings(null); load(); }, [load]);
  const save = useCallback(async (patch: Partial<MasjidSettings>) => {
    const next = { ...(settings ?? defaultSettings(orgId)), ...patch, org_id: orgId, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('masjid_settings').upsert(next);
    if (!error) setSettings(next);
    return error;
  }, [settings, orgId]);
  return { settings, reload: load, save };
}

export function useMasjidEvents(orgId: string) {
  const [events, setEvents] = useState<MasjidEvent[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('masjid_events').select('*').eq('org_id', orgId).order('start_time');
    setEvents(((data as MasjidEvent[]) || []).map((e) => ({ ...e, start_time: String(e.start_time).slice(0, 5) })));
  }, [orgId]);
  useEffect(() => { setEvents(null); load(); }, [load]);
  return { events, reload: load };
}

export function useAnnouncements(orgId: string) {
  const [items, setItems] = useState<AnnouncementRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('masjid_announcements').select('*').eq('org_id', orgId)
      .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    setItems((data as AnnouncementRow[]) || []);
  }, [orgId]);
  useEffect(() => { setItems(null); load(); }, [load]);
  return { items, reload: load };
}

export function useSeeds(orgId: string) {
  const [seeds, setSeeds] = useState<SeedRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('fundraisers')
      .select('id, title, status, goal_amount, raised_amount, donor_count, cover_image_url, created_at')
      .eq('org_id', orgId).order('created_at', { ascending: false });
    setSeeds((data as SeedRow[]) || []);
  }, [orgId]);
  useEffect(() => { setSeeds(null); load(); }, [load]);
  return { seeds, reload: load };
}

export function useScreens(orgId: string, pollMs = 30000) {
  const [screens, setScreens] = useState<ScreenRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('masjid_screens')
      .select('id, mode, name, layout, show_live, live_audio, power_on, power_off, paired_at, last_seen_at, info, command, wifi_event, created_at')
      .eq('org_id', orgId).order('created_at');
    setScreens((data as ScreenRow[]) || []);
  }, [orgId]);
  useEffect(() => {
    setScreens(null); load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return { screens, reload: load };
}

export function useMasjidLive(orgId: string) {
  const [live, setLive] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const load = () => supabase.rpc('masjid_live', { p_org: orgId }).then(({ data }) => { if (alive) setLive(data ?? null); });
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [orgId]);
  return live;
}
