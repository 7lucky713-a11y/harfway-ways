import { getSteamPrices, steamAppIdFromUrl, summarizeSaleRows, steamSaleCacheTtlSeconds } from './_steam-sale-core.js';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

async function fetchPublishedGames() {
  const key = process.env.WAYS_EDITOR_ADMIN_KEY;
  if (!key) throw new Error('WAYS_EDITOR_ADMIN_KEY_missing');
  const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
    cache: 'no-store',
    headers: { accept: 'application/json', 'x-showcase-admin-key': key }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`editor_state_${response.status}`);
  const games = Array.isArray(data?.state?.games) ? data.state.games : [];
  return games
    .filter(game => game?.status === 'published')
    .map((game, index) => ({
      id: String(game?.id || `game-${index}`),
      title: String(game?.title || ''),
      description: String(game?.description || ''),
      storeUrl: String(game?.storeUrl || game?.store_url || ''),
      articleUrl: String(game?.articleUrl || game?.article_url || ''),
      category: game?.category === '通常' ? '' : String(game?.category || ''),
      tags: Array.isArray(game?.tags) ? game.tags.map(String) : [],
      thumbnail: String(game?.thumbnail || game?.thumbnailUrl || game?.thumbnail_url || '')
    }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const games = await fetchPublishedGames();
    const steamGames = games.map(game => ({ ...game, appid: steamAppIdFromUrl(game.storeUrl) })).filter(game => game.appid);
    const appids = [...new Set(steamGames.map(game => game.appid))];
    const prices = await getSteamPrices(appids, false);
    const rows = steamGames.map(game => ({
      ...game,
      steamUrl: `https://store.steampowered.com/app/${game.appid}/`,
      price: prices.get(game.appid) || { appid: game.appid, ok: false, error: 'price_missing' }
    }));

    const visibleRows = rows.filter(row => row.price?.ok && row.price?.onSale).sort((a, b) => {
      const d = Number(b.price?.discountPercent || 0) - Number(a.price?.discountPercent || 0);
      if (d) return d;
      return Number(a.price?.finalYen ?? Infinity) - Number(b.price?.finalYen ?? Infinity);
    });

    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      country: 'JP',
      currency: 'JPY',
      cacheTtlSeconds: steamSaleCacheTtlSeconds,
      summary: summarizeSaleRows(rows),
      rows: visibleRows
    });
  } catch (error) {
    console.error('[sales-public]', error?.message || error);
    return res.status(503).json({ ok: false, error: 'sales_unavailable' });
  }
}
