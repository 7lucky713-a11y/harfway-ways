const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const CACHE_TTL_MS = 15 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 2 * 60 * 1000;
const BATCH_SIZE = 20;
const BATCH_CONCURRENCY = 4;

const cache = globalThis.__harfwaySteamSaleCache || new Map();
globalThis.__harfwaySteamSaleCache = cache;

function adminKey(req) {
  return String(req.headers['x-showcase-admin-key'] || req.headers['x-admin-key'] || '').trim();
}

async function editorRequest(target, key) {
  const response = await fetch(`${EDITOR_URL}/api/proxy?target=${encodeURIComponent(target)}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'x-showcase-admin-key': key
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || `editor_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function steamAppIdFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!/(^|\.)steampowered\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/app\/(\d+)/i);
    return match ? match[1] : null;
  } catch {
    const match = raw.match(/store\.steampowered\.com\/app\/(\d+)/i);
    return match ? match[1] : null;
  }
}

function normalizeGame(game = {}, index = 0) {
  return {
    id: String(game.id || `game-${index}`),
    title: String(game.title || ''),
    storeUrl: String(game.storeUrl || game.store_url || ''),
    articleUrl: String(game.articleUrl || game.article_url || ''),
    status: game.status === 'published' ? 'published' : 'draft',
    category: game.category === '通常' ? '' : String(game.category || ''),
    tags: Array.isArray(game.tags) ? game.tags.map(String) : []
  };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function formatYen(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value);
}

function priceFromSteam(appid, payload) {
  const root = payload?.[appid];
  if (!root?.success || !root?.data) {
    return {
      appid,
      ok: false,
      error: root?.success === false ? 'steam_not_available' : 'steam_invalid_response'
    };
  }

  const data = root.data || {};
  const p = data.price_overview || null;
  const isFree = Boolean(data.is_free);

  if (!p) {
    return {
      appid,
      ok: true,
      isFree,
      priceAvailable: isFree,
      currency: isFree ? 'JPY' : null,
      initial: isFree ? 0 : null,
      final: isFree ? 0 : null,
      initialYen: isFree ? 0 : null,
      finalYen: isFree ? 0 : null,
      initialFormatted: isFree ? '無料' : null,
      finalFormatted: isFree ? '無料' : null,
      discountPercent: 0,
      onSale: false,
      steamName: String(data.name || '')
    };
  }

  const currency = String(p.currency || '');
  const initialMinor = Number(p.initial);
  const finalMinor = Number(p.final);
  const discountPercent = Number(p.discount_percent || 0);
  const isJpy = currency === 'JPY';
  // Steam Store API returns integer prices in hundredths even for JPY.
  // e.g. 120000 represents ¥1,200, while formatted fields remain display-safe.
  const initialYen = isJpy && Number.isFinite(initialMinor) ? initialMinor / 100 : null;
  const finalYen = isJpy && Number.isFinite(finalMinor) ? finalMinor / 100 : null;

  return {
    appid,
    ok: true,
    isFree: false,
    priceAvailable: Number.isFinite(initialMinor) && Number.isFinite(finalMinor),
    currency,
    initial: Number.isFinite(initialMinor) ? initialMinor : null,
    final: Number.isFinite(finalMinor) ? finalMinor : null,
    initialYen,
    finalYen,
    initialFormatted: String(p.initial_formatted || (initialYen !== null ? formatYen(initialYen) : '')) || null,
    finalFormatted: String(p.final_formatted || (finalYen !== null ? formatYen(finalYen) : '')) || null,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    onSale: Number.isFinite(discountPercent) && discountPercent > 0 && Number.isFinite(finalMinor) && Number.isFinite(initialMinor) && finalMinor < initialMinor,
    steamName: String(data.name || '')
  };
}

async function fetchSteamBatch(appids) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const params = new URLSearchParams({
      appids: appids.join(','),
      cc: 'JP',
      l: 'japanese',
      filters: 'basic,price_overview'
    });
    const response = await fetch(`https://store.steampowered.com/api/appdetails?${params.toString()}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'HARF-WAY-Sale-Watch/1.0'
      },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`steam_http_${response.status}`);
    const payload = await response.json();
    return appids.map(appid => priceFromSteam(appid, payload));
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'steam_timeout' : (error?.message || 'steam_fetch_failed');
    return appids.map(appid => ({ appid, ok: false, error: message }));
  } finally {
    clearTimeout(timeout);
  }
}

async function getPrices(appids, forceRefresh = false) {
  const now = Date.now();
  const result = new Map();
  const missing = [];

  for (const appid of appids) {
    const hit = cache.get(appid);
    const ttl = hit?.value?.ok === false ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (!forceRefresh && hit && now - hit.fetchedAt < ttl) {
      result.set(appid, { ...hit.value, cached: true, fetchedAt: hit.fetchedAt });
    } else {
      missing.push(appid);
    }
  }

  const batches = chunk(missing, BATCH_SIZE);
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const group = batches.slice(i, i + BATCH_CONCURRENCY);
    const fetchedGroups = await Promise.all(group.map(fetchSteamBatch));
    for (const rows of fetchedGroups) {
      for (const row of rows) {
        const fetchedAt = Date.now();
        cache.set(row.appid, { fetchedAt, value: row });
        result.set(row.appid, { ...row, cached: false, fetchedAt });
      }
    }
  }

  return result;
}

function summarize(rows) {
  const priced = rows.filter(x => x.price?.ok && x.price?.priceAvailable);
  const sales = rows.filter(x => x.price?.ok && x.price?.onSale);
  const under500 = sales.filter(x => Number.isFinite(x.price?.finalYen) && x.price.finalYen <= 500);
  const halfOff = sales.filter(x => Number(x.price?.discountPercent || 0) >= 50);
  const errors = rows.filter(x => !x.price?.ok);
  return {
    steamGames: rows.length,
    priced: priced.length,
    onSale: sales.length,
    under500: under500.length,
    halfOff: halfOff.length,
    errors: errors.length
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const key = adminKey(req);
  if (!key) return res.status(401).json({ ok: false, error: 'admin_key_required' });

  try {
    const editor = await editorRequest('state', key);
    const state = editor?.state || { games: [] };
    const games = Array.isArray(state.games) ? state.games.map(normalizeGame) : [];
    const steamGames = games
      .map(game => ({ ...game, appid: steamAppIdFromUrl(game.storeUrl) }))
      .filter(game => game.appid);

    const uniqueAppids = [...new Set(steamGames.map(game => game.appid))];
    const forceRefresh = String(req.query?.refresh || '') === '1';
    const prices = await getPrices(uniqueAppids, forceRefresh);

    const rows = steamGames.map(game => ({
      ...game,
      steamUrl: `https://store.steampowered.com/app/${game.appid}/`,
      price: prices.get(game.appid) || { appid: game.appid, ok: false, error: 'price_missing' }
    }));

    rows.sort((a, b) => {
      const aSale = a.price?.onSale ? 1 : 0;
      const bSale = b.price?.onSale ? 1 : 0;
      if (aSale !== bSale) return bSale - aSale;
      const d = Number(b.price?.discountPercent || 0) - Number(a.price?.discountPercent || 0);
      if (d) return d;
      return a.title.localeCompare(b.title, 'ja');
    });

    return res.status(200).json({
      ok: true,
      source: 'ways-editor + steam-store',
      country: 'JP',
      currency: 'JPY',
      cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
      refreshed: forceRefresh,
      updatedAt: new Date().toISOString(),
      totalGames: games.length,
      nonSteamStoreUrls: games.filter(game => game.storeUrl && !steamAppIdFromUrl(game.storeUrl)).length,
      missingStoreUrls: games.filter(game => !game.storeUrl).length,
      summary: summarize(rows),
      rows
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[steam-sale]', error?.message || error);
    return res.status(status).json({ ok: false, error: error?.message || 'steam_sale_failed' });
  }
}
