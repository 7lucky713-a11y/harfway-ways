const CACHE_TTL_MS = 15 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 2 * 60 * 1000;
const CONCURRENCY = 4;

const cache = globalThis.__harfwaySteamSaleCache || new Map();
globalThis.__harfwaySteamSaleCache = cache;

export function steamAppIdFromUrl(value) {
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

function formatYen(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value);
}

function normalizePrice(appid, payload) {
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
  const common = {
    appid,
    steamName: String(data.name || ''),
    headerImage: String(data.header_image || ''),
    capsuleImage: String(data.capsule_image || data.capsule_imagev5 || '')
  };

  if (!p) {
    return {
      ...common,
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
      onSale: false
    };
  }

  const currency = String(p.currency || '');
  const initialMinor = Number(p.initial);
  const finalMinor = Number(p.final);
  const discountPercent = Number(p.discount_percent || 0);
  const isJpy = currency === 'JPY';
  const initialYen = isJpy && Number.isFinite(initialMinor) ? initialMinor / 100 : null;
  const finalYen = isJpy && Number.isFinite(finalMinor) ? finalMinor / 100 : null;

  return {
    ...common,
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
    onSale: Number.isFinite(discountPercent) && discountPercent > 0 && Number.isFinite(finalMinor) && Number.isFinite(initialMinor) && finalMinor < initialMinor
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSteamApp(appid, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({
      appids: appid,
      cc: 'JP',
      l: 'japanese',
      filters: 'basic,price_overview'
    });
    const response = await fetch(`https://store.steampowered.com/api/appdetails?${params.toString()}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 HARF-WAY-Sale-Watch/1.1'
      },
      signal: controller.signal,
      cache: 'no-store'
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 1) {
      clearTimeout(timeout);
      await sleep(700 + Math.floor(Math.random() * 400));
      return fetchSteamApp(appid, attempt + 1);
    }
    if (!response.ok) throw new Error(`steam_http_${response.status}`);

    const payload = await response.json();
    return normalizePrice(appid, payload);
  } catch (error) {
    return {
      appid,
      ok: false,
      error: error?.name === 'AbortError' ? 'steam_timeout' : (error?.message || 'steam_fetch_failed')
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSteamPrices(appids, forceRefresh = false) {
  const unique = [...new Set((appids || []).map(String).filter(Boolean))];
  const now = Date.now();
  const result = new Map();
  const missing = [];

  for (const appid of unique) {
    const hit = cache.get(appid);
    const ttl = hit?.value?.ok === false ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (!forceRefresh && hit && now - hit.fetchedAt < ttl) {
      result.set(appid, { ...hit.value, cached: true, fetchedAt: hit.fetchedAt });
    } else {
      missing.push(appid);
    }
  }

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const group = missing.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(group.map(appid => fetchSteamApp(appid)));
    for (const row of rows) {
      const fetchedAt = Date.now();
      cache.set(row.appid, { fetchedAt, value: row });
      result.set(row.appid, { ...row, cached: false, fetchedAt });
    }
  }

  return result;
}

export function summarizeSaleRows(rows) {
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

export const steamSaleCacheTtlSeconds = Math.floor(CACHE_TTL_MS / 1000);
