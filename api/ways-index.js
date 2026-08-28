import gamesLiveHandler from './games-live.js';
import { steamAppIdFromUrl } from './_steam-sale-core.js';

let memoryCache = null;
let memoryExpiresAt = 0;

async function loadWaysIndex() {
  const now = Date.now();
  if (memoryCache && now < memoryExpiresAt) return memoryCache;

  let statusCode = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };

  await gamesLiveHandler({ method: 'GET', query: {} }, res);
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) {
    throw new Error(payload?.error || `ways_${statusCode}`);
  }

  const appids = [...new Set(payload.entries
    .map(entry => steamAppIdFromUrl(entry?.storeUrl || ''))
    .filter(Boolean)
    .map(String))];

  memoryCache = {
    appids,
    count: appids.length,
    sourceCount: payload.entries.length,
    source: String(payload.source || '')
  };
  memoryExpiresAt = now + 5 * 60 * 1000;
  return memoryCache;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const index = await loadWaysIndex();
    return res.status(200).json({ ok: true, ...index, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[ways-index]', error?.message || error);
    return res.status(503).json({ ok: false, error: 'ways_index_unavailable' });
  }
}
