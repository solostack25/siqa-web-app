// Upload a file to Bunny Storage on behalf of a signed-in user.
//
// The Bunny Storage password used to ship inside the public web/app bundle
// (EXPO_PUBLIC_BUNNY_STORAGE_KEY), which let anyone delete or overwrite every
// video and image. It now lives only here, as the BUNNY_STORAGE_KEY secret.
//
// Request:  POST /functions/v1/bunny-upload?path=<suggested/path.ext>
//           Authorization: Bearer <user's Supabase access token>
//           Content-Type: video/* or image/*
//           body: the raw file bytes (streamed straight through to Bunny)
// Response: { url, path }
//
// The final path is decided here, not by the client:
//   <top-folder>/<user id>/<random>-<file name>
// so one user can never overwrite another user's (or their own earlier) files.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUNNY_STORAGE_KEY = Deno.env.get('BUNNY_STORAGE_KEY') ?? '';
const BUNNY_STORAGE_ZONE = Deno.env.get('BUNNY_STORAGE_ZONE') ?? 'siqa-videos';
const BUNNY_STORAGE_REGION = Deno.env.get('BUNNY_STORAGE_REGION') ?? 'ny';
const BUNNY_CDN_URL = (Deno.env.get('BUNNY_CDN_URL') ?? 'https://siqa-videos.b-cdn.net').replace(/\/$/, '');

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
}

const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!BUNNY_STORAGE_KEY) {
    console.error('BUNNY_STORAGE_KEY secret is not set');
    return json({ error: 'Uploads are not configured yet. Please try again later.' }, 500);
  }

  // Who is uploading.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'Sign in again to upload.' }, 401);

  // What they're uploading.
  const contentType = (req.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('video/') && !contentType.startsWith('image/')) {
    return json({ error: 'Only videos and images can be uploaded.' }, 415);
  }
  const length = Number(req.headers.get('Content-Length') ?? '0');
  if (length > MAX_BYTES) return json({ error: 'That file is too large (2 GB max).' }, 413);
  if (!req.body) return json({ error: 'No file received.' }, 400);

  // Where it goes: keep the client's top folder (gems, seeds, speaker-avatars…)
  // and file name for readability, but scope it to this user + a random id.
  const suggested = new URL(req.url).searchParams.get('path') ?? '';
  const parts = suggested.split('/').filter(Boolean);
  const top = clean(parts[0] ?? '') || 'uploads';
  const rawName = parts[parts.length - 1] ?? 'file';
  const ext = EXT_BY_TYPE[contentType] ?? (contentType.startsWith('video/') ? 'mp4' : 'jpg');
  const base = clean(rawName.replace(/\.[^.]*$/, '')).slice(0, 60) || 'file';
  const path = `${top.slice(0, 40)}/${user.id}/${crypto.randomUUID()}-${base}.${ext}`;

  const headers: Record<string, string> = { AccessKey: BUNNY_STORAGE_KEY, 'Content-Type': contentType };
  if (length > 0) headers['Content-Length'] = String(length);

  const upstream = await fetch(`https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${path}`, {
    method: 'PUT',
    headers,
    body: req.body,
    // Stream the request straight through instead of buffering big videos in memory.
    // @ts-ignore Deno supports duplex for streaming request bodies.
    duplex: 'half',
  });

  if (upstream.status !== 200 && upstream.status !== 201) {
    const detail = await upstream.text().catch(() => '');
    console.error('Bunny upload failed', upstream.status, detail.slice(0, 300));
    return json({ error: `Upload failed (storage error ${upstream.status}).` }, 502);
  }

  return json({ url: `${BUNNY_CDN_URL}/${path}`, path });
});
