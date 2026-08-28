import { getSteamPrices } from './_steam-sale-core.js';

const BATCH_SIZE = 50;

function formatYen(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function normalizeItem(appid, item) {
  if (!item || item.success === 0) return null;
  const option = item.best_purchase_option || item.self_purchase_option ||
    (Array.isArray(item.purchase_options) ? item.purchase_options.find(v => v && (v.packageid || v.bundleid)) || item.purchase_options[0] : null);

  const common = {
    appid: String(appid),
    ok: true,
    steamName: String(item.name || ''),
    source: 'storebrowse-batch',
    fallbackUsed: true
  };

  if (item.is_free && !option) {
    return {
      ...common, isFree: true, priceAvailable: true, currency: 'JPY', initialYen: 0, finalYen: 0,
      initialFormatted: '無料', finalFormatted: '無料', discountPercent: 0, onSale: false, availability: 'free'
    };
  }
  if (!option) {
    return {
      ...common, isFree: Boolean(item.is_free), priceAvailable: false, currency: null,
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

async function fetchBatch(appids) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const input = {
      ids: appids.map(appid => ({ appid: Number(appid) })),
      context: { language: 'japanese', country_code: 'JP', steam_realm: 1 },
      data_request: { include_all_purchase_options: true, include_assets: false, include_basic_info: true }
    };
    const url = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`;
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 HARF-WAY-Sale-Watch/3.0' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`storebrowse_http_${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload?.response?.store_items) ? payload.response.store_items : [];
    const byId = new Map(items.map(item => [String(item?.appid || ''), item]));
    const out = new Map();
    for (const appid of appids) {
      const normalized = normalizeItem(appid, byId.get(String(appid)));
      if (normalized) out.set(String(appid), normalized);
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const raw = String(req.query?.appids || '');
  const appids = [...new Set(raw.split(',').map(v => v.trim()).filter(v => /^\d+$/.test(v)))].slice(0, 250);
  if (!appids.length) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ ok: true, appids: [], prices: {}, onSale: 0 });
  }

  try {
    const groups = [];
    for (let i = 0; i < appids.length; i += BATCH_SIZE) groups.push(appids.slice(i, i + BATCH_SIZE));
    const batchResults = await Promise.all(groups.map(group => fetchBatch(group).catch(() => new Map())));
    const prices = {};
    for (const map of batchResults) for (const [appid, price] of map) prices[appid] = price;

    const missing = appids.filter(appid => !prices[appid]);
    if (missing.length) {
      const fallback = await getSteamPrices(missing, false);
      for (const appid of missing) prices[appid] = fallback.get(appid) || { appid, ok: false, error: 'price_missing' };
    }

    const values = appids.map(appid => prices[appid]).filter(Boolean);
    const onSale = values.filter(v => v?.ok && v?.onSale).length;
    const available = values.filter(v => v?.ok && v?.priceAvailable).length;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({
      ok: true,
      country: 'JP', currency: 'JPY', updatedAt: new Date().toISOString(),
      appids, prices, summary: { requested: appids.length, available, onSale, missing: missing.length }
    });
  } catch (error) {
    console.error('[sale-price-snapshot]', error?.message || error);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(503).json({ ok: false, error: 'sale_price_snapshot_unavailable' });
  }
}
