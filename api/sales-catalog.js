import coreGamesHandler from './core/games.js';
import { steamAppIdFromUrl } from './_steam-sale-core.js';

async function fetchCoreGames() {
  let statusCode = 200;
  let payload = null;
  const req = { method: 'GET', query: { limit: '500' } };
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };
  await coreGamesHandler(req, res);
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.games)) {
    throw new Error(payload?.error || `core_${statusCode}`);
  }
  return payload.games;
}

function contentSources(game) {
  const out = new Set();
  const add = value => {
    const v = String(value || '').toLowerCase();
    if (!v || v === 'steam') return;
    if (v === 'archive-salvager' || v === 'archive' || v.includes('article')) out.add('article');
    else if (v === 'ways' || v === 'playback') out.add('ways');
    else if (v === 'playlist') out.add('playlist');
    else if (v === 'yorimichi') out.add('yorimichi');
    else out.add(v);
  };
  add(game.sourceOfTruth);
  for (const ref of Array.isArray(game.refs) ? game.refs : []) add(ref?.service);
  if (game.articleUrl) out.add('article');
  return [...out];
}

function refMetadata(game, service) {
  return (Array.isArray(game.refs) ? game.refs : [])
    .filter(ref => String(ref?.service || '').toLowerCase() === service)
    .map(ref => ref?.metadata || {});
}

function thumbnailFromRefs(game) {
  for (const ref of Array.isArray(game.refs) ? game.refs : []) {
    const value = String(ref?.metadata?.thumbnail || ref?.metadata?.thumbnailUrl || '').trim();
    if (value) return value;
  }
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'index, follow');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const games = await fetchCoreGames();
    const rows = games.map(game => {
      const storeUrl = String(game.storeUrl || '');
      const appid = steamAppIdFromUrl(storeUrl);
      const playlistMeta = refMetadata(game, 'playlist');
      return {
        id: String(game.id || ''),
        title: String(game.title || ''),
        description: String(game.description || ''),
        storeUrl,
        articleUrl: String(game.articleUrl || ''),
        category: String(game.category || ''),
        tags: Array.isArray(game.tags) ? game.tags.map(String).filter(Boolean) : [],
        appid,
        steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '',
        sources: contentSources(game),
        sourceOfTruth: String(game.sourceOfTruth || ''),
        thumbnail: thumbnailFromRefs(game),
        playlists: playlistMeta.map(meta => String(meta?.playlist_id || '')).filter(Boolean)
      };
    });

    const sourceCounts = {};
    for (const row of rows) for (const source of row.sources) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const steamLinked = rows.filter(row => row.appid).length;
    const articleRows = rows.filter(row => row.sources.includes('article'));
    const articleWithoutSteam = articleRows.filter(row => !row.appid && row.articleUrl).length;

    return res.status(200).json({
      ok: true,
      source: 'shared-content-core',
      updatedAt: new Date().toISOString(),
      summary: {
        total: rows.length,
        steamLinked,
        articleRows: articleRows.length,
        articleWithoutSteam,
        sourceCounts
      },
      rows
    });
  } catch (error) {
    console.error('[sales-catalog]', error?.message || error);
    return res.status(503).json({ ok: false, error: 'sale_catalog_unavailable' });
  }
}
