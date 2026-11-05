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

// Uploads go through the `bunny-upload` Supabase function, which holds the
// Bunny Storage key. The key used to be shipped in this bundle
// (EXPO_PUBLIC_BUNNY_STORAGE_KEY) — never put it back here.
const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const UPLOAD_ENDPOINT = `${SUPABASE_URL}/functions/v1/bunny-upload`;

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

/**
 * Uploads a file and returns its public CDN URL. `fileName` is a suggested
 * path — the server keeps its top folder and name but places it under the
 * signed-in user with a random id, so always use the returned URL.
 */
export async function uploadFileToBunny({
  uri,
  fileName,
  mimeType,
  onProgress,
  progressStart = 10,
  progressEnd = 88,
  label = 'Uploading...',
}: BunnyUploadArgs): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in again to upload.');

  onProgress?.({ pct: Math.max(1, progressStart - 5), label: 'Preparing file...' });

  const blob = await fetch(uri).then((res) => res.blob());
  const type = mimeType || blob.type || (fileName.match(/\.(mov|mp4|m4v|webm)$/i) ? 'video/mp4' : 'image/jpeg');

  onProgress?.({ pct: progressStart, label });

  const result = await new Promise<{ url: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = progressStart + Math.round((event.loaded / event.total) * (progressEnd - progressStart));
        onProgress?.({ pct, label });
      }
    };

    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) resolve(body);
      else reject(new Error(body?.error || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));

    xhr.open('POST', `${UPLOAD_ENDPOINT}?path=${encodeURIComponent(fileName)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('Content-Type', type);
    xhr.send(blob);
  });

  return result.url;
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
