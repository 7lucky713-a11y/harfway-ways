import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from '../archive-core.js';

const PRODUCTION_CORE = 'https://harfway-playback.vercel.app/api/core/games';
const MAX_IDS = 80;
const FETCH_TIMEOUT_MS = 4500;

function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function databaseUrl() {
  return process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
}

function isPublicHttpUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
    if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

function absolutize(base, value) {
  const raw = clean(value);
  if (!raw) return '';
  try { return new URL(raw, base).toString(); } catch { return ''; }
}

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchOgImage(url) {
  if (!isPublicHttpUrl(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; HARF-WAY-Thumbnail/1.0; +https://harf-way.com/)'
      }
    });
    if (!response.ok) return '';
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return '';
    const html = (await response.text()).slice(0, 900000);
    const raw = firstMatch(html, [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["'][^>]*>/i
    ]);
    const image = absolutize(response.url || url, decodeEntities(raw));
    return isPublicHttpUrl(image) ? image : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function parseIds(req) {
  const one = clean(req.query?.id, 500);
  const many = clean(req.query?.ids, 30000)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  return [...new Set(one ? [one, ...many] : many)].slice(0, MAX_IDS);
}

async function readGamesFromDb(ids) {
  const url = databaseUrl();
  if (!url || !ids.length) return [];
  const sql = neon(url);
  return sql`
    SELECT
      g.id,
      g.title,
      g.store_url,
      g.article_url,
      COALESCE((
        SELECT c.featured_image_url
        FROM core.content_game_links l
        JOIN core.contents c ON c.id = l.content_id
        WHERE l.game_id = g.id
          AND c.featured_image_url <> ''
        ORDER BY
          CASE WHEN c.status = 'published' THEN 0 WHEN c.status = 'reviewed' THEN 1 ELSE 2 END,
          c.updated_at DESC
        LIMIT 1
      ), '') AS article_image,
      COALESCE((
        SELECT r.external_url
        FROM core.game_refs r
        WHERE r.game_id = g.id
          AND r.service = 'thumbnail'
          AND r.external_id = ('manual:' || g.id)
        ORDER BY r.updated_at DESC
        LIMIT 1
      ), '') AS manual_image
    FROM core.games g
    WHERE g.id = ANY(${ids}::text[])
  `;
}

async function readGamesFallback(ids) {
  const results = await Promise.all(ids.map(async id => {
    try {
      const response = await fetch(`${PRODUCTION_CORE}?id=${encodeURIComponent(id)}`, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      const game = Array.isArray(data?.games) ? data.games[0] : null;
      if (!game) return null;
      return {
        id: clean(game.id), title: clean(game.title), store_url: clean(game.storeUrl), article_url: clean(game.articleUrl),
        article_image: '', manual_image: ''
      };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

async function resolveOne(row) {
  const articleUrl = clean(row.article_url);
  const storeUrl = clean(row.store_url);
  let articleImage = clean(row.article_image);
  const manualImage = clean(row.manual_image);
  let autoImage = '';

  if (!articleImage && articleUrl) articleImage = await fetchOgImage(articleUrl);
  if (!articleImage && !manualImage && storeUrl) autoImage = await fetchOgImage(storeUrl);

  const image = articleImage || manualImage || autoImage || '';
  const source = articleImage ? 'article' : manualImage ? 'manual' : autoImage ? 'auto' : 'none';
  return {
    gameId: clean(row.id),
    title: clean(row.title),
    image,
    source,
    articleImage,
    manualImage,
    autoImage,
    articleUrl,
    storeUrl
  };
}

async function resolveWithConcurrency(rows, concurrency = 8) {
  const out = new Array(rows.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      out[index] = await resolveOne(rows[index]);
    }
  });
  await Promise.all(workers);
  return out.filter(Boolean);
}

async function handleGet(req, res) {
  const ids = parseIds(req);
  if (!ids.length) return res.status(400).json({ ok: false, error: 'id_required' });
  try {
    let rows = [];
    try { rows = await readGamesFromDb(ids); } catch (error) { console.warn('[core-thumbnail] db read fallback', error?.code || error?.message || error); }
    if (!rows.length) rows = await readGamesFallback(ids);
    const byId = new Map(rows.map(x => [clean(x.id), x]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);
    const items = await resolveWithConcurrency(ordered);
    return res.status(200).json({
      ok: true,
      priority: ['article', 'manual', 'auto'],
      count: items.length,
      items
    });
  } catch (error) {
    console.error('[core-thumbnail] resolve failed', error);
    return res.status(500).json({ ok: false, error: 'thumbnail_resolve_failed' });
  }
}

async function handlePost(req, res) {
  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'unauthorized' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const gameId = clean(body.gameId, 500);
  const imageUrl = clean(body.imageUrl, 5000);
  if (!gameId) return res.status(400).json({ ok: false, error: 'game_id_required' });
  if (imageUrl && !isPublicHttpUrl(imageUrl)) return res.status(400).json({ ok: false, error: 'invalid_image_url' });

  const config = auth.config || archiveDatabaseConfig();
  if (!config.production) {
    return res.status(200).json({
      ok: true,
      simulated: true,
      previewOnly: true,
      action: imageUrl ? 'set_manual_thumbnail' : 'clear_manual_thumbnail',
      gameId,
      imageUrl
    });
  }
  if (!config.url) return res.status(503).json({ ok: false, error: 'core_database_not_configured' });

  try {
    const sql = neon(config.url);
    const hit = await sql`SELECT id FROM core.games WHERE id=${gameId} LIMIT 1`;
    if (!hit[0]) return res.status(404).json({ ok: false, error: 'game_not_found' });
    const externalId = `manual:${gameId}`;
    if (!imageUrl) {
      await sql`DELETE FROM core.game_refs WHERE service='thumbnail' AND external_id=${externalId}`;
    } else {
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES ('thumbnail',${externalId},${gameId},${imageUrl},${JSON.stringify({source:'manual',label:'Manual thumbnail'})}::jsonb,now())
        ON CONFLICT (service,external_id) DO UPDATE SET game_id=EXCLUDED.game_id,external_url=EXCLUDED.external_url,metadata=EXCLUDED.metadata,updated_at=now()
      `;
    }
    return res.status(200).json({ ok: true, action: imageUrl ? 'set_manual_thumbnail' : 'clear_manual_thumbnail', gameId, imageUrl });
  } catch (error) {
    console.error('[core-thumbnail] manual update failed', error);
    return res.status(500).json({ ok: false, error: 'manual_thumbnail_update_failed' });
  }
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', req.method === 'GET' ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
