const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = globalThis.__harfwaySteamTrailerCache || new Map();
globalThis.__harfwaySteamTrailerCache = cache;

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function appIdFrom(value = '') {
  const raw = clean(value, 4000);
  if (/^\d+$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (!/(^|\.)store\.steampowered\.com$/i.test(u.hostname)) return '';
    return u.pathname.match(/\/app\/(\d+)/)?.[1] || '';
  } catch {
    return '';
  }
}

function canonicalStoreUrl(appId) {
  return `https://store.steampowered.com/app/${appId}/`;
}

function httpsUrl(value = '') {
  const raw = clean(value, 6000).replace(/&amp;/g, '&');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return '';
  }
}

function pickFromGroup(group) {
  if (!group || typeof group !== 'object') return '';
  for (const key of ['max', '2160', '1440', '1080', '720', '480']) {
    const url = httpsUrl(group[key]);
    if (url) return url;
  }
  for (const value of Object.values(group)) {
    const url = httpsUrl(value);
    if (url) return url;
  }
  return '';
}

function normalizeMovie(movie, index) {
  const hls = httpsUrl(movie?.hls_h264);
  const mp4 = pickFromGroup(movie?.mp4);
  const webm = pickFromGroup(movie?.webm);
  const poster = httpsUrl(
    movie?.thumbnail ||
    movie?.screenshot_full ||
    movie?.screenshot_medium
  );

  return {
    id: clean(movie?.id || `movie-${index + 1}`, 100),
    name: clean(movie?.name || `Steam Trailer ${index + 1}`, 300),
    highlight: Boolean(movie?.highlight),
    hls,
    mp4,
    webm,
    poster,
    playable: Boolean(hls || mp4 || webm)
  };
}

async function fetchSteam(appId) {
  const hit = cache.get(appId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.value, cached: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let value;

  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=japanese`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'HARF-WAY Steam Trailer Generator/1.0'
      },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`steam_http_${response.status}`);

    const json = await response.json();
    const item = json?.[appId];
    const data = item?.data;

    if (!item?.success || !data?.name) {
      value = { ok: false, appId, error: 'steam_app_not_found' };
    } else {
      const movies = (Array.isArray(data.movies) ? data.movies : [])
        .map(normalizeMovie)
        .filter(movie => movie.playable);

      const selectedIndex = Math.max(0, movies.findIndex(movie => movie.highlight));
      value = {
        ok: true,
        appId,
        name: clean(data.name, 400),
        storeUrl: canonicalStoreUrl(appId),
        movies,
        selectedIndex,
        updatedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    value = {
      ok: false,
      appId,
      error: error?.name === 'AbortError' ? 'steam_timeout' : 'steam_lookup_failed'
    };
  } finally {
    clearTimeout(timer);
  }

  cache.set(appId, { at: Date.now(), value });
  return { ...value, cached: false };
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const input = clean(req.query?.url || req.query?.q || req.query?.appid, 4000);
  const appId = appIdFrom(input);

  if (!appId) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'invalid_steam_url' });
  }

  const result = await fetchSteam(appId);
  res.setHeader(
    'Cache-Control',
    result.ok
      ? 'public, s-maxage=900, stale-while-revalidate=3600'
      : 'public, s-maxage=60, stale-while-revalidate=120'
  );

  return res.status(result.ok ? 200 : 502).json(result);
}
