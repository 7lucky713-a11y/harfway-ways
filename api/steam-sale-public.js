import staticGamesHandler from './games.js';
import { getSteamPrices, steamAppIdFromUrl, summarizeSaleRows } from './_steam-sale-core.js';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

function normalizeGame(game = {}, index = 0) {
  return {
    id: String(game.id || `game-${index}`),
    title: String(game.title || ''),
    storeUrl: String(game.storeUrl || game.store_url || ''),
    articleUrl: String(game.articleUrl || game.article_url || ''),
    category: game.category === '通常' ? '' : String(game.category || ''),
    tags: Array.isArray(game.tags) ? game.tags.map(String).filter(Boolean) : [],
    thumbnail: String(game.thumbnail || game.thumbnailUrl || game.thumbnail_url || ''),
    status: game.status === 'published' ? 'published' : 'draft'
  };
}

function staticFallback() {
  let statusCode = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };
  staticGamesHandler({ method: 'GET' }, res);
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) {
    throw new Error('static_games_fallback_failed');
  }
  return payload.entries.map(normalizeGame);
}

async function publicCatalog() {
  const key = String(process.env.WAYS_EDITOR_ADMIN_KEY || '').trim();
  if (key) {
    try {
      const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'x-showcase-admin-key': key
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`editor_state_${response.status}`);
      const games = Array.isArray(data?.state?.games) ? data.state.games.map(normalizeGame) : [];
      if (games.length) return { games, source: 'ways-editor' };
    } catch (error) {
      console.warn('[steam-sale-public] editor unavailable:', error?.message || error);
    }
  }
  return { games: staticFallback(), source: 'static-fallback' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow');
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const catalog = await publicCatalog();
    const published = catalog.games
      .filter(game => game.status === 'published')
      .map(game => ({ ...game, appid: steamAppIdFromUrl(game.storeUrl) }))
      .filter(game => game.appid);

    const appids = [...new Set(published.map(game => game.appid))];
    const prices = await getSteamPrices(appids, false);
    const rows = published.map(game => ({
      id: game.id,
      title: game.title,
      appid: game.appid,
      category: game.category,
      tags: game.tags,
      articleUrl: game.articleUrl,
      thumbnail: game.thumbnail,
      steamUrl: `https://store.steampowered.com/app/${game.appid}/`,
      price: prices.get(game.appid) || { appid: game.appid, ok: false, error: 'price_missing' }
    }));

    rows.sort((a, b) => {
      if (Boolean(a.price?.onSale) !== Boolean(b.price?.onSale)) return a.price?.onSale ? -1 : 1;
      const discount = Number(b.price?.discountPercent || 0) - Number(a.price?.discountPercent || 0);
      if (discount) return discount;
      const ap = Number.isFinite(a.price?.finalYen) ? a.price.finalYen : Infinity;
      const bp = Number.isFinite(b.price?.finalYen) ? b.price.finalYen : Infinity;
      return ap - bp || a.title.localeCompare(b.title, 'ja');
    });

    const summary = summarizeSaleRows(rows);
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({
      ok: true,
      source: `${catalog.source} + steam-store-single`,
      country: 'JP',
      currency: 'JPY',
      updatedAt: new Date().toISOString(),
      summary,
      rows
    });
  } catch (error) {
    console.error('[steam-sale-public]', error?.message || error);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(503).json({ ok: false, error: 'sale_data_unavailable' });
  }
}
