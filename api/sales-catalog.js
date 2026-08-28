import { neon } from '@neondatabase/serverless';
import coreGamesHandler from './core/games.js';
import { steamAppIdFromUrl } from './_steam-sale-core.js';

function getDatabaseUrl() {
  return (
    process.env.WAYS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

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

async function fetchSalvagedArticles() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return new Map();
  const sql = neon(databaseUrl);

  const rows = await sql`
    SELECT DISTINCT ON (l.game_id)
      l.game_id,
      c.url,
      c.title,
      c.status,
      c.published_at,
      c.updated_at
    FROM core.content_game_links l
    JOIN core.contents c ON c.id = l.content_id
    WHERE c.content_type = 'article'
      AND c.source = 'archive-salvager'
      AND COALESCE(c.url, '') <> ''
    ORDER BY
      l.game_id,
      CASE c.status
        WHEN 'published' THEN 0
        WHEN 'reviewed' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END,
      COALESCE(c.published_at, c.updated_at) DESC NULLS LAST,
      c.updated_at DESC NULLS LAST
  `;

  return new Map(rows.map(row => [String(row.game_id || ''), {
    url: String(row.url || ''),
    title: String(row.title || ''),
    status: String(row.status || ''),
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at || null
  }]));
}

function contentSources(game, hasSalvagedArticle = false) {
  const out = new Set();
  const add = value => {
    const v = String(value || '').toLowerCase();
    if (!v || v === 'steam') return;

    // Article visibility is intentionally strict: only a real Archive Salvager
    // content record linked to this game may create the public "article" source.
    if (v === 'archive-salvager' || v === 'archive' || v.includes('article')) return;
    if (v === 'ways' || v === 'playback') out.add('ways');
    else if (v === 'playlist') out.add('playlist');
    else if (v === 'yorimichi') out.add('yorimichi');
    else out.add(v);
  };

  add(game.sourceOfTruth);
  for (const ref of Array.isArray(game.refs) ? game.refs : []) add(ref?.service);
  if (hasSalvagedArticle) out.add('article');
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
    const [games, salvagedArticles] = await Promise.all([
      fetchCoreGames(),
      fetchSalvagedArticles().catch(error => {
        console.error('[sales-catalog] salvaged article query failed', error?.message || error);
        return new Map();
      })
    ]);

    const rows = games.map(game => {
      const storeUrl = String(game.storeUrl || '');
      const appid = steamAppIdFromUrl(storeUrl);
      const playlistMeta = refMetadata(game, 'playlist');
      const salvagedArticle = salvagedArticles.get(String(game.id || '')) || null;
      const articleUrl = String(salvagedArticle?.url || '');

      return {
        id: String(game.id || ''),
        title: String(game.title || ''),
        description: String(game.description || ''),
        storeUrl,
        // Do not expose game.articleUrl here. It can contain tracking / redirect URLs.
        // Public SALE WATCH only links articles that exist in Archive Salvager.
        articleUrl,
        salvagedArticle: salvagedArticle ? {
          title: salvagedArticle.title,
          status: salvagedArticle.status,
          url: articleUrl
        } : null,
        category: String(game.category || ''),
        tags: Array.isArray(game.tags) ? game.tags.map(String).filter(Boolean) : [],
        appid,
        steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '',
        sources: contentSources(game, Boolean(salvagedArticle)),
        sourceOfTruth: String(game.sourceOfTruth || ''),
        thumbnail: thumbnailFromRefs(game),
        playlists: playlistMeta.map(meta => String(meta?.playlist_id || '')).filter(Boolean)
      };
    });

    const sourceCounts = {};
    for (const row of rows) for (const source of row.sources) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const steamLinked = rows.filter(row => row.appid).length;
    const articleRows = rows.filter(row => row.salvagedArticle);
    const articleWithoutSteam = articleRows.filter(row => !row.appid && row.articleUrl).length;

    return res.status(200).json({
      ok: true,
      source: 'shared-content-core',
      articlePolicy: 'archive-salvager-only',
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
