import { neon } from '@neondatabase/serverless';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const PRODUCTION_BASE = 'https://harfway-playback.vercel.app';

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
    id: String(game.id || `game-${index}`), title: String(game.title || ''), description: String(game.description || ''),
    video: String(game.video || game.video_url || ''), thumbnail: String(game.thumbnail || game.thumbnailUrl || game.thumbnail_url || ''),
    tags: Array.isArray(game.tags) ? game.tags.map(String) : [], articleUrl: String(game.articleUrl || game.article_url || ''),
    storeUrl: String(game.storeUrl || game.store_url || ''), category: game.category === '通常' ? '' : String(game.category || ''),
    status: game.status === 'published' ? 'published' : 'draft', sponsored: Boolean(game.sponsored), sponsorName: String(game.sponsorName || game.sponsor_name || ''),
    sortOrder: Number.isFinite(Number(game.sortOrder ?? game.sort_order)) ? Number(game.sortOrder ?? game.sort_order) : index,
    fastStart: Boolean(game.fastStart ?? game.fast_start), videoWidth: Number(game.videoWidth ?? game.video_width ?? 0) || 0,
    videoHeight: Number(game.videoHeight ?? game.video_height ?? 0) || 0, videoDuration: Number(game.videoDuration ?? game.video_duration ?? 0) || 0,
    videoOrientation: String(game.videoOrientation || game.video_orientation || ''), videoLayoutMode: String(game.videoLayoutMode || game.video_layout_mode || 'auto')
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
function meta(row){return row?.metadata&&typeof row.metadata==='object'?row.metadata:{}}

function coreSummary(games, articles) {
  return {
    games: games.length, articles: articles.length,
    articleOriginGames: games.filter(g => g.sourceOfTruth === 'archive-salvager').length,
    waysGames: games.filter(g => array(g.refs).some(r => r?.service === 'ways')).length,
    playlistGames: games.filter(g => array(g.refs).some(r => r?.service === 'playlist')).length,
    yorimichiGames: games.filter(g => array(g.refs).some(r => r?.service === 'yorimichi')).length
  };
}

function normalizeCoreGame(row = {}) {
  return {
    id: String(row.id || ''), title: String(row.title || ''), description: String(row.description || ''),
    storeUrl: String(row.storeUrl || row.store_url || ''), articleUrl: String(row.articleUrl || row.article_url || ''), category: String(row.category || ''),
    status: String(row.status || ''), sourceOfTruth: String(row.sourceOfTruth || row.source_of_truth || ''), tags: array(row.tags), refs: array(row.refs),
    createdAt: row.createdAt || row.created_at || null, updatedAt: row.updatedAt || row.updated_at || null
  };
}

function normalizeCoreArticle(row = {}) {
  return {
    id: String(row.id || ''), title: String(row.title || ''), url: String(row.url || ''), publishedAt: row.publishedAt || row.published_at || null,
    excerpt: String(row.excerpt || ''), status: String(row.status || ''), source: String(row.source || 'archive-salvager'),
    games: array(row.games), assets: array(row.assets), updatedAt: row.updatedAt || row.updated_at || null
  };
}

function articlesFromRefs(rows){
  const map=new Map();
  for(const row of rows){
    const m=meta(row),url=String(row.external_url||'');if(!url)continue;
    const id=String(m.articleId||`article:${url}`);let x=map.get(id);
    if(!x){x={id,title:String(m.title||url),url,publishedAt:m.publishedAt||null,excerpt:String(m.excerpt||''),status:String(m.status||'draft'),source:String(m.source||'archive-salvager'),games:[],assets:array(m.images),updatedAt:row.updated_at||null};map.set(id,x)}
    const link=m.link&&typeof m.link==='object'?m.link:{};
    x.games.push({gameId:String(row.game_id||''),game_id:String(row.game_id||''),title:String(row.game_title||link.title||row.game_id||''),score:Number(link.score)||0,source:String(link.source||'archive-article')});
    if(String(row.updated_at||'')>String(x.updatedAt||''))x.updatedAt=row.updated_at;
  }
  return [...map.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}

async function readCoreViaProductionApi(key, fallbackReason = 'preview_core_fallback') {
  try {
    const [gamesResult, articlesResult] = await Promise.allSettled([
      fetch(`${PRODUCTION_BASE}/api/core/games?limit=500`, { cache: 'no-store', headers: { accept: 'application/json' } }),
      fetch(`${PRODUCTION_BASE}/api/archive-items?limit=500`, { cache: 'no-store', headers: { accept: 'application/json', 'x-showcase-admin-key': key, 'x-admin-key': key } })
    ]);
    if (gamesResult.status !== 'fulfilled' || !gamesResult.value.ok) return { available:false, configured:false, games:[], articles:[], error:'production_core_api_unavailable', fallbackReason };
    const gamesPayload = await gamesResult.value.json().catch(() => ({}));
    const games = array(gamesPayload?.games).map(normalizeCoreGame);
    let articles = [];
    if (articlesResult.status === 'fulfilled' && articlesResult.value.ok) {
      const articlesPayload = await articlesResult.value.json().catch(() => ({}));
      articles = array(articlesPayload?.items).map(normalizeCoreArticle);
    }
    return { available:true, configured:true, readSource:'production-core-api-fallback', fallbackReason, games, articles, summary:coreSummary(games,articles) };
  } catch (error) {
    console.error('[db-master-core-fallback]', error);
    return { available:false, configured:false, games:[], articles:[], error:'production_core_api_failed', fallbackReason };
  }
}

async function readCore(key) {
  const databaseUrl = coreDatabaseUrl();
  if (!databaseUrl) return readCoreViaProductionApi(key, 'core_database_not_configured');
  try {
    const sql = neon(databaseUrl);
    const [gameRows, articleRefRows] = await Promise.all([
      sql`
        SELECT c.id,c.title,c.description,c.store_url,c.article_url,c.category,c.status,c.source_of_truth,c.tags,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('service',r.service,'externalId',r.external_id,'externalUrl',r.external_url,'metadata',r.metadata) ORDER BY r.service,r.external_id) FROM core.game_refs r WHERE r.game_id=c.id),'[]'::jsonb) AS refs,
          c.created_at,c.updated_at
        FROM core.game_catalog c WHERE c.status='active'
        ORDER BY c.updated_at DESC,c.title ASC LIMIT 1000
      `,
      sql`
        SELECT r.external_url,r.game_id,r.metadata,r.updated_at,g.title AS game_title
        FROM core.game_refs r JOIN core.games g ON g.id=r.game_id
        WHERE r.service='archive-article'
        ORDER BY r.updated_at DESC LIMIT 5000
      `
    ]);
    const games = gameRows.map(normalizeCoreGame);
    const articles = articlesFromRefs(articleRefRows);
    return { available:true, configured:true, readSource:'direct-core-database', games, articles, summary:coreSummary(games,articles) };
  } catch (error) {
    console.warn('[db-master-core] direct Core read failed; using production API fallback', error?.code || error?.message || error);
    return readCoreViaProductionApi(key, error?.code || 'direct_core_query_failed');
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = adminKey(req);
  if (!key) return res.status(401).json({ ok:false, error:'admin_key_required' });
  try {
    if (req.method === 'GET') {
      const [data, core] = await Promise.all([editorRequest('state', key), readCore(key)]);
      const state = data?.state || { games:[], showcases:[] };
      return res.status(200).json({ ok:true, state, summary:summarize(state), source:'core-first-with-ways-editor', core });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body.state || !Array.isArray(body.state.games)) return res.status(400).json({ ok:false, error:'invalid_state' });
      const result = await editorRequest('state', key, { method:'POST', body:JSON.stringify({ state:body.state }) });
      return res.status(200).json({ ok:true, result, summary:summarize(body.state) });
    }
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[db-master]', error?.message || error);
    return res.status(status).json({ ok:false, error:error?.message || 'db_master_failed' });
  }
}
