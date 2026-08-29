import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from '../archive-core.js';

const MAX_IDS = 120;

function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function databaseUrl() {
  return process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
}

function isPublicHttpUrl(value) {
  if (!value) return true;
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

function parseIds(req) {
  const one = clean(req.query?.id, 500);
  const many = clean(req.query?.ids, 60000)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  return [...new Set(one ? [one, ...many] : many)].slice(0, MAX_IDS);
}

function emptyItem(gameId) {
  return { gameId, hidden: false, fixed: false, selected: '', manualImage: '' };
}

async function readSettings(ids) {
  if (!ids.length) return [];
  const url = databaseUrl();
  if (!url) return ids.map(emptyItem);
  const sql = neon(url);
  const rows = await sql`
    SELECT
      g.id AS game_id,
      COALESCE(r.external_url, '') AS manual_image,
      COALESCE(r.metadata->>'hidden', 'false') AS hidden_raw,
      COALESCE(r.metadata->>'fixed', 'false') AS fixed_raw,
      COALESCE(r.metadata->>'selected', '') AS selected
    FROM core.games g
    LEFT JOIN core.game_refs r
      ON r.service = 'shelf-admin'
     AND r.external_id = ('config:' || g.id)
    WHERE g.id = ANY(${ids}::text[])
  `;
  const byId = new Map(rows.map(row => [clean(row.game_id), {
    gameId: clean(row.game_id),
    hidden: String(row.hidden_raw).toLowerCase() === 'true',
    fixed: String(row.fixed_raw).toLowerCase() === 'true',
    selected: clean(row.selected, 20),
    manualImage: clean(row.manual_image)
  }]));
  return ids.map(id => byId.get(id) || emptyItem(id));
}

async function handleGet(req, res) {
  const ids = parseIds(req);
  if (!ids.length) return res.status(400).json({ ok: false, error: 'id_required' });
  try {
    const items = await readSettings(ids);
    return res.status(200).json({
      ok: true,
      environment: process.env.VERCEL_ENV || 'unknown',
      count: items.length,
      items
    });
  } catch (error) {
    console.error('[core-shelf-admin] read failed', error);
    return res.status(500).json({ ok: false, error: 'shelf_admin_read_failed' });
  }
}

async function handlePost(req, res) {
  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'unauthorized' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const gameId = clean(body.gameId, 500);
  const hidden = Boolean(body.hidden);
  const fixed = Boolean(body.fixed);
  const manualImage = clean(body.manualImage || body.manual_image, 5000);
  const selectedRaw = clean(body.selected, 20).toLowerCase();
  const selected = ['article', 'manual', 'auto'].includes(selectedRaw) ? selectedRaw : '';

  if (!gameId) return res.status(400).json({ ok: false, error: 'game_id_required' });
  if (manualImage && !isPublicHttpUrl(manualImage)) return res.status(400).json({ ok: false, error: 'invalid_manual_image' });

  const config = auth.config || archiveDatabaseConfig();
  const item = { gameId, hidden, fixed, selected, manualImage };
  if (!config.production) {
    return res.status(200).json({ ok: true, simulated: true, previewOnly: true, item });
  }
  if (!config.url) return res.status(503).json({ ok: false, error: 'core_database_not_configured' });

  try {
    const sql = neon(config.url);
    const hit = await sql`SELECT id FROM core.games WHERE id=${gameId} LIMIT 1`;
    if (!hit[0]) return res.status(404).json({ ok: false, error: 'game_not_found' });

    const externalId = `config:${gameId}`;
    if (!hidden && !fixed && !manualImage && !selected) {
      await sql`DELETE FROM core.game_refs WHERE service='shelf-admin' AND external_id=${externalId}`;
    } else {
      const metadata = JSON.stringify({ hidden, fixed, selected, source: 'my-game-shelf' });
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES ('shelf-admin',${externalId},${gameId},${manualImage},${metadata}::jsonb,now())
        ON CONFLICT (service,external_id) DO UPDATE SET
          game_id=EXCLUDED.game_id,
          external_url=EXCLUDED.external_url,
          metadata=EXCLUDED.metadata,
          updated_at=now()
      `;
    }

    return res.status(200).json({ ok: true, simulated: false, item });
  } catch (error) {
    console.error('[core-shelf-admin] write failed', error);
    return res.status(500).json({ ok: false, error: 'shelf_admin_write_failed' });
  }
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', req.method === 'GET' ? 'public, s-maxage=30, stale-while-revalidate=120' : 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
