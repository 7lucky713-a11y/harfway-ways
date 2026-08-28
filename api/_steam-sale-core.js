const CACHE_TTL_MS = 15 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 2 * 60 * 1000;
const CONCURRENCY = 4;

const cache = globalThis.__harfwaySteamSaleV2Cache || new Map();
globalThis.__harfwaySteamSaleV2Cache = cache;

export function steamAppIdFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!/(^|\.)steampowered\.com$/i.test(url.hostname)) return null;
    return url.pathname.match(/\/app\/(\d+)/i)?.[1] || null;
  } catch {
    return raw.match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1] || null;
  }
}

function formatYen(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0
  }).format(value);
}

function normalizePrice(appid, payload) {
  const root = payload?.[appid];
  if (!root?.success || !root?.data) {
    return { appid, ok: false, error: root?.success === false ? 'steam_not_available' : 'steam_invalid_response', source: 'appdetails' };
  }

  const data = root.data || {};
  const p = data.price_overview || null;
  const common = {
    appid,
    steamName: String(data.name || ''),
    headerImage: String(data.header_image || ''),
    capsuleImage: String(data.capsule_image || data.capsule_imagev5 || ''),
    source: 'appdetails'
  };

  if (!p) {
    const isFree = Boolean(data.is_free);
    return {
      ...common, ok: true, isFree, priceAvailable: isFree,
      currency: isFree ? 'JPY' : null,
      initialYen: isFree ? 0 : null,
      finalYen: isFree ? 0 : null,
      initialFormatted: isFree ? '無料' : null,
      finalFormatted: isFree ? '無料' : null,
      discountPercent: 0, onSale: false,
      availability: isFree ? 'free' : (data.release_date?.coming_soon ? 'coming_soon' : 'unpriced')
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
    initialYen,
    finalYen,
    initialFormatted: String(p.initial_formatted || (initialYen !== null ? formatYen(initialYen) : '')) || null,
    finalFormatted: String(p.final_formatted || (finalYen !== null ? formatYen(finalYen) : '')) || null,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    onSale: Number.isFinite(discountPercent) && discountPercent > 0 && finalMinor < initialMinor,
    availability: 'priced'
  };
}

function normalizeBrowsePrice(appid, payload) {
  const items = payload?.response?.store_items;
  const item = Array.isArray(items) ? items.find(v => String(v?.appid || '') === String(appid)) || items[0] : null;
  if (!item || item.success === 0) return { appid, ok: false, error: 'storebrowse_not_available', source: 'storebrowse' };

  const option = item.best_purchase_option || item.self_purchase_option ||
    (Array.isArray(item.purchase_options) ? item.purchase_options.find(v => v && (v.packageid || v.bundleid)) || item.purchase_options[0] : null);

  const common = {
    appid,
    steamName: String(item.name || ''),
    source: 'storebrowse',
    fallbackUsed: true
  };

  if (item.is_free && !option) {
    return {
      ...common, ok: true, isFree: true, priceAvailable: true, currency: 'JPY',
      initialYen: 0, finalYen: 0, initialFormatted: '無料', finalFormatted: '無料',
      discountPercent: 0, onSale: false, availability: 'free'
    };
  }

  if (!option) {
    return {
      ...common, ok: true, isFree: Boolean(item.is_free), priceAvailable: false, currency: null,
      initialYen: null, finalYen: null, initialFormatted: null, finalFormatted: null,
      discountPercent: 0, onSale: false, availability: item.is_coming_soon ? 'coming_soon' : 'unpriced'
    };
  }

  const initialMinor = Number(option.original_price_in_cents);
  const finalMinor = Number(option.final_price_in_cents);
  const discountPercent = Number(option.discount_pct || 0);
  const initialYen = Number.isFinite(initialMinor) ? initialMinor / 100 : null;
  const finalYen = Number.isFinite(finalMinor) ? finalMinor / 100 : null;
  const activeDiscount = Array.isArray(option.active_discounts) ? option.active_discounts[0] : null;

  return {
    ...common,
    ok: true,
    isFree: Boolean(item.is_free),
    priceAvailable: Number.isFinite(finalMinor),
    currency: 'JPY',
    initialYen,
    finalYen,
    initialFormatted: String(option.formatted_original_price || (initialYen !== null ? formatYen(initialYen) : '')) || null,
    finalFormatted: String(option.formatted_final_price || (finalYen !== null ? formatYen(finalYen) : '')) || null,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    onSale: Number.isFinite(discountPercent) && discountPercent > 0 && Number.isFinite(finalMinor) && (!Number.isFinite(initialMinor) || finalMinor < initialMinor),
    saleEndsAt: activeDiscount?.discount_end_date ? new Date(Number(activeDiscount.discount_end_date) * 1000).toISOString() : null,
    availability: 'priced'
  };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchStoreBrowse(appid) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const input = {
      ids: [{ appid: Number(appid) }],
      context: { language: 'japanese', country_code: 'JP', steam_realm: 1 },
      data_request: { include_all_purchase_options: true, include_assets: true, include_basic_info: true }
    };
    const url = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`;
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 HARF-WAY-Sale-Watch/2.1' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`storebrowse_http_${response.status}`);
    return normalizeBrowsePrice(appid, await response.json());
  } catch (error) {
    return { appid, ok: false, error: error?.name === 'AbortError' ? 'storebrowse_timeout' : (error?.message || 'storebrowse_failed'), source: 'storebrowse' };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSteamApp(appid, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  let primary;
  try {
    const params = new URLSearchParams({ appids: appid, cc: 'JP', l: 'japanese', filters: 'basic,price_overview' });
    const response = await fetch(`https://store.steampowered.com/api/appdetails?${params}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 HARF-WAY-Sale-Watch/2.1' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 1) {
      clearTimeout(timeout);
      await sleep(500 + Math.floor(Math.random() * 350));
      return fetchSteamApp(appid, attempt + 1);
    }
    if (!response.ok) throw new Error(`steam_http_${response.status}`);
    primary = normalizePrice(appid, await response.json());
  } catch (error) {
    primary = { appid, ok: false, error: error?.name === 'AbortError' ? 'steam_timeout' : (error?.message || 'steam_fetch_failed'), source: 'appdetails' };
  } finally {
    clearTimeout(timeout);
  }

  if (primary?.ok && primary?.priceAvailable) return primary;
  const fallback = await fetchStoreBrowse(appid);
  if (fallback?.ok && fallback?.priceAvailable) {
    return {
      ...fallback,
      headerImage: primary?.headerImage || '',
      capsuleImage: primary?.capsuleImage || '',
      steamName: fallback.steamName || primary?.steamName || ''
    };
  }
  if (primary?.ok) return { ...primary, fallbackAttempted: true, fallbackError: fallback?.error || null };
  return fallback?.ok ? fallback : { ...primary, fallbackAttempted: true, fallbackError: fallback?.error || null };
}

export async function getSteamPrices(appids, forceRefresh = false) {
  const unique = [...new Set((appids || []).map(String).filter(v => /^\d+$/.test(v)))];
  const now = Date.now();
  const result = new Map();
  const missing = [];

  for (const appid of unique) {
    const hit = cache.get(appid);
    const ttl = hit?.value?.ok === false ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (!forceRefresh && hit && now - hit.fetchedAt < ttl) {
      result.set(appid, { ...hit.value, cached: true, fetchedAt: hit.fetchedAt });
    } else missing.push(appid);
  }

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const group = missing.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(group.map(fetchSteamApp));
    for (const row of rows) {
      const fetchedAt = Date.now();
      cache.set(row.appid, { fetchedAt, value: row });
      result.set(row.appid, { ...row, cached: false, fetchedAt });
    }
  }
  return result;
}

export const steamSaleCacheTtlSeconds = Math.floor(CACHE_TTL_MS / 1000);
