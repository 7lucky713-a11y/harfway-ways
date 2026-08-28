import { getSteamPrices, steamSaleCacheTtlSeconds } from './_steam-sale-core.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const raw = String(req.query?.appids || '');
  const appids = [...new Set(raw.split(',').map(v => v.trim()).filter(v => /^\d+$/.test(v)))].slice(0, 8);
  const forceRefresh = String(req.query?.refresh || '') === '1';
  if (!appids.length) {
    res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 'public, s-maxage=60');
    return res.status(200).json({ ok: true, appids: [], prices: {} });
  }

  try {
    const map = await getSteamPrices(appids, forceRefresh);
    const prices = {};
    for (const appid of appids) prices[appid] = map.get(appid) || { appid, ok: false, error: 'price_missing' };
    const values = Object.values(prices);
    const incomplete = values.some(v => !v?.ok || !v?.priceAvailable);
    if (forceRefresh) res.setHeader('Cache-Control', 'no-store');
    else if (incomplete) res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=180');
    else res.setHeader('Cache-Control', `public, s-maxage=${steamSaleCacheTtlSeconds}, stale-while-revalidate=1800`);
    return res.status(200).json({
      ok: true,
      country: 'JP',
      currency: 'JPY',
      updatedAt: new Date().toISOString(),
      forced: forceRefresh,
      incomplete,
      appids,
      prices
    });
  } catch (error) {
    console.error('[steam-prices-public]', error?.message || error);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(503).json({ ok: false, error: 'steam_prices_unavailable' });
  }
}
