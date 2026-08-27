import { neon } from '@neondatabase/serverless';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

function adminKey(req) {
  return String(req.headers['x-showcase-admin-key'] || req.headers['x-admin-key'] || '').trim();
}

async function editorRequest(target, key, options = {}) {
  const response = await fetch(`${EDITOR_URL}/api/proxy?target=${encodeURIComponent(target)}`, {
    cache: 'no-store',
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      'x-showcase-admin-key': key,
      ...(options.headers || {})
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
    description: String(game.description || ''),
    video: String(game.video || game.video_url || ''),
    thumbnail: String(game.thumbnail || game.thumbnailUrl || game.thumbnail_url || ''),
    tags: Array.isArray(game.tags) ? game.tags.map(String) : [],
    articleUrl: String(game.articleUrl || game.article_url || ''),
    storeUrl: String(game.storeUrl || game.store_url || ''),
    category: game.category === '通常' ? '' : String(game.category || ''),
    status: game.status === 'published' ? 'published' : 'draft',
    sponsored: Boolean(game.sponsored),
    sponsorName: String(game.sponsorName || game.sponsor_name || ''),
    sortOrder: Number.isFinite(Number(game.sortOrder ?? game.sort_order)) ? Number(game.sortOrder ?? game.sort_order) : index,
    fastStart: Boolean(game.fastStart ?? game.fast_start),
    videoWidth: Number(game.videoWidth ?? game.video_width ?? 0) || 0,
    videoHeight: Number(game.videoHeight ?? game.video_height ?? 0) || 0,
    videoDuration: Number(game.videoDuration ?? game.video_duration ?? 0) || 0,
    videoOrientation: String(game.videoOrientation || game.video_orientation || ''),
    videoLayoutMode: String(game.videoLayoutMode || game.video_layout_mode || 'auto')
  };
}

function summarize(state) {
  const games = Array.isArray(state?.games) ? state.games.map(normalizeGame) : [];
  const showcases = Array.isArray(state?.showcases) ? state.showcases : [];
  const published = games.filter(g => g.status === 'published').length;
  const draft = games.length - published;
  const missingStore = games.filter(g => !g.storeUrl).length;
  const missingVideo = games.filter(g => !g.video).length;
  const missingArticle = games.filter(g => !g.articleUrl).length;
  const missingCategory = games.filter(g => !g.category).length;
  return {
    games: games.length,
    published,
    draft,
    showcases: showcases.length,
    missingStore,
    missingVideo,
    missingArticle,
    missingCategory
  };
}

function coreDatabaseUrl() {
  return (
    process.env.WAYS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readCoreArticles() {
  const databaseUrl = coreDatabaseUrl();
  if (!databaseUrl) {
    return { available: false, configured: false, articles: [], error: 'core_database_not_configured' };
  }

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT
        id,
        title,
        url,
        published_at,
        excerpt,
        status,
        source,
        games,
        assets,
        updated_at
      FROM core.content_catalog
      WHERE content_type = 'article'
      ORDER BY updated_at DESC
      LIMIT 500
    `;

    const articles = rows.map((row) => ({
      id: String(row.id || ''),
      title: String(row.title || ''),
      url: String(row.url || ''),
      publishedAt: row.published_at || null,
      excerpt: String(row.excerpt || ''),
      status: String(row.status || ''),
      source: String(row.source || ''),
      games: normalizeJsonArray(row.games),
      assets: normalizeJsonArray(row.assets),
      updatedAt: row.updated_at || null
    }));

    return {
      available: true,
      configured: true,
      articles,
      summary: {
        articles: articles.length,
        reviewed: articles.filter((a) => a.status === 'reviewed' || a.status === 'published').length,
        draft: articles.filter((a) => a.status === 'draft').length,
        gameLinks: articles.reduce((sum, a) => sum + a.games.length, 0)
      }
    };
  } catch (error) {
    console.error('[db-master-core]', error);
    return { available: false, configured: true, articles: [], error: 'core_articles_unavailable' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const key = adminKey(req);
  if (!key) return res.status(401).json({ ok: false, error: 'admin_key_required' });

  try {
    if (req.method === 'GET') {
      const [data, core] = await Promise.all([
        editorRequest('state', key),
        readCoreArticles()
      ]);
      const state = data?.state || { games: [], showcases: [] };
      return res.status(200).json({
        ok: true,
        state,
        summary: summarize(state),
        source: 'ways-editor',
        core
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body.state || !Array.isArray(body.state.games)) {
        return res.status(400).json({ ok: false, error: 'invalid_state' });
      }
      const result = await editorRequest('state', key, {
        method: 'POST',
        body: JSON.stringify({ state: body.state })
      });
      return res.status(200).json({ ok: true, result, summary: summarize(body.state) });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[db-master]', error?.message || error);
    return res.status(status).json({ ok: false, error: error?.message || 'db_master_failed' });
  }
}
