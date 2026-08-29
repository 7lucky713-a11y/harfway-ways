const SOURCES = {
  playback: 'https://harfway-playback.vercel.app/',
  playlist: 'https://harfway-playlist-tv.vercel.app/',
  scraps: 'https://harf-way-game-scrapbook.vercel.app/',
  sale: 'https://harfway-playback.vercel.app/sales/',
};

function one(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeToken(value, max = 180) {
  const text = String(value || '');
  return /^[a-zA-Z0-9_-]+$/.test(text) && text.length <= max ? text : '';
}

function removeExternalScript(html, pattern) {
  return html.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${pattern}[^"']*["'][^>]*>\\s*<\\/script>`, 'gi'), '');
}

function patchCommon(html) {
  let out = html;
  out = removeExternalScript(out, 'ga4[^"\']*\\.js');
  out = removeExternalScript(out, 'analytics[^"\']*\\.js');
  return out;
}

function patchPlayback(html) {
  let out = patchCommon(html);
  out = removeExternalScript(out, 'ways-ads\\.js');
  out = removeExternalScript(out, 'ways-analytics\\.js');
  return out;
}

function patchSale(html) {
  let out = patchCommon(html);
  out = removeExternalScript(out, 'sale-ads[^"\']*\\.js');
  out = removeExternalScript(out, 'ga4-sale-watch[^"\']*\\.js');
  return out;
}

function patchPlaylist(html) {
  let out = patchCommon(html);
  out = removeExternalScript(out, 'playlist-ads\\.js');
  out = removeExternalScript(out, 'shelf-ga4\\.js');
  out = out
    .replaceAll("'/api/core-games'", "'https://harfway-playlist-tv.vercel.app/api/core-games'")
    .replaceAll('"/api/core-games"', '"https://harfway-playlist-tv.vercel.app/api/core-games"')
    .replaceAll("'/api/wp-playlists'", "'https://harfway-playlist-tv.vercel.app/api/wp-playlists'")
    .replaceAll('"/api/wp-playlists"', '"https://harfway-playlist-tv.vercel.app/api/wp-playlists"');
  return out;
}

function patchScraps(html) {
  let out = patchCommon(html);
  out = out.replace(/<script\b[^>]*id=["']scrapbook-analytics-production["'][^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/if\s*\(\s*list\.length\s*>=\s*3\s*\)\s*hydrateAd\s*\(\s*list\s*\)/g, 'if(list.length>=3)void 0');
  return out;
}

function injectPreview(html, placement, id) {
  const config = JSON.stringify({ placement, id }).replace(/</g, '\\u003c');
  const payload = `<meta name="robots" content="noindex,nofollow"><script>window.__HWADS_LIVE_PREVIEW_CONFIG__=${config};</script><script defer src="/ads-live-preview-frame.js"></script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${payload}</head>`);
  return `${payload}${html}`;
}

export default async function handler(req, res) {
  const placement = safeToken(one(req.query?.placement), 20);
  const id = safeToken(one(req.query?.id));
  const source = SOURCES[placement];
  if (!source || !id) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Invalid preview request');
    return;
  }

  try {
    const upstream = await fetch(source, {
      headers: { 'User-Agent': 'HARF-WAY-ADS-Live-Preview/1.0' },
      cache: 'no-store',
    });
    if (!upstream.ok) {
      res.status(502).setHeader('Content-Type', 'text/plain; charset=utf-8').send(`Upstream unavailable (${upstream.status})`);
      return;
    }

    let html = await upstream.text();
    if (placement === 'playback') html = patchPlayback(html);
    else if (placement === 'playlist') html = patchPlaylist(html);
    else if (placement === 'scraps') html = patchScraps(html);
    else if (placement === 'sale') html = patchSale(html);
    html = injectPreview(html, placement, id);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-HARFWAY-ADS-LIVE-PREVIEW', placement);
    res.status(200).send(html);
  } catch (error) {
    console.error('ADS live preview proxy failed', placement, error);
    res.status(502).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Preview page is temporarily unavailable');
  }
}
