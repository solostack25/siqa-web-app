import { supabase } from './supabase';

// Counts a Gem view via the increment_video_view RPC
// (supabase/migrations/20261103_view_counts_client_errors.sql).
// Each video is counted at most once per app session per device, so
// scrolling back and forth doesn't inflate numbers.
const counted = new Set<string>();

export function countView(videoId: string) {
  if (!videoId || counted.has(videoId)) return;
  counted.add(videoId);
  void supabase.rpc('increment_video_view', { p_video_id: videoId }).then(
    ({ error }) => { if (error) counted.delete(videoId); },
    () => counted.delete(videoId),
  );
}
