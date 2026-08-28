import { neon } from '@neondatabase/serverless';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const PRODUCTION_BASE = 'https://harfway-playback.vercel.app';
const SCRAPS_API = 'https://harfway-scraps-recovery.vercel.app/api/scraps';

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
  return { games: games.length, published, draft: games.length - published, showcases: showcases.length };
}

function coreDatabaseUrl() {
  return process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
}

function array(value) { return Array.isArray(value) ? value : []; }
function string(value) { return String(value || '').trim(); }

function normalizeCoreGame(row = {}) {
  return {
    id: string(row.id), title: string(row.title), description: string(row.description),
    storeUrl: string(row.storeUrl || row.store_url), articleUrl: string(row.articleUrl || row.article_url),
    category: string(row.category), status: string(row.status), sourceOfTruth: string(row.sourceOfTruth || row.source_of_truth),
    tags: array(row.tags), refs: array(row.refs), createdAt: row.createdAt || row.created_at || null, updatedAt: row.updatedAt || row.updated_at || null
  };
}

function normalizeCoreArticle(row = {}, sourceLayer = 'core') {
  return {
    id: string(row.id), title: string(row.title), url: string(row.url),
    publishedAt: row.publishedAt || row.published_at || null, excerpt: string(row.excerpt), status: string(row.status),
    source: string(row.source || 'archive-salvager'), sourceLayer, games: array(row.games), assets: array(row.assets),
    gameCount: Number(row.game_count ?? array(row.games).length) || 0,
    assetCount: Number(row.asset_count ?? array(row.assets).length) || 0,
    updatedAt: row.updatedAt || row.updated_at || null
  };
}

function coreSummary(games, articles) {
  return {
    games: games.length, articles: articles.length,
    articleOriginGames: games.filter(g => g.sourceOfTruth === 'archive-salvager').length,
    waysGames: games.filter(g => array(g.refs).some(r => r?.service === 'ways')).length,
    playlistGames: games.filter(g => array(g.refs).some(r => r?.service === 'playlist')).length,
    yorimichiGames: games.filter(g => array(g.refs).some(r => r?.service === 'yorimichi')).length
  };
}

async function readCoreViaProductionApi(key, fallbackReason = 'preview_core_fallback') {
  try {
    const [gamesResult, articlesResult] = await Promise.allSettled([
      fetch(`${PRODUCTION_BASE}/api/core/games?limit=500`, { cache: 'no-store', headers: { accept: 'application/json' } }),
      fetch(`${PRODUCTION_BASE}/api/archive-items?limit=500`, { cache: 'no-store', headers: { accept: 'application/json', 'x-showcase-admin-key': key, 'x-admin-key': key } })
    ]);
    if (gamesResult.status !== 'fulfilled' || !gamesResult.value.ok) {
      return { available: false, configured: false, games: [], articles: [], error: 'production_core_api_unavailable', fallbackReason };
    }
    const gamesPayload = await gamesResult.value.json().catch(() => ({}));
    const games = array(gamesPayload?.games).map(normalizeCoreGame);
    let articles = [];
    if (articlesResult.status === 'fulfilled' && articlesResult.value.ok) {
      const payload = await articlesResult.value.json().catch(() => ({}));
      articles = array(payload?.items).map(x => normalizeCoreArticle(x, 'production-core'));
    }
    return { available: true, configured: true, readSource: 'production-core-api-fallback', fallbackReason, games, articles, summary: coreSummary(games, articles) };
  } catch (error) {
    console.error('[db-master-core-fallback]', error);
    return { available: false, configured: false, games: [], articles: [], error: 'production_core_api_failed', fallbackReason };
  }
}

async function readCore(key) {
  const databaseUrl = coreDatabaseUrl();
  if (!databaseUrl) return readCoreViaProductionApi(key, 'core_database_not_configured');
  try {
    const sql = neon(databaseUrl);
    const [gameRows, articleRows] = await Promise.all([
      sql`SELECT c.id,c.title,c.description,c.store_url,c.article_url,c.category,c.status,c.source_of_truth,c.tags,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('service',r.service,'externalId',r.external_id,'externalUrl',r.external_url,'metadata',r.metadata) ORDER BY r.service,r.external_id) FROM core.game_refs r WHERE r.game_id=c.id),'[]'::jsonb) AS refs,
        c.created_at,c.updated_at FROM core.game_catalog c WHERE c.status='active' ORDER BY c.updated_at DESC,c.title ASC LIMIT 1000`,
      sql`SELECT id,title,url,published_at,excerpt,status,source,games,assets,updated_at FROM core.content_catalog WHERE content_type='article' ORDER BY updated_at DESC LIMIT 1000`
    ]);
    const games = gameRows.map(normalizeCoreGame);
    const articles = articleRows.map(x => normalizeCoreArticle(x, 'current-core'));
    return { available: true, configured: true, readSource: 'direct-core-database', games, articles, summary: coreSummary(games, articles) };
  } catch (error) {
    console.warn('[db-master-core] direct Core read failed; using production API fallback', error?.code || error?.message || error);
    return readCoreViaProductionApi(key, error?.code || 'direct_core_query_failed');
  }
}

async function readSalvagerPreview() {
  const databaseUrl = process.env.SALVAGER_PREVIEW_DATABASE_URL || '';
  if (!databaseUrl) return { available: false, configured: false, items: [], count: 0, readSource: 'salvager-preview-not-configured' };
  try {
    const sql = neon(databaseUrl);
    const rows = await sql`SELECT id,title,url,published_at,status,excerpt,source,games,assets,updated_at FROM core.content_catalog WHERE source='archive-salvager' ORDER BY updated_at DESC LIMIT 1000`;
    const items = rows.map(x => normalizeCoreArticle(x, 'salvager-preview'));
    return { available: true, configured: true, items, count: items.length, readSource: 'salvager-preview-database' };
  } catch (error) {
    console.warn('[db-master-salvager-preview]', error?.code || error?.message || error);
    return { available: false, configured: true, items: [], count: 0, error: 'salvager_preview_read_failed' };
  }
}

function steamAppId(value) {
  const match = string(value).match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match ? match[1] : '';
}

function normalizeTitle(value) {
  return string(value).normalize('NFKC').toLowerCase()
    .replace(/[（(]\s*(?:体験版|demo)\s*[）)]/gi, '')
    .replace(/\s*(?:[-–—:]?\s*demo)\s*$/gi, '')
    .replace(/[\s\u3000'’“”"・:：!！?？,，.。\/\\_-]+/g, '');
}

function buildCoreIndex(games) {
  const bySteam = new Map(), byTitle = new Map();
  for (const game of games) {
    const ids = new Set([steamAppId(game.storeUrl)]);
    for (const ref of array(game.refs)) {
      ids.add(steamAppId(ref?.externalUrl));
      if (ref?.metadata?.steam_app_id) ids.add(string(ref.metadata.steam_app_id));
    }
    for (const id of ids) if (id && !bySteam.has(id)) bySteam.set(id, game);
    const title = normalizeTitle(game.title);
    if (title) {
      if (!byTitle.has(title)) byTitle.set(title, []);
      byTitle.get(title).push(game);
    }
  }
  return { bySteam, byTitle };
}

function matchGame(item, index) {
  const id = steamAppId(item.store || item.storeUrl || item.sourceStore || '');
  if (id && index.bySteam.has(id)) return { game: index.bySteam.get(id), type: 'steam-app-id', confidence: 100 };
  const title = normalizeTitle(item.title);
  const matches = title ? (index.byTitle.get(title) || []) : [];
  if (matches.length === 1) return { game: matches[0], type: 'title', confidence: 88 };
  return { game: null, type: 'unmatched', confidence: 0 };
}

function normalizeScrap(item = {}, index, coreIndex) {
  const match = matchGame(item, coreIndex);
  return {
    id: string(item.id || `scrap-${index}`), title: string(item.title), date: item.date || null, month: string(item.month),
    week: string(item.week), weekSlug: string(item.weekSlug), order: Number(item.order) || 0,
    catchText: string(item.catch), note: string(item.note), detail: string(item.detail), tags: array(item.tags), image: string(item.image),
    storeUrl: string(item.store), scrapUrl: string(item.scrap), videoUrl: string(item.video), fullTextSource: Boolean(item.fullTextSource),
    gameId: match.game?.id || '', gameTitle: match.game?.title || '', matchType: match.type, matchConfidence: match.confidence
  };
}

async function readScraps(coreGames) {
  try {
    const response = await fetch(SCRAPS_API, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) return { available: false, items: [], count: 0, error: `scraps_${response.status}` };
    const payload = await response.json().catch(() => ({}));
    const index = buildCoreIndex(coreGames);
    const items = array(payload?.items).map((x, i) => normalizeScrap(x, i, index));
    return {
      available: true, readSource: 'scraps-recovery-api', items, count: items.length,
      totalWeeks: Number(payload?.totalWeeks) || 0, totalFullText: Number(payload?.totalFullText) || 0,
      matched: items.filter(x => x.gameId).length, unmatched: items.filter(x => !x.gameId).length
    };
  } catch (error) {
    console.warn('[db-master-scraps]', error?.message || error);
    return { available: false, items: [], count: 0, error: 'scraps_read_failed' };
  }
}

const PLAYLIST_NAMES = {
  vol01: 'とっておき2Dアクション', vol02: 'ぶっとびスポーツ', vol03: '操作ムズすぎドライブゲー',
  vol04: 'ダークパルクール', vol05: 'だいぶ灰色トレードゲーム', vol06: 'クリーチャーを集めて育てるローグライク系', vol07: 'グリーンアポカリプス'
};

function derivePlaylists(coreGames) {
  const map = new Map();
  for (const game of coreGames) {
    for (const ref of array(game.refs).filter(r => r?.service === 'playlist')) {
      const playlistId = string(ref?.metadata?.playlist_id) || 'unknown';
      if (!map.has(playlistId)) map.set(playlistId, { id: playlistId, title: PLAYLIST_NAMES[playlistId] || playlistId.toUpperCase(), games: [] });
      map.get(playlistId).games.push({ gameId: game.id, title: game.title, storeUrl: game.storeUrl || string(ref.externalUrl), externalId: string(ref.externalId), steamAppId: string(ref?.metadata?.steam_app_id) });
    }
  }
  const items = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { available: true, readSource: 'shared-content-core-refs', items, count: items.length, gameCount: items.reduce((n, x) => n + x.games.length, 0) };
}

function articleGameIds(article) {
  return array(article?.games).map(x => typeof x === 'string' ? x : string(x?.gameId || x?.game_id || x?.id)).filter(Boolean);
}

function mergeArticles(primary, preview) {
  const map = new Map();
  for (const article of [...primary, ...preview]) {
    const key = article.url || article.id;
    const current = map.get(key);
    if (!current || article.sourceLayer === 'salvager-preview') map.set(key, article);
  }
  return [...map.values()].sort((a, b) => String(b.updatedAt || b.publishedAt || '').localeCompare(String(a.updatedAt || a.publishedAt || '')));
}

function buildRelations(coreGames, waysGames, scraps, articles) {
  const relations = {};
  const ensure = id => relations[id] || (relations[id] = { ways: [], playlists: [], scraps: [], articles: [], yorimichi: [] });
  const index = buildCoreIndex(coreGames);
  for (const game of coreGames) {
    const out = ensure(game.id);
    for (const ref of array(game.refs)) {
      if (ref?.service === 'playlist') out.playlists.push({ externalId: string(ref.externalId), playlistId: string(ref?.metadata?.playlist_id), title: PLAYLIST_NAMES[string(ref?.metadata?.playlist_id)] || string(ref?.metadata?.playlist_id) });
      if (ref?.service === 'ways') out.ways.push({ externalId: string(ref.externalId), videoUrl: string(ref?.metadata?.video_url) });
      if (ref?.service === 'yorimichi') out.yorimichi.push({ externalId: string(ref.externalId), shop: string(ref?.metadata?.shop), url: string(ref.externalUrl) });
    }
  }
  for (const scrap of scraps) if (scrap.gameId) ensure(scrap.gameId).scraps.push({ id: scrap.id, title: scrap.title, date: scrap.date, week: scrap.week, url: scrap.scrapUrl });
  for (const article of articles) for (const gameId of articleGameIds(article)) ensure(gameId).articles.push({ id: article.id, title: article.title, url: article.url, status: article.status, sourceLayer: article.sourceLayer });
  for (const way of waysGames) {
    const match = matchGame({ title: way.title, store: way.storeUrl }, index);
    if (match.game) {
      way.coreGameId = match.game.id;
      way.coreMatchType = match.type;
      const out = ensure(match.game.id);
      if (!out.ways.some(x => x.externalId === way.id)) out.ways.push({ externalId: way.id, videoUrl: way.video || '' });
    }
  }
  return relations;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = adminKey(req);
  if (!key) return res.status(401).json({ ok: false, error: 'admin_key_required' });
  try {
    if (req.method === 'GET') {
      const [data, core, salvagerPreview] = await Promise.all([editorRequest('state', key), readCore(key), readSalvagerPreview()]);
      const state = data?.state || { games: [], showcases: [] };
      state.games = array(state.games).map(normalizeGame);
      const coreGames = array(core.games);
      const [scraps] = await Promise.all([readScraps(coreGames)]);
      const playlists = derivePlaylists(coreGames);
      const articles = mergeArticles(array(core.articles), array(salvagerPreview.items));
      const relations = buildRelations(coreGames, state.games, array(scraps.items), articles);
      return res.status(200).json({
        ok: true, source: 'db-master-v2-cross-source', state, summary: summarize(state), core,
        sources: { playlists, scraps, articles: { available: core.available || salvagerPreview.available, items: articles, count: articles.length, productionCount: array(core.articles).length, previewCount: array(salvagerPreview.items).length, previewConfigured: salvagerPreview.configured, previewReadSource: salvagerPreview.readSource } },
        relations
      });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body.state || !Array.isArray(body.state.games)) return res.status(400).json({ ok: false, error: 'invalid_state' });
      const result = await editorRequest('state', key, { method: 'POST', body: JSON.stringify({ state: body.state }) });
      return res.status(200).json({ ok: true, result, summary: summarize(body.state), writeTarget: 'ways-editor-only' });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[db-master]', error?.message || error);
    return res.status(status).json({ ok: false, error: error?.message || 'db_master_failed' });
  }
}
