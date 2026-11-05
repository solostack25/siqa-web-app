import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * View tracking for Speaker Studio analytics.
 *
 * A "view" is recorded once the viewer has stayed on a video for
 * VIEW_DELAY_MS (callers handle the delay). The database function
 * `increment_video_view` does the real work: it logs a row in
 * video_view_events, bumps videos.view_count, ignores the speaker's own
 * views, and de-duplicates the same viewer on the same video within 30
 * minutes. Signed-out viewers are identified by a random per-device key.
 */

export const VIEW_DELAY_MS = 3000;

const SESSION_STORAGE_KEY = 'siqa_view_session';
let sessionKeyPromise: Promise<string> | null = null;
// Saves a round trip when someone scrolls back and forth over the same Gem.
const recentlyRecorded = new Map<string, number>();
const LOCAL_DEDUPE_MS = 30 * 60 * 1000;

function randomKey() {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID() as string;
  return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

function getSessionKey(): Promise<string> {
  if (!sessionKeyPromise) {
    sessionKeyPromise = (async () => {
      try {
        const existing = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (existing) return existing;
        const key = randomKey();
        await AsyncStorage.setItem(SESSION_STORAGE_KEY, key);
        return key;
      } catch {
        return randomKey();
      }
    })();
  }
  return sessionKeyPromise;
}

export async function recordView(videoId: string): Promise<void> {
  if (!videoId) return;
  const last = recentlyRecorded.get(videoId);
  if (last && Date.now() - last < LOCAL_DEDUPE_MS) return;
  recentlyRecorded.set(videoId, Date.now());
  try {
    const session = await getSessionKey();
    const { error } = await supabase.rpc('increment_video_view', { p_video_id: videoId, p_session: session });
    if (error) recentlyRecorded.delete(videoId);
  } catch {
    recentlyRecorded.delete(videoId);
  }
}
