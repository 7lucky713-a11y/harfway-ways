import { getSteamPrices, steamAppIdFromUrl, summarizeSaleRows, steamSaleCacheTtlSeconds } from './_steam-sale-core.js';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

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
    const prices = await getSteamPrices(uniqueAppids, forceRefresh);

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
      source: 'ways-editor + steam-store-single',
      country: 'JP',
      currency: 'JPY',
      cacheTtlSeconds: steamSaleCacheTtlSeconds,
      refreshed: forceRefresh,
      updatedAt: new Date().toISOString(),
      totalGames: games.length,
      nonSteamStoreUrls: games.filter(game => game.storeUrl && !steamAppIdFromUrl(game.storeUrl)).length,
      missingStoreUrls: games.filter(game => !game.storeUrl).length,
      summary: summarizeSaleRows(rows),
      rows
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[steam-sale]', error?.message || error);
    return res.status(status).json({ ok: false, error: error?.message || 'steam_sale_failed' });
  }
}
