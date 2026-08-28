const BATCH_SIZE = 90;

function formatYen(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function normalizePrice(appid, root) {
  const data = root?.data || root;
  const p = data?.price_overview || null;
  if (!root?.success || !p) {
    return { appid: String(appid), ok: false, priceAvailable: false, error: root?.success === false ? 'steam_not_available' : 'price_unavailable', source: 'appdetails-batch' };
  }

  const currency = String(p.currency || '');
  const initialMinor = Number(p.initial);
  const finalMinor = Number(p.final);
  const discountPercent = Number(p.discount_percent || 0);
  const isJpy = currency === 'JPY';
  const initialYen = isJpy && Number.isFinite(initialMinor) ? initialMinor / 100 : null;
  const finalYen = isJpy && Number.isFinite(finalMinor) ? finalMinor / 100 : null;

  return {
    appid: String(appid),
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
    availability: 'priced',
    source: 'appdetails-batch'
  };
}

async function fetchBatch(appids) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({
      appids: appids.join(','),
      cc: 'JP',
      l: 'japanese',
      filters: 'price_overview'
    });
    const response = await fetch(`https://store.steampowered.com/api/appdetails?${params}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 HARF-WAY-Sale-Watch/3.1' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`steam_batch_http_${response.status}`);
    const payload = await response.json();
    const prices = {};
    for (const appid of appids) prices[appid] = normalizePrice(appid, payload?.[appid]);
    return prices;
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
    return res.status(200).json({ ok: true, appids: [], prices: {}, summary: { requested: 0, available: 0, onSale: 0, missing: 0 } });
  }

  try {
    const groups = [];
    for (let i = 0; i < appids.length; i += BATCH_SIZE) groups.push(appids.slice(i, i + BATCH_SIZE));
    const results = await Promise.all(groups.map(fetchBatch));
    const prices = Object.assign({}, ...results);
    const values = appids.map(appid => prices[appid]).filter(Boolean);
    const onSale = values.filter(v => v?.ok && v?.onSale).length;
    const available = values.filter(v => v?.ok && v?.priceAvailable).length;
    const missing = values.filter(v => !v?.ok || !v?.priceAvailable).length;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({
      ok: true,
      country: 'JP',
      currency: 'JPY',
      updatedAt: new Date().toISOString(),
      appids,
      prices,
      summary: { requested: appids.length, available, onSale, missing, batches: groups.length, source: 'appdetails-batch' }
    });
  } catch (error) {
    console.error('[sale-price-snapshot]', error?.message || error);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(503).json({ ok: false, error: 'sale_price_snapshot_unavailable' });
  }
}
