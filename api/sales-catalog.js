import { neon } from '@neondatabase/serverless';
import coreGamesHandler from './core/games.js';
import { steamAppIdFromUrl } from './_steam-sale-core.js';

const SCRAPS_BACKEND_URL = process.env.SCRAPS_BACKEND_URL || 'https://harfway-scraps-backend.vercel.app/api/scraps';
const SCRAPBOOK_PUBLIC_URL = process.env.SCRAPBOOK_PUBLIC_URL || 'https://harf-way-game-scrapbook.vercel.app/';

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
    url: String(row.url || ''),
    title: String(row.title || ''),
    status: String(row.status || ''),
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at || null
  }]));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

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
  for (const key of ['scraps', 'rows', 'items', 'results', 'games']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload?.data) return unwrapScraps(payload.data);
  return [];
}

function validContentUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /store\.steampowered\.com/i.test(raw)) return '';
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? raw : '';
  } catch {
    return '';
  }
}

function normalizeScrap(raw, index) {
  const nested = raw?.game && typeof raw.game === 'object' ? raw.game : {};
  const merged = { ...nested, ...raw };
  const title = pickString(merged, ['post_title', 'game_title', 'gameTitle', 'title', 'name']);
  const explicitAppid = pickString(merged, ['appid', 'appId', 'app_id', 'steam_appid', 'steamAppId']);
  const steamCandidates = [
    pickString(merged, ['steam_url', 'steamUrl', 'store_url', 'storeUrl', 'game_url', 'gameUrl']),
    pickString(nested, ['steam_url', 'steamUrl', 'store_url', 'storeUrl'])
  ].filter(Boolean);
  let appid = /^\d+$/.test(explicitAppid) ? explicitAppid : '';
  let storeUrl = '';
  for (const candidate of steamCandidates) {
    const hit = steamAppIdFromUrl(candidate);
    if (hit) {
      appid = appid || hit;
      storeUrl = candidate;
      break;
    }
  }
  if (!storeUrl && appid) storeUrl = `https://store.steampowered.com/app/${appid}/`;

  const scrapUrl = [
    pickString(merged, ['scrap_url', 'scrapUrl', 'public_url', 'publicUrl', 'permalink', 'page_url', 'pageUrl', 'source_url', 'sourceUrl']),
    pickString(merged, ['url'])
  ].map(validContentUrl).find(Boolean) || SCRAPBOOK_PUBLIC_URL;

  const thumbnail = pickString(merged, ['post_thumbnail', 'thumbnail', 'thumbnailUrl', 'image', 'imageUrl', 'featured_image', 'featuredImage']);
  const rawTags = Array.isArray(merged.tags) ? merged.tags : typeof merged.tags === 'string' ? merged.tags.split(',') : [];
  const id = pickString(merged, ['id', 'post_id', 'postId', 'slug']) || `scrap-${index}`;
  return {
    id: `scrap:${id}`,
    title,
    description: pickString(merged, ['petit_summary', 'summary', 'description', 'excerpt']),
    storeUrl,
    articleUrl: '',
    salvagedArticle: null,
    category: pickString(merged, ['category']),
    tags: rawTags.map(String).map(x => x.trim()).filter(Boolean),
    appid: appid || null,
    steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '',
    sources: ['scrap'],
    sourceOfTruth: 'scrapbook',
    thumbnail,
    playlists: [],
    scrapUrl
  };
}

async function fetchScraps() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SCRAPS_BACKEND_URL, {
      headers: { accept: 'application/json', 'user-agent': 'HARF-WAY-Sale-Watch/1.0' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`scraps_http_${response.status}`);
    const payload = await response.json();
    const rawRows = unwrapScraps(payload);
    const rows = rawRows.map(normalizeScrap).filter(row => row.title || row.appid);
    return { ok: true, rows, rawCount: rawRows.length };
  } catch (error) {
    console.error('[sales-catalog] scraps fetch failed', error?.message || error);
    return { ok: false, rows: [], rawCount: 0, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'fetch_failed') };
  } finally {
    clearTimeout(timer);
  }
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

function refMetadata(game, service) {
  return asArray(game.refs)
    .filter(ref => String(ref?.service || '').toLowerCase() === service)
    .map(ref => ref?.metadata || {});
}

function thumbnailFromRefs(game) {
  for (const ref of asArray(game.refs)) {
    const value = String(ref?.metadata?.thumbnail || ref?.metadata?.thumbnailUrl || '').trim();
    if (value) return value;
  }
  return '';
}

function keyTitle(value) {
  return String(value || '').trim().toLocaleLowerCase('ja-JP').replace(/[\s\u3000]+/g, ' ');
}

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
        target.appid = scrap.appid;
        target.steamUrl = scrap.steamUrl;
        target.storeUrl = scrap.storeUrl;
        byApp.set(String(scrap.appid), target);
      }
      continue;
    }
    rows.push(scrap);
    if (scrap.appid) byApp.set(String(scrap.appid), scrap);
    if (scrap.title) byTitle.set(keyTitle(scrap.title), scrap);
  }
  return rows;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'index, follow');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const [games, salvagedArticles, scraps] = await Promise.all([
      fetchCoreGames(),
      fetchSalvagedArticles().catch(error => {
        console.error('[sales-catalog] salvaged article query failed', error?.message || error);
        return new Map();
      }),
      fetchScraps()
    ]);

    const coreRows = games.map(game => {
      const storeUrl = String(game.storeUrl || '');
      const appid = steamAppIdFromUrl(storeUrl);
      const playlistMeta = refMetadata(game, 'playlist');
      const salvagedArticle = salvagedArticles.get(String(game.id || '')) || null;
      const articleUrl = String(salvagedArticle?.url || '');
      const scrapMeta = [...refMetadata(game, 'scrap'), ...refMetadata(game, 'scraps'), ...refMetadata(game, 'scrapbook')];
      const scrapUrl = scrapMeta.map(meta => validContentUrl(meta?.url || meta?.scrap_url || meta?.scrapUrl || '')).find(Boolean) || '';
      return {
        id: String(game.id || ''),
        title: String(game.title || ''),
        description: String(game.description || ''),
        storeUrl,
        articleUrl,
        salvagedArticle: salvagedArticle ? { title: salvagedArticle.title, status: salvagedArticle.status, url: articleUrl } : null,
        category: String(game.category || ''),
        tags: Array.isArray(game.tags) ? game.tags.map(String).filter(Boolean) : [],
        appid,
        steamUrl: appid ? `https://store.steampowered.com/app/${appid}/` : '',
        sources: contentSources(game, Boolean(salvagedArticle)),
        sourceOfTruth: String(game.sourceOfTruth || ''),
        thumbnail: thumbnailFromRefs(game),
        playlists: playlistMeta.map(meta => String(meta?.playlist_id || '')).filter(Boolean),
        scrapUrl
      };
    });

    const rows = mergeScraps(coreRows, scraps.rows);
    const sourceCounts = {};
    for (const row of rows) for (const source of row.sources || []) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const steamLinked = rows.filter(row => row.appid).length;
    const articleRows = rows.filter(row => row.salvagedArticle);
    const articleWithoutSteam = articleRows.filter(row => !row.appid && row.articleUrl).length;
    const scrapRows = rows.filter(row => (row.sources || []).includes('scrap'));
    const scrapSteamLinked = scrapRows.filter(row => row.appid).length;

    return res.status(200).json({
      ok: true,
      source: 'shared-content-core + scraps-backend',
      articlePolicy: 'archive-salvager-only',
      scrapPolicy: 'scraps-backend + core refs',
      updatedAt: new Date().toISOString(),
      summary: {
        total: rows.length,
        steamLinked,
        articleRows: articleRows.length,
        articleWithoutSteam,
        scrapRows: scrapRows.length,
        scrapSteamLinked,
        scrapsBackendRaw: scraps.rawCount,
        scrapsBackendOk: scraps.ok,
        sourceCounts
      },
      rows
    });
  } catch (error) {
    console.error('[sales-catalog]', error?.message || error);
    return res.status(503).json({ ok: false, error: 'sale_catalog_unavailable' });
  }
}
