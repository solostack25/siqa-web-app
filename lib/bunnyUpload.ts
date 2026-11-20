export type BunnyUploadProgress = {
  pct: number;
  label: string;
};

type BunnyUploadArgs = {
  uri: string;
  fileName: string;
  mimeType?: string | null;
  onProgress?: (progress: BunnyUploadProgress) => void;
  progressStart?: number;
  progressEnd?: number;
  label?: string;
};

import { supabase } from './supabase';

// Uploads go through a short-lived signed link from the bunny-upload-url Edge
// Function. The Bunny storage password never reaches the app (it used to be in
// EXPO_PUBLIC_BUNNY_STORAGE_KEY, which shipped it to every visitor).
const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

async function getSignedUpload(path: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? '';
  if (!token) throw new Error('Sign in again to upload.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bunny-upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path, contentType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.uploadUrl) throw new Error(data.error || `Could not start upload (${res.status})`);
  return data;
}

function cleanFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function getExt(fileName: string, mimeType?: string | null) {
  const fromName = fileName.split('.').pop();
  if (fromName && fromName.length <= 6) return fromName.toLowerCase();
  if (mimeType?.includes('quicktime')) return 'mov';
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('webp')) return 'webp';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return 'jpg';
  if (mimeType?.includes('mp4')) return 'mp4';
  return 'mp4';
}

export function makeBunnyGemPath(userId: string, originalName: string, mimeType?: string | null) {
  const ext = getExt(originalName, mimeType);
  const safeBase = cleanFileName(originalName.replace(/\.[^/.]+$/, '') || 'gem');
  return `gems/${userId}/${Date.now()}-${safeBase}.${ext}`;
}

export function makeBunnyThumbnailPath(userId: string, originalName: string, mimeType?: string | null) {
  const ext = getExt(originalName, mimeType || 'image/jpeg');
  const safeBase = cleanFileName(originalName.replace(/\.[^/.]+$/, '') || 'thumbnail');
  return `gems/${userId}/thumbnails/${Date.now()}-${safeBase}.${ext}`;
}

export function makeBunnySeedVideoPath(userId: string, originalName: string, mimeType?: string | null) {
  const ext = getExt(originalName, mimeType);
  const safeBase = cleanFileName(originalName.replace(/\.[^/.]+$/, '') || 'seed-appeal');
  return `seeds/${userId}/videos/${Date.now()}-${safeBase}.${ext}`;
}

export function makeBunnySeedThumbnailPath(userId: string, originalName: string, mimeType?: string | null) {
  const ext = getExt(originalName, mimeType || 'image/jpeg');
  const safeBase = cleanFileName(originalName.replace(/\.[^/.]+$/, '') || 'seed-thumbnail');
  return `seeds/${userId}/thumbnails/${Date.now()}-${safeBase}.${ext}`;
}

export async function uploadFileToBunny({
  uri,
  fileName,
  mimeType,
  onProgress,
  progressStart = 10,
  progressEnd = 88,
  label = 'Uploading to Bunny.net...',
}: BunnyUploadArgs) {
  onProgress?.({ pct: Math.max(1, progressStart - 5), label: 'Preparing file...' });

  const blob = await fetch(uri).then((res) => res.blob());
  const contentType = mimeType || blob.type || 'application/octet-stream';
  const { uploadUrl, publicUrl } = await getSignedUpload(fileName, contentType);

  onProgress?.({ pct: progressStart, label });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = progressStart + Math.round((event.loaded / event.total) * (progressEnd - progressStart));
        onProgress?.({ pct, label });
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) resolve();
      else reject(new Error(`Bunny upload failed: HTTP ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Network error during Bunny upload'));
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(blob);
  });

  return publicUrl;
}

export async function uploadVideoToBunny(args: BunnyUploadArgs) {
  const url = await uploadFileToBunny({
    ...args,
    progressStart: args.progressStart ?? 10,
    progressEnd: args.progressEnd ?? 88,
    label: args.label ?? 'Uploading video to Bunny.net...',
  });
  args.onProgress?.({ pct: args.progressEnd ?? 92, label: 'Finishing video upload...' });
  return url;
}

export async function uploadThumbnailToBunny(args: BunnyUploadArgs) {
  const url = await uploadFileToBunny({
    ...args,
    progressStart: args.progressStart ?? 5,
    progressEnd: args.progressEnd ?? 18,
    label: args.label ?? 'Uploading thumbnail...',
  });
  args.onProgress?.({ pct: args.progressEnd ?? 18, label: 'Thumbnail uploaded...' });
  return url;
}

/**
 * Permanently delete a video post AND its files in Bunny (delete-video Edge
 * Function). For hiding a post, unpublish it instead — that keeps the files.
 */
export async function deleteVideoEverywhere(videoId: string): Promise<{ error?: string }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? '';
  if (!token) return { error: 'Sign in again to delete.' };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ videoId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.deleted) return { error: data.error || `Delete failed (${res.status})` };
  return {};
}
