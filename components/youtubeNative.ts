// YouTube now refuses embeds that don't say which site they're on (the
// player shows "Error 153 – Video player configuration error"). On the web
// the page's own address does that. In the phone app, loading the embed URL
// straight into a WebView sends no address at all, so instead we load a tiny
// page that *says* it lives on gems.thesiqaapp.com (baseUrl) and put YouTube's
// official player inside it in an iframe — exactly what the website does.

export const YT_HOST_ORIGIN = 'https://gems.thesiqaapp.com';
export const YT_FRAME_ID = 'siqa-yt';

export function youTubeEmbedUrl(videoId: string, params: Record<string, string | number>) {
  // On the website, use the real page address (gems./crafts./marketplace.);
  // in the app, the address the native page claims (YT_HOST_ORIGIN).
  const origin =
    typeof window !== 'undefined' && window.location?.origin?.startsWith('http')
      ? window.location.origin
      : YT_HOST_ORIGIN;
  const q = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    origin,
    widget_referrer: origin,
  });
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${q.toString()}`;
}

/** WebView `source` for a native YouTube player that YouTube will accept. */
export function youTubeNativeSource(embedUrl: string) {
  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe id="${YT_FRAME_ID}" src="${embedUrl.replace(/"/g, '&quot;')}"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</body></html>`;
  return { html, baseUrl: YT_HOST_ORIGIN };
}

/** JS to run inside that page to send an IFrame API command to the player. */
export function youTubeCommandJs(message: string) {
  return `(function(){var f=document.getElementById('${YT_FRAME_ID}');if(f&&f.contentWindow){f.contentWindow.postMessage(${JSON.stringify(message)},'*');}})();true;`;
}
