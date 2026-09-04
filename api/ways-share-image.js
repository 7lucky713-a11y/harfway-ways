import gamesLiveHandler from './games-live.js';

const ALLOWED_IMAGE_HOSTS = new Set([
  'pub-2d323c5412584bc480059c19872176e1.r2.dev'
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function queryValue(value, fallback = '') {
  return String(Array.isArray(value) ? value[0] : (value ?? fallback)).trim();
}

function safeImageUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    if (!ALLOWED_IMAGE_HOSTS.has(url.hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

async function loadGames() {
  let statusCode = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };
  await gamesLiveHandler({ method: 'GET' }, res);
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) {
    throw new Error(`games_live_${statusCode}`);
  }
  return payload.entries;
}

function fail(res, code, message) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).end(message);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method Not Allowed');

  const id = queryValue(req.query?.id);
  if (!id) return fail(res, 404, 'Image Not Found');

  try {
    const games = await loadGames();
    const game = games.find((entry) => String(entry?.id || '') === id);
    if (!game) return fail(res, 404, 'Image Not Found');

    const imageUrl = safeImageUrl(game.thumbnailUrl);
    if (!imageUrl) return fail(res, 404, 'Image Not Found');

    const upstream = await fetch(imageUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      redirect: 'error',
      headers: { 'User-Agent': 'HARF-WAY-WAYS-SocialImageProxy/1.0' }
    });
    if (!upstream.ok) return fail(res, 502, 'Image Upstream Error');

    const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return fail(res, 415, 'Unsupported Image Type');

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      return fail(res, 413, 'Image Too Large');
    }

    const versioned = Boolean(queryValue(req.query?.v));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', versioned
      ? 'public, max-age=86400, s-maxage=31536000, immutable'
      : 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const etag = upstream.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);
    const lastModified = upstream.headers.get('last-modified');
    if (lastModified) res.setHeader('Last-Modified', lastModified);

    if (req.method === 'HEAD') return res.status(200).end();

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return fail(res, 413, 'Image Too Large');
    res.setHeader('Content-Length', String(bytes.byteLength));
    return res.status(200).end(bytes);
  } catch (error) {
    console.error('[ways-share-image]', error?.message || error);
    return fail(res, 503, 'Image Temporarily Unavailable');
  }
}
