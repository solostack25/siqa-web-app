import { Linking, Platform, Share } from 'react-native';
import { supabase } from './supabase';

// Siqa Studio (recorder, podcast room, live tools) is its own web app, on the same Siqa accounts.
export const STUDIO_URL = 'https://siqa-studio.vercel.app';

/** Opens a Studio page: same tab on the web, Safari/Chrome on the phone apps. */
export function openStudio(path: string) {
  const url = `${STUDIO_URL}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = url;
  else Linking.openURL(url);
}

export type CameraChannel = {
  id: string; title: string; speaker_name: string | null; cf_input_uid: string;
  rtmps_url: string; rtmp_url: string | null; stream_key: string;
  youtube_on: boolean; cf_status: string | null; checked_at: string | null;
  live_session_id: string | null; live_watch_token: string | null; live_started_at: string | null;
  speaker_id: string | null; auto_post: boolean; masjid_name: string | null;
  next_title: string | null; next_description: string | null; next_cover_url: string | null;
  last_video_id: string | null; last_video_title: string | null; last_video_published: boolean | null; last_live_at: string | null;
};

/** The signed-in speaker's camera stream(s). Empty for anyone who isn't an approved speaker. */
export async function myCameras(): Promise<CameraChannel[]> {
  const { data, error } = await supabase.rpc('studio_camera_channels', { p_secret: null });
  if (error) return [];
  const { data: me } = await supabase.rpc('studio_my_speaker');
  const mine = ((me as { id: string }[]) || [])[0]?.id;
  // Staff see every channel through the RPC; Speaker Studio shows only the speaker's own.
  return ((data as CameraChannel[]) || []).filter((c) => !mine || c.speaker_id === mine);
}

async function studioApi(path: string, body?: unknown) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Sign in again.');
  const res = await fetch(`${STUDIO_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
}

/** Makes the speaker's permanent stream address (a Cloudflare live input). */
export const createCamera = (title = 'Jumuah Khutbah') => studioApi('/api/camera/channels', { action: 'create', title });
/** Asks the Studio to check Cloudflare now, so LIVE shows up within seconds. */
export const syncCameras = () => studioApi('/api/camera/sync').catch(() => null);

export async function saveKhutbahDetails(id: string, d: { title: string; description: string; coverUrl: string; masjid: string; autoPost: boolean }) {
  const { error } = await supabase.rpc('studio_camera_details', {
    p_id: id, p_title: d.title, p_description: d.description, p_cover: d.coverUrl, p_masjid: d.masjid, p_auto_post: d.autoPost,
  });
  if (error) throw new Error(error.message);
}

export type MyMasjid = { id: string; org_name: string; city: string | null; state: string | null };

/** Masjids whose team I'm on: the only ones whose TVs I can send a stream to. */
export async function myMasjids(): Promise<MyMasjid[]> {
  const { data } = await supabase.rpc('my_masjids');
  return (data as MyMasjid[]) || [];
}

/** The masjid whose TVs switch to this stream when it goes live (null = none). */
export async function cameraMasjid(id: string): Promise<string | null> {
  const { data } = await supabase.rpc('studio_camera_masjid', { p_id: id });
  return (data as string | null) ?? null;
}

export async function setCameraMasjid(id: string, orgId: string | null) {
  const { error } = await supabase.rpc('studio_camera_set_masjid', { p_id: id, p_org: orgId });
  if (error) throw new Error(error.message);
}

export const streamAddress = (c: CameraChannel) => `${c.rtmps_url}${c.stream_key}`;
export const watchUrl = (token: string) => `https://www.siqa.us/live/${token}`;

/** Copies on the web; opens the share sheet on phones (no clipboard module in the app). */
export async function copyOrShare(text: string, title?: string): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return 'copied'; } catch { /* fall through */ }
  }
  try { await Share.share({ message: text, title }); return 'shared'; } catch { return 'failed'; }
}

/** Uploads an image the speaker picked (cover or watermark) and returns its public URL. */
export async function uploadStudioImage(userId: string, folder: 'covers' | 'watermarks', uri: string, mimeType?: string | null) {
  const ext = (mimeType?.split('/')[1] || uri.split('.').pop() || 'png').replace('jpeg', 'jpg').slice(0, 5);
  const path = `${folder}/${userId}/${Date.now()}.${ext}`;
  const blob = await fetch(uri).then((r) => r.blob());
  const { error } = await supabase.storage.from('studio-handouts').upload(path, blob, { contentType: mimeType || 'image/png' });
  if (error) throw error;
  return supabase.storage.from('studio-handouts').getPublicUrl(path).data.publicUrl;
}
