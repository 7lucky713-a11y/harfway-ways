import { neon } from '@neondatabase/serverless';
import { archiveCors } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-mute-fire-aw1c2dpw';
const SOURCE = 'mew-log';
const TYPES = new Set(['diary', 'video', 'build', 'cat']);

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return raw.map((x) => clean(x, 80)).filter(Boolean).slice(0, 20);
}

function publicId(id) {
  return String(id || '').replace(/^mewlog:/, '');
}

function dbId(id) {
  const raw = clean(id, 120).replace(/^mewlog:/, '');
  return `mewlog:${raw || crypto.randomUUID()}`;
}

async function databaseContext() {
  if (process.env.VERCEL_ENV === 'production') {
    const error = new Error('production_disabled');
    error.status = 403;
    throw error;
  }
  const databaseUrl = process.env.MEW_LOG_PREVIEW_DATABASE_URL || '';
  if (!databaseUrl) {
    const error = new Error('preview_database_not_configured');
    error.status = 503;
    throw error;
  }
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT
      current_database()::text AS database_name,
      current_setting('neon.project_id', true)::text AS project_id,
      current_setting('neon.branch_id', true)::text AS branch_id,
      to_regclass('core.contents')::text AS contents_table
  `;
  const info = rows[0] || {};
  const projectId = clean(info.project_id, 80);
  const branchId = clean(info.branch_id, 80);
  const tableReady = clean(info.contents_table, 120) === 'core.contents';
  const writeSafe = projectId === PROJECT_ID && branchId === PREVIEW_BRANCH_ID && branchId !== PRODUCTION_BRANCH_ID && tableReady;
  if (!writeSafe) {
    const error = new Error('preview_database_identity_mismatch');
    error.status = 409;
    error.details = { projectId: projectId || null, branchId: branchId || null, tableReady };
    throw error;
  }
  return { sql, info: { projectId, branchId, tableReady, databaseName: clean(info.database_name, 120) } };
}

function toEntry(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id),
    type: String(row.content_type || '').replace(/^mew_/, ''),
    title: row.title || '',
    memo: row.body_text || '',
    cat: metadata.cat || '',
    className: metadata.className || '',
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    mediaUrl: metadata.mediaUrl || row.featured_image_url || '',
    mediaKey: metadata.mediaKey || '',
    mediaType: metadata.mediaType || '',
    mediaSize: Number(metadata.mediaSize || 0),
    mediaName: metadata.mediaName || '',
    createdAt: metadata.createdAt || (row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : ''),
    updatedAt: row.updated_at || null
  };
}

async function listEntries(sql) {
  const rows = await sql`
    SELECT id, content_type, title, body_text, featured_image_url, metadata, created_at, updated_at
    FROM core.contents
    WHERE source = ${SOURCE}
      AND content_type IN ('mew_diary','mew_video','mew_build','mew_cat')
      AND status <> 'archived'
    ORDER BY COALESCE(metadata->>'createdAt','') DESC, updated_at DESC
  `;
  return rows.map(toEntry);
}

async function upsertEntry(sql, body) {
  const type = clean(body.type, 20).toLowerCase();
  if (!TYPES.has(type)) {
    const error = new Error('invalid_type');
    error.status = 400;
    throw error;
  }
  const title = clean(body.title, 240);
  const memo = clean(body.memo, 20000);
  if (!title || !memo) {
    const error = new Error('title_and_memo_required');
    error.status = 400;
    throw error;
  }
  const id = dbId(body.id);
  const shortId = publicId(id);
  const cat = clean(body.cat, 160);
  const className = clean(body.className, 160);
  const tags = normalizeTags(body.tags);
  const mediaUrl = clean(body.mediaUrl, 2000);
  const mediaKey = clean(body.mediaKey, 2000);
  const mediaType = clean(body.mediaType, 120);
  const mediaSize = Math.max(0, Number(body.mediaSize || 0) || 0);
  const mediaName = clean(body.mediaName, 240);
  const createdAt = clean(body.createdAt, 32) || new Date().toISOString().slice(0, 10);
  const metadata = JSON.stringify({ cat, className, tags, mediaUrl, mediaKey, mediaType, mediaSize, mediaName, createdAt });
  const contentType = `mew_${type}`;
  const url = `/mew-log/entry/${encodeURIComponent(shortId)}`;
  const excerpt = memo.slice(0, 280);

  const rows = await sql`
    INSERT INTO core.contents
      (id, content_type, title, url, published_at, excerpt, body_text, featured_image_url, status, source, metadata, created_at, updated_at)
    VALUES
      (${id}, ${contentType}, ${title}, ${url}, now(), ${excerpt}, ${memo}, ${mediaUrl}, 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      title = EXCLUDED.title,
      url = EXCLUDED.url,
      excerpt = EXCLUDED.excerpt,
      body_text = EXCLUDED.body_text,
      featured_image_url = EXCLUDED.featured_image_url,
      status = 'active',
      metadata = EXCLUDED.metadata,
      updated_at = now()
    WHERE core.contents.source = ${SOURCE}
    RETURNING id, content_type, title, body_text, featured_image_url, metadata, created_at, updated_at
  `;
  if (!rows[0]) {
    const error = new Error('entry_conflict');
    error.status = 409;
    throw error;
  }
  return toEntry(rows[0]);
}

async function deleteEntry(sql, body) {
  const id = dbId(body.id);
  const rows = await sql`
    DELETE FROM core.contents
    WHERE id = ${id} AND source = ${SOURCE}
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { sql, info } = await databaseContext();

    if (req.method === 'GET') {
      const entries = await listEntries(sql);
      return res.status(200).json({ ok: true, storage: 'neon-preview', branchId: info.branchId, entries });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const entry = await upsertEntry(sql, parseBody(req));
      return res.status(200).json({ ok: true, storage: 'neon-preview', branchId: info.branchId, entry });
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteEntry(sql, parseBody(req));
      return res.status(deleted ? 200 : 404).json({ ok: deleted, storage: 'neon-preview', branchId: info.branchId, deleted });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[mew-log-api]', error?.message || error);
    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.message || 'mew_log_api_failed',
      ...(error?.details || {})
    });
  }
}
