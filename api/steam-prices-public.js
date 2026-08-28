const PRODUCTION_PRICE_API = 'https://harfway-playback.vercel.app/api/steam-prices-public';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('X-HARFWAY-Preview-Price-Source', 'production-cache');

  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const raw = String(req.query?.appids || '');
  const appids = [...new Set(raw.split(',').map(v => v.trim()).filter(v => /^\d+$/.test(v)))].slice(0, 8);
  const forceRefresh = String(req.query?.refresh || '') === '1';

  if (!appids.length) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({ ok: true, appids: [], prices: {}, previewPriceSource: 'production-cache' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = new URL(PRODUCTION_PRICE_API);
    upstream.searchParams.set('appids', appids.join(','));
    if (forceRefresh) upstream.searchParams.set('refresh', '1');

    const response = await fetch(upstream, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    const payload = await response.json();

    const upstreamCache = response.headers.get('cache-control');
    res.setHeader('Cache-Control', upstreamCache || 'public, s-maxage=300, stale-while-revalidate=900');
    return res.status(response.status).json({ ...payload, previewPriceSource: 'production-cache' });
  } catch (error) {
    console.error('[preview-price-proxy]', error?.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok: false, error: 'production_price_proxy_failed' });
  } finally {
    clearTimeout(timeout);
  }
}
