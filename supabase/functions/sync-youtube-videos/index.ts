import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-siqa-internal',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Converts YouTube's ISO 8601 duration format (e.g. "PT1H2M10S") to seconds.
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (parseInt(h || '0') * 3600) + (parseInt(m || '0') * 60) + parseInt(s || '0');
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Who may run this: the nightly cron (x-siqa-internal header, secret kept in
// Vault) or a signed-in Siqa admin. Previously anyone could call it and
// insert published videos from any channel under any speaker.
async function isAllowedCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-siqa-internal');
  if (secret) {
    const { data } = await supabase.rpc('check_internal_secret', { p_secret: secret });
    if (data === true) return true;
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(profile?.role ?? '').toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await isAllowedCaller(req))) return json({ error: 'Not allowed' }, 403);

  const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
  if (!YOUTUBE_API_KEY) {
    return json({ error: 'YOUTUBE_API_KEY secret is not set in this project.' }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const channelHandle: string | undefined = body.channelHandle;
    const speakerId: string | undefined = body.speakerId;
    const category: string = body.category ?? 'Islamic Education';
    const maxResults: number = Math.min(body.maxResults ?? 10, 50);
    const dryRun: boolean = body.dryRun !== false; // defaults to true — safety first

    if (!channelHandle) {
      return json({ error: 'channelHandle is required, e.g. "@OmarSuleimanPersonal"' }, 400);
    }

    // Step 1: resolve the handle to a channel ID + uploads playlist ID
    const handleClean = encodeURIComponent(channelHandle.replace(/^@/, ''));
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&forHandle=${handleClean}&key=${YOUTUBE_API_KEY}`
    );
    const channelData = await channelRes.json();

    if (!channelRes.ok) {
      return json({ error: 'YouTube API error resolving channel', details: channelData }, 502);
    }
    if (!channelData.items?.length) {
      return json({ error: `No channel found for handle "${channelHandle}"` }, 404);
    }

    const channel = channelData.items[0];
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
    const channelTitle = channel.snippet.title;

    // Step 2: list videos from the channel's uploads playlist
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`
    );
    const playlistData = await playlistRes.json();

    if (!playlistRes.ok) {
      return json({ error: 'YouTube API error listing videos', details: playlistData }, 502);
    }

    const videoIds = (playlistData.items ?? []).map((item: any) => item.contentDetails.videoId);
    if (videoIds.length === 0) {
      return json({ channelTitle, videos: [], message: 'No videos found on this channel.' });
    }

    // Step 3: get duration + view count for those videos
    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
    );
    const detailsData = await detailsRes.json();

    if (!detailsRes.ok) {
      return json({ error: 'YouTube API error fetching video details', details: detailsData }, 502);
    }

    const videos = (detailsData.items ?? []).map((v: any) => {
      const duration_secs = parseDuration(v.contentDetails.duration);
      return {
        platform_video_id: v.id,
        title: v.snippet.title,
        description: v.snippet.description?.slice(0, 500) ?? null,
        thumbnail_url: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url ?? null,
        duration_secs,
        // Same >180s threshold used across the rest of the app.
        format: duration_secs > 180 ? 'long' : 'short',
        view_count: parseInt(v.statistics?.viewCount ?? '0'),
        published_at: v.snippet.publishedAt,
        video_url: `https://www.youtube.com/watch?v=${v.id}`,
      };
    });

    if (dryRun) {
      return json({
        dryRun: true,
        channelTitle,
        found: videos.length,
        videos,
        note: 'Nothing was inserted. Re-run with dryRun: false and a valid speakerId to insert these.',
      });
    }

    if (!speakerId) {
      return json({ error: 'speakerId is required when dryRun is false, so videos attach to the right creator.' }, 400);
    }

    // Only approved, verified speakers get videos published under their name.
    const { data: speaker } = await supabase
      .from('speakers')
      .select('id, approval_status, is_verified')
      .eq('id', speakerId)
      .maybeSingle();
    if (!speaker || speaker.approval_status !== 'approved' || !speaker.is_verified) {
      return json({ error: 'Speaker must be approved and verified before syncing videos.' }, 400);
    }

    // Step 4: insert, skipping any video already synced (matched on platform_video_id)
    const { data: existing } = await supabase
      .from('videos')
      .select('platform_video_id')
      .in('platform_video_id', videos.map((v: any) => v.platform_video_id));

    const existingIds = new Set((existing ?? []).map((r: any) => r.platform_video_id));
    const toInsert = videos.filter((v: any) => !existingIds.has(v.platform_video_id));

    if (toInsert.length === 0) {
      return json({ dryRun: false, inserted: 0, skipped: videos.length, message: 'All videos already synced.' });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('videos')
      .insert(
        toInsert.map((v: any) => ({
          speaker_id: speakerId,
          title: v.title,
          description: v.description,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url,
          duration_secs: v.duration_secs,
          view_count: v.view_count,
          like_count: 0,
          comment_count: 0,
          category,
          topics: [],
          is_published: true,
          published_at: v.published_at,
          format: v.format,
          platform: 'youtube',
          platform_video_id: v.platform_video_id,
        }))
      )
      .select('id, title');

    if (insertError) {
      return json({ error: 'Insert failed', details: insertError.message }, 500);
    }

    return json({
      dryRun: false,
      channelTitle,
      inserted: inserted?.length ?? 0,
      skipped: videos.length - toInsert.length,
      insertedVideos: inserted,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
