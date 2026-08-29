const UPSTREAM = 'https://harfway-ads-prototype.vercel.app';

function allowedPath(path) {
  return path === '/' || path.startsWith('/_next/static/');
}

function cleanHeaders(source) {
  const headers = {};
  const allowed = ['content-type', 'etag', 'last-modified'];
  for (const key of allowed) {
    const value = source.get(key);
    if (value) headers[key] = value;
  }
  return headers;
}

function patchPortalJs(text) {
  return text
    .replaceAll(
      'if(e.size>3145728)return void h("素材は3MBまでです。");',
      'if(e.type.startsWith("video/")&&e.size>10485760)return void h("動画は10MBまでです。");if(e.type.startsWith("image/")&&e.size>3145728)return void h("画像は3MBまでです。");'
    )
    .replaceAll(
      'JPG / PNG / WebP / MP4 / WebM・3MBまで',
      'JPG / PNG / WebP：3MBまで ／ MP4 / WebM：10MBまで'
    )
    .replaceAll(
      'playlist:"プレイリスト",scraps:"切れ端",playback:"WAYS"',
      'playlist:"プレイリスト",scraps:"切れ端",playback:"WAYS",sale:"SALE WATCH"'
    )
    .replaceAll(
      'placements:["playlist","scraps","playback"]',
      'placements:["playlist","scraps","playback","sale"]'
    );
}

function patchRootHtml(text) {
  const scripts = [
    '<script src="/ads-portal-r2-shim.js"></script>',
    '<script src="/ads-portal-preview-launcher.js"></script>',
    '<script src="/ads-portal-preview-layout-v2.js"></script>',
  ];
  const missing = scripts.filter((script) => !text.includes(script));
  if (!missing.length) return text;
  const payload = missing.join('');
  return text.includes('<head>') ? text.replace('<head>', `<head>${payload}`) : `${payload}${text}`;
}

export default async function handler(req, res) {
  const raw = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path;
  const path = typeof raw === 'string' && raw ? raw : '/';

  if (!allowedPath(path)) {
    res.status(400).json({ error: 'Unsupported portal asset path' });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}${path}`, {
      headers: { 'User-Agent': 'HARF-WAY-ADS-Portal-Proxy/2.4' }
    });

    if (!upstream.ok) {
      res.status(upstream.status).send(await upstream.text());
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const headers = cleanHeaders(upstream.headers);
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-HARFWAY-ADS-PORTAL', 'video-10mb-r2-image-3mb-sale-placement-standalone-preview-device-layout-v2');

    if (path === '/') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(patchRootHtml(await upstream.text()));
      return;
    }

    if (/javascript|text\//i.test(contentType) || path.endsWith('.js')) {
      const text = patchPortalJs(await upstream.text());
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      res.status(200).send(text);
      return;
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(bytes);
  } catch (error) {
    console.error('ADS portal proxy failed', error);
    res.status(502).json({ error: 'Advertiser portal is temporarily unavailable' });
  }
}
