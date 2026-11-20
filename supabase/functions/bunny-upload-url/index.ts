import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

// Hands a signed-in user a short-lived link to upload ONE file to Bunny.
//
// Why this exists: the app used to upload straight to Bunny with the storage
// zone password baked into the public JavaScript, so anyone could read it and
// overwrite or delete every file. Now the password lives only here, as a
// function secret, and the browser gets a presigned S3 PUT URL that works for
// one file, for 15 minutes.
//
// Every file lands under u/<user id>/..., so a user can only ever write into
// their own folder — never over someone else's upload.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   BUNNY_S3_ZONE      storage zone name (also the S3 bucket + access key id), e.g. siqa-media
//   BUNNY_S3_PASSWORD  that zone's password (Storage → zone → Access)
//   BUNNY_S3_REGION    zone's main region code, e.g. ny
//   BUNNY_MEDIA_CDN    pull zone URL in front of the zone, e.g. https://siqamedia.b-cdn.net

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const ZONE = Deno.env.get('BUNNY_S3_ZONE') ?? 'siqa-media';
const PASSWORD = Deno.env.get('BUNNY_S3_PASSWORD') ?? '';
const REGION = Deno.env.get('BUNNY_S3_REGION') ?? 'ny';
const CDN = (Deno.env.get('BUNNY_MEDIA_CDN') ?? 'https://siqamedia.b-cdn.net').replace(/\/$/, '');

const EXPIRES_SECONDS = 15 * 60;
const ALLOWED_TYPES = /^(image\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Keep the app's own folder layout (gems/…, org-posts/…), but strip anything
// that could climb out of the user's folder or confuse the URL.
function cleanPath(raw: string) {
  const parts = String(raw ?? '')
    .split('/')
    .map((p) => p.trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-'))
    .filter((p) => p && p !== '.' && p !== '..');
  if (parts.length === 0 || parts.length > 8) return null;
  const path = parts.join('/');
  return path.length <= 300 ? path : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!PASSWORD) return json({ error: 'Uploads are not configured yet.' }, 500);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'Sign in again to upload.' }, 401);

    const { path, contentType } = await req.json().catch(() => ({}));
    const clean = cleanPath(path);
    if (!clean) return json({ error: 'Invalid file name.' }, 400);
    const type = String(contentType ?? '').toLowerCase();
    if (!ALLOWED_TYPES.test(type)) return json({ error: 'Only images, videos and PDFs can be uploaded.' }, 400);

    const key = `u/${user.id}/${clean}`;
    const aws = new AwsClient({
      accessKeyId: ZONE,
      secretAccessKey: PASSWORD,
      service: 's3',
      region: REGION,
    });

    const target = new URL(`https://${REGION}-s3.storage.bunnycdn.com/${ZONE}/${key}`);
    target.searchParams.set('X-Amz-Expires', String(EXPIRES_SECONDS));
    const signed = await aws.sign(target.toString(), { method: 'PUT', aws: { signQuery: true } });

    return json({ uploadUrl: signed.url, publicUrl: `${CDN}/${key}`, expiresIn: EXPIRES_SECONDS });
  } catch (e) {
    console.error('bunny-upload-url', e);
    return json({ error: 'Could not prepare the upload. Try again.' }, 500);
  }
});
