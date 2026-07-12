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

const BUNNY_STORAGE_ZONE = process.env.EXPO_PUBLIC_BUNNY_STORAGE_ZONE || 'siqa-videos';
const BUNNY_STORAGE_KEY = process.env.EXPO_PUBLIC_BUNNY_STORAGE_KEY || '';
const BUNNY_STORAGE_REGION = process.env.EXPO_PUBLIC_BUNNY_STORAGE_REGION || 'ny';
const BUNNY_CDN_URL = process.env.EXPO_PUBLIC_BUNNY_CDN_URL || 'https://siqa-videos.b-cdn.net';

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
  if (!BUNNY_STORAGE_KEY) {
    throw new Error('Missing Bunny Storage key. Add EXPO_PUBLIC_BUNNY_STORAGE_KEY to your .env file.');
  }

  onProgress?.({ pct: Math.max(1, progressStart - 5), label: 'Preparing file...' });

  const blob = await fetch(uri).then((res) => res.blob());
  const storageHost = `https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com`;
  const uploadUrl = `${storageHost}/${BUNNY_STORAGE_ZONE}/${fileName}`;

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
    xhr.setRequestHeader('AccessKey', BUNNY_STORAGE_KEY);
    xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream');
    xhr.send(blob);
  });

  return `${BUNNY_CDN_URL.replace(/\/$/, '')}/${fileName}`;
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
