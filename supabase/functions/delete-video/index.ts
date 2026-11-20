import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

// Delete a video for good: the post AND its video + thumbnail files in Bunny.
// (Unpublish is separate — it only hides the post and keeps the files.)
//
// Permission is exactly what it was before: the row is selected and deleted
// with the caller's own login, so the database's existing rules decide who
// may delete what. Files are only removed after the row is gone, and only if
// no other post still points at the same file.
//
// Secrets:
//   BUNNY_S3_PASSWORD      siqa-media zone password (already set for uploads)
//   BUNNY_LEGACY_PASSWORD  siqa-videos zone password (optional — without it,
//                          files from before Nov 20 2026 are left in storage)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const S3_ZONE = Deno.env.get('BUNNY_S3_ZONE') ?? 'siqa-media';
const S3_PASSWORD = Deno.env.get('BUNNY_S3_PASSWORD') ?? '';
const S3_REGION = Deno.env.get('BUNNY_S3_REGION') ?? 'ny';
const S3_CDN_HOST = new URL(Deno.env.get('BUNNY_MEDIA_CDN') ?? 'https://siqamedia.b-cdn.net').host;

const LEGACY_ZONE = 'siqa-videos';
const LEGACY_PASSWORD = Deno.env.get('BUNNY_LEGACY_PASSWORD') ?? '';
const LEGACY_REGION = 'ny';
const LEGACY_CDN_HOST = 'siqa-videos.b-cdn.net';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type FileRef = { zone: 'media' | 'legacy'; path: string; url: string };

function fileFor(url: string | null): FileRef | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    if (!path || path.includes('..')) return null;
    if (u.host === S3_CDN_HOST) return { zone: 'media', path, url };
    if (u.host === LEGACY_CDN_HOST) return { zone: 'legacy', path, url };
  } catch { /* not a URL we own (e.g. YouTube) */ }
  return null;
}

async function removeFile(f: FileRef): Promise<string> {
  if (f.zone === 'media') {
    if (!S3_PASSWORD) return 'skipped (no BUNNY_S3_PASSWORD)';
    const aws = new AwsClient({ accessKeyId: S3_ZONE, secretAccessKey: S3_PASSWORD, service: 's3', region: S3_REGION });
    const res = await aws.fetch(`https://${S3_REGION}-s3.storage.bunnycdn.com/${S3_ZONE}/${f.path}`, { method: 'DELETE' });
    return res.ok || res.status === 404 ? 'deleted' : `failed (${res.status})`;
  }
  if (!LEGACY_PASSWORD) return 'kept (no BUNNY_LEGACY_PASSWORD)';
  const res = await fetch(`https://${LEGACY_REGION}.storage.bunnycdn.com/${LEGACY_ZONE}/${f.path}`, {
    method: 'DELETE',
    headers: { AccessKey: LEGACY_PASSWORD },
  });
  return res.ok || res.status === 404 ? 'deleted' : `failed (${res.status})`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { data: { user } } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!user) return json({ error: 'Sign in again to delete.' }, 401);

    const { videoId } = await req.json().catch(() => ({}));
    if (!videoId) return json({ error: 'Missing video.' }, 400);

    // Act as the caller so the database's own permission rules apply.
    const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: auth } },
    });

    const { data: video } = await asUser
      .from('videos')
      .select('id, video_url, thumbnail_url')
      .eq('id', videoId)
      .maybeSingle();
    if (!video) return json({ error: 'Video not found.' }, 404);

    const { data: deleted, error } = await asUser.from('videos').delete().eq('id', videoId).select('id');
    if (error) return json({ error: error.message }, 400);
    if (!deleted?.length) return json({ error: "You don't have permission to delete this video." }, 403);

    // Remove the files, unless another post still uses the same one.
    const files = [fileFor(video.video_url), fileFor(video.thumbnail_url)].filter(Boolean) as FileRef[];
    const results: Record<string, string> = {};
    for (const f of files) {
      const [a, b] = await Promise.all([
        admin.from('videos').select('id', { count: 'exact', head: true }).eq('video_url', f.url),
        admin.from('videos').select('id', { count: 'exact', head: true }).eq('thumbnail_url', f.url),
      ]);
      const stillUsed = (a.count ?? 0) + (b.count ?? 0) > 0;
      results[f.path] = stillUsed ? 'kept (still used)' : await removeFile(f);
    }
    console.log('delete-video', videoId, results);

    return json({ deleted: true, files: results });
  } catch (e) {
    console.error('delete-video', e);
    return json({ error: 'Could not delete. Try again.' }, 500);
  }
});
