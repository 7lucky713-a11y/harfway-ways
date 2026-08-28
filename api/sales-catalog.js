import { neon } from '@neondatabase/serverless';
import coreGamesHandler from './core/games.js';
import gamesLiveHandler from './games-live.js';
import { steamAppIdFromUrl } from './_steam-sale-core.js';

const SCRAPS_BACKEND_URL = process.env.SCRAPS_RECOVERY_URL || 'https://harfway-scraps-recovery.vercel.app/api/scraps';
const SCRAPBOOK_PUBLIC_URL = process.env.SCRAPBOOK_PUBLIC_URL || 'https://harf-way-game-scrapbook.vercel.app/';
const CONTENT_REF_SERVICES = ['playlist','ways','playback','yorimichi','scrap','scraps','scrapbook'];

function getDatabaseUrl() {
  return (
    process.env.WAYS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

async function callHandler(handler, req) {
  let statusCode = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };
  await handler(req, res);
  return { statusCode, payload };
}

async function fetchCoreGames() {
  const { statusCode, payload } = await callHandler(coreGamesHandler, { method: 'GET', query: { limit: '500' } });
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.games)) {
    throw new Error(payload?.error || `core_${statusCode}`);
  }
  return payload.games;
}

async function fetchWaysGames() {
  try {
    const { statusCode, payload } = await callHandler(gamesLiveHandler, { method: 'GET', query: {} });
    if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) {
      throw new Error(payload?.error || `ways_${statusCode}`);
    }
    const rows = payload.entries.map(normalizeWays).filter(row => row.title || row.appid);
    return { ok: true, rows, rawCount: payload.entries.length, core: payload.core || null, source: String(payload.source || '') };
  } catch (error) {
    console.error('[sales-catalog] ways fetch failed', error?.message || error);
    return { ok: false, rows: [], rawCount: 0, error: String(error?.message || 'fetch_failed') };
  }
}

async function fetchContentRefs() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return new Map();
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT game_id, service, external_id, external_url, metadata
    FROM core.game_refs
    WHERE service = ANY(${CONTENT_REF_SERVICES}::text[])
    ORDER BY game_id, service, external_id
  `;
  const map = new Map();
  for (const row of rows) {
    const gameId = String(row.game_id || '');
    if (!gameId) continue;
    if (!map.has(gameId)) map.set(gameId, []);
    map.get(gameId).push({
      service: String(row.service || ''),
      externalId: String(row.external_id || ''),
      externalUrl: String(row.external_url || ''),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    });
  }
  return map;
}

async function fetchSalvagedArticles() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return new Map();
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT DISTINCT ON (l.game_id)
      l.game_id, c.url, c.title, c.status, c.published_at, c.updated_at
    FROM core.content_game_links l
    JOIN core.contents c ON c.id = l.content_id
    WHERE c.content_type = 'article'
      AND c.source = 'archive-salvager'
      AND COALESCE(c.url, '') <> ''
    ORDER BY l.game_id,
      CASE c.status WHEN 'published' THEN 0 WHEN 'reviewed' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
      COALESCE(c.published_at, c.updated_at) DESC NULLS LAST,
      c.updated_at DESC NULLS LAST
  `;
  return new Map(rows.map(row => [String(row.game_id || ''), {
    url: String(row.url || ''), title: String(row.title || ''), status: String(row.status || ''),
    publishedAt: row.published_at || null, updatedAt: row.updated_at || null
  }]));
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function pickString(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}
function unwrapScraps(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['scraps', 'rows', 'items', 'results', 'games']) if (Array.isArray(payload?.[key])) return payload[key];
  if (payload?.data) return unwrapScraps(payload.data);
  return [];
}
function validContentUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /store\.steampowered\.com/i.test(raw)) return '';
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? raw : ''; } catch { return ''; }
}

function normalizeWays(raw, index) {
  const waysId = String(raw?.id || `game-${index}`);
  const storeUrl = String(raw?.storeUrl || raw?.store_url || '');
  const appid = steamAppIdFromUrl(storeUrl);
  return {
    id: `ways:${waysId}`,
    waysId,
    title: String(raw?.title || ''),
    description: String(raw?.description || ''),
    storeUrl,
    articleUrl: '',
    salvagedArticle: null,
    category: String(raw?.category || ''),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String).map(x => x.trim()).filter(Boolean) : [],
    appid,
    steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '',
    sources: ['ways'],
    sourceOfTruth: 'ways-live',
    thumbnail: String(raw?.thumbnailUrl || raw?.thumbnail || ''),
    playlists: [],
    scrapUrl: ''
  };
}

function normalizeScrap(raw, index) {
  const nested = raw?.game && typeof raw.game === 'object' ? raw.game : {};
  const merged = { ...nested, ...raw };
  const title = pickString(merged, ['post_title', 'game_title', 'gameTitle', 'title', 'name']);
  const explicitAppid = pickString(merged, ['appid', 'appId', 'app_id', 'steam_appid', 'steamAppId']);
  const steamCandidates = [
    pickString(merged, ['store', 'steam_url', 'steamUrl', 'store_url', 'storeUrl', 'sourceStore', 'overrideStore', 'game_url', 'gameUrl']),
    pickString(nested, ['store', 'steam_url', 'steamUrl', 'store_url', 'storeUrl', 'sourceStore', 'overrideStore'])
  ].filter(Boolean);
  let appid = /^\d+$/.test(explicitAppid) ? explicitAppid : '';
  let storeUrl = '';
  for (const candidate of steamCandidates) {
    const hit = steamAppIdFromUrl(candidate);
    if (hit) { appid = appid || hit; storeUrl = candidate; break; }
  }
  if (!storeUrl && appid) storeUrl = `https://store.steampowered.com/app/${appid}/`;
  const scrapUrl = [
    pickString(merged, ['scrap', 'scrap_url', 'scrapUrl', 'public_url', 'publicUrl', 'permalink', 'page_url', 'pageUrl', 'source_url', 'sourceUrl']),
    pickString(merged, ['url'])
  ].map(validContentUrl).find(Boolean) || SCRAPBOOK_PUBLIC_URL;
  const thumbnail = pickString(merged, ['post_thumbnail', 'thumbnail', 'thumbnailUrl', 'image', 'imageUrl', 'featured_image', 'featuredImage']);
  const rawTags = Array.isArray(merged.tags) ? merged.tags : typeof merged.tags === 'string' ? merged.tags.split(',') : [];
  const id = pickString(merged, ['id', 'post_id', 'postId', 'slug']) || `scrap-${index}`;
  return {
    id: `scrap:${id}`, title,
    description: pickString(merged, ['petit_summary', 'summary', 'description', 'excerpt', 'note']),
    storeUrl, articleUrl: '', salvagedArticle: null, category: pickString(merged, ['category']),
    tags: rawTags.map(String).map(x => x.trim()).filter(Boolean),
    appid: appid || null, steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '',
    sources: ['scrap'], sourceOfTruth: 'scrapbook', thumbnail, playlists: [], scrapUrl
  };
}

async function fetchScraps() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SCRAPS_BACKEND_URL, {
      headers: { accept: 'application/json', 'user-agent': 'HARF-WAY-Sale-Watch/1.0' }, signal: controller.signal, cache: 'no-store'
    });
    if (!response.ok) throw new Error(`scraps_http_${response.status}`);
    const payload = await response.json();
    const rawRows = unwrapScraps(payload);
    const rows = rawRows.map(normalizeScrap).filter(row => row.title || row.appid);
    return { ok: true, rows, rawCount: rawRows.length };
  } catch (error) {
    console.error('[sales-catalog] scraps fetch failed', error?.message || error);
    return { ok: false, rows: [], rawCount: 0, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'fetch_failed') };
  } finally { clearTimeout(timer); }
}

function contentSources(game, hasSalvagedArticle = false) {
  const out = new Set();
  const add = value => {
    const v = String(value || '').toLowerCase();
    if (!v || v === 'steam') return;
    if (v === 'archive-salvager' || v === 'archive' || v.includes('article')) return;
    if (v === 'ways' || v === 'playback') out.add('ways');
    else if (v === 'playlist') out.add('playlist');
    else if (v === 'yorimichi') out.add('yorimichi');
    else if (v === 'scrap' || v === 'scraps' || v === 'scrapbook') out.add('scrap');
    else out.add(v);
  };
  add(game.sourceOfTruth);
  for (const ref of asArray(game.refs)) add(ref?.service);
  if (hasSalvagedArticle) out.add('article');
  return [...out];
}
function refMetadata(game, service) { return asArray(game.refs).filter(ref => String(ref?.service || '').toLowerCase() === service).map(ref => ref?.metadata || {}); }
function thumbnailFromRefs(game) {
  for (const ref of asArray(game.refs)) { const value = String(ref?.metadata?.thumbnail || ref?.metadata?.thumbnailUrl || '').trim(); if (value) return value; }
  return '';
}
function keyTitle(value) { return String(value || '').trim().toLocaleLowerCase('ja-JP').replace(/[\s\u3000]+/g, ' '); }

function mergeScraps(coreRows, scrapRows) {
  const rows = coreRows.map(row => ({ ...row, sources: [...new Set(row.sources || [])] }));
  const byApp = new Map(rows.filter(r => r.appid).map(r => [String(r.appid), r]));
  const byTitle = new Map(rows.filter(r => r.title).map(r => [keyTitle(r.title), r]));
  for (const scrap of scrapRows) {
    let target = scrap.appid ? byApp.get(String(scrap.appid)) : null;
    if (!target && scrap.title) target = byTitle.get(keyTitle(scrap.title)) || null;
    if (target) {
      target.sources = [...new Set([...(target.sources || []), 'scrap'])];
      if (!target.scrapUrl) target.scrapUrl = scrap.scrapUrl;
      if (!target.thumbnail && scrap.thumbnail) target.thumbnail = scrap.thumbnail;
      if (!target.appid && scrap.appid) {
        target.appid = scrap.appid; target.steamUrl = scrap.steamUrl; target.storeUrl = scrap.storeUrl; byApp.set(String(scrap.appid), target);
      }
      continue;
    }
    rows.push(scrap);
    if (scrap.appid) byApp.set(String(scrap.appid), scrap);
    if (scrap.title) byTitle.set(keyTitle(scrap.title), scrap);
  }
  return rows;
}

function mergeWays(baseRows, waysRows) {
  const rows = baseRows;
  const byId = new Map(rows.filter(r => r.id).map(r => [String(r.id), r]));
  const byApp = new Map(rows.filter(r => r.appid).map(r => [String(r.appid), r]));
  const byTitle = new Map(rows.filter(r => r.title).map(r => [keyTitle(r.title), r]));
  let matched = 0;
  for (const ways of waysRows) {
    let target = ways.waysId ? byId.get(String(ways.waysId)) : null;
    if (!target && ways.appid) target = byApp.get(String(ways.appid)) || null;
    if (!target && ways.title) target = byTitle.get(keyTitle(ways.title)) || null;
    if (!target) continue;
    matched += 1;
    target.sources = [...new Set([...(target.sources || []), 'ways'])];
    target.waysId = ways.waysId;
    if (!target.thumbnail && ways.thumbnail) target.thumbnail = ways.thumbnail;
    if (!target.description && ways.description) target.description = ways.description;
    if (!target.category && ways.category) target.category = ways.category;
    if ((!target.tags || !target.tags.length) && ways.tags?.length) target.tags = ways.tags;
    if (!target.appid && ways.appid) {
      target.appid = ways.appid;
      target.steamUrl = ways.steamUrl;
      target.storeUrl = ways.storeUrl;
      byApp.set(String(ways.appid), target);
    }
  }
  return { rows, matched };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'index, follow');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const [games, contentRefs, salvagedArticles, scraps, ways] = await Promise.all([
      fetchCoreGames(),
      fetchContentRefs().catch(error => { console.error('[sales-catalog] content refs query failed', error?.message || error); return new Map(); }),
      fetchSalvagedArticles().catch(error => { console.error('[sales-catalog] salvaged article query failed', error?.message || error); return new Map(); }),
      fetchScraps(),
      fetchWaysGames()
    ]);
    const coreRows = games.map(game => {
      const gameId = String(game.id || '');
      const enrichedGame = { ...game, refs: [...asArray(game.refs), ...asArray(contentRefs.get(gameId))] };
      const storeUrl = String(enrichedGame.storeUrl || '');
      const appid = steamAppIdFromUrl(storeUrl);
      const playlistMeta = refMetadata(enrichedGame, 'playlist');
      const salvagedArticle = salvagedArticles.get(gameId) || null;
      const articleUrl = String(salvagedArticle?.url || '');
      const scrapMeta = [...refMetadata(enrichedGame, 'scrap'), ...refMetadata(enrichedGame, 'scraps'), ...refMetadata(enrichedGame, 'scrapbook')];
      const scrapUrl = scrapMeta.map(meta => validContentUrl(meta?.url || meta?.scrap || meta?.scrap_url || meta?.scrapUrl || '')).find(Boolean) || '';
      return {
        id: gameId, title: String(enrichedGame.title || ''), description: String(enrichedGame.description || ''), storeUrl, articleUrl,
        salvagedArticle: salvagedArticle ? { title: salvagedArticle.title, status: salvagedArticle.status, url: articleUrl } : null,
        category: String(enrichedGame.category || ''), tags: Array.isArray(enrichedGame.tags) ? enrichedGame.tags.map(String).filter(Boolean) : [], appid,
        steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '', sources: contentSources(enrichedGame, Boolean(salvagedArticle)),
        sourceOfTruth: String(enrichedGame.sourceOfTruth || ''), thumbnail: thumbnailFromRefs(enrichedGame),
        playlists: playlistMeta.map(meta => String(meta?.playlist_id || '')).filter(Boolean), scrapUrl
      };
    });
    const waysMerge = mergeWays(mergeScraps(coreRows, scraps.rows), ways.rows);
    const rows = waysMerge.rows;
    const sourceCounts = {};
    for (const row of rows) for (const source of row.sources || []) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const steamLinked = rows.filter(row => row.appid).length;
    const articleRows = rows.filter(row => row.salvagedArticle);
    const articleWithoutSteam = articleRows.filter(row => !row.appid && row.articleUrl).length;
    const scrapRows = rows.filter(row => (row.sources || []).includes('scrap'));
    const scrapSteamLinked = scrapRows.filter(row => row.appid).length;
    const waysRows = rows.filter(row => (row.sources || []).includes('ways'));
    const waysSteamLinked = waysRows.filter(row => row.appid).length;
    return res.status(200).json({
      ok: true,
      source: 'shared-content-core + content-refs + scraps-recovery + ways-live-overlay',
      articlePolicy: 'archive-salvager-only',
      scrapPolicy: 'scraps-recovery + core refs',
      waysPolicy: 'games-live overlay only + core refs',
      updatedAt: new Date().toISOString(),
      summary: {
        total: rows.length, steamLinked, articleRows: articleRows.length, articleWithoutSteam,
        scrapRows: scrapRows.length, scrapSteamLinked, scrapsBackendRaw: scraps.rawCount, scrapsBackendOk: scraps.ok,
        waysRows: waysRows.length, waysSteamLinked, waysBackendRaw: ways.rawCount, waysBackendOk: ways.ok,
        waysLiveMatched: waysMerge.matched, waysCoreMatched: Number(ways.core?.matched || 0), waysCoreTotal: Number(ways.core?.total || ways.rawCount || 0), sourceCounts
      },
      rows
    });
  } catch (error) {
    console.error('[sales-catalog]', error?.message || error);
    return res.status(503).json({ ok: false, error: 'sale_catalog_unavailable' });
  }
}