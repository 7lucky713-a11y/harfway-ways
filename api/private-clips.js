import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'private-learning-clips';
const CLIP_TYPE = 'private_learning_clip';

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function normalizeList(value, maxItems = 24, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const v = clean(item, maxLength);
    if (!v) continue;
    const key = v.toLocaleLowerCase('ja');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(v);
    if (result.length >= maxItems) break;
  }
  return result;
}
function publicId(id) {
  return String(id || '').replace(/^private-clips:clip:/, '');
}
function dbId(id) {
  const raw = clean(id, 160).replace(/^private-clips:clip:/, '');
  return `private-clips:clip:${raw || crypto.randomUUID()}`;
}
function privateRecordUrl(id) {
  return `/private-clips/_private/clip/${encodeURIComponent(publicId(id))}`;
}
function validMedia(value) {
  const item = value && typeof value === 'object' ? value : null;
  if (!item) return null;
  const key = clean(item.key, 1200);
  if (!/^private-clips\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(key)) return null;
  return {
    key,
    type: clean(item.type, 120),
    kind: 'image',
    size: Math.max(0, Number(item.size || 0) || 0),
    name: clean(item.name, 240)
  };
}

function databaseConfig() {
  const production = process.env.VERCEL_ENV === 'production';
  if (production) {
    return {
      production,
      storage: 'shared-content-core',
      expectedBranchId: PRODUCTION_BRANCH_ID,
      url: archiveDatabaseConfig().url || ''
    };
  }
  return {
    production,
    storage: 'private-clips-preview',
    expectedBranchId: PREVIEW_BRANCH_ID,
    url: process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL || ''
  };
}

async function databaseContext() {
  const config = databaseConfig();
  if (!config.url) {
    const error = new Error(config.production ? 'production_database_not_configured' : 'preview_database_not_configured');
    error.status = 503;
    throw error;
  }
  const sql = neon(config.url);
  const rows = await sql`
    SELECT current_database()::text AS database_name,
      current_setting('neon.project_id', true)::text AS project_id,
      current_setting('neon.branch_id', true)::text AS branch_id,
      to_regclass('core.contents')::text AS contents_table
  `;
  const info = rows[0] || {};
  const projectId = clean(info.project_id, 80);
  const branchId = clean(info.branch_id, 80);
  const tableReady = clean(info.contents_table, 120) === 'core.contents';
  if (projectId !== PROJECT_ID || branchId !== config.expectedBranchId || !tableReady) {
    const error = new Error('database_identity_mismatch');
    error.status = 409;
    error.details = { projectId: projectId || null, branchId: branchId || null, expectedBranchId: config.expectedBranchId, tableReady };
    throw error;
  }
  return { sql, production: config.production, branchId, storage: config.storage };
}

async function authorize(req, production) {
  if (!production) return;
  const auth = await authorizeArchiveRequest(req);
  if (auth.ok) return;
  const error = new Error(auth.error || 'unauthorized');
  error.status = auth.status || 401;
  throw error;
}

function toClip(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id),
    title: row.title || '',
    body: row.body_text || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    image: meta.image && typeof meta.image === 'object' ? meta.image : null,
    createdAt: meta.createdAt || (row.created_at ? new Date(row.created_at).toISOString() : null),
    updatedAt: row.updated_at || null
  };
}

async function listClips(sql) {
  const rows = await sql`
    SELECT id, title, body_text, metadata, created_at, updated_at
    FROM core.contents
    WHERE source = ${SOURCE}
      AND content_type = ${CLIP_TYPE}
      AND status <> 'archived'
    ORDER BY updated_at DESC
  `;
  return rows.map(toClip);
}

async function upsertClip(sql, body) {
  const title = clean(body.title, 280);
  if (!title) { const error = new Error('title_required'); error.status = 400; throw error; }
  const text = clean(body.body, 30000);
  const id = dbId(body.id);
  const metadata = JSON.stringify({
    tags: normalizeList(body.tags),
    image: validMedia(body.image),
    createdAt: clean(body.createdAt, 60) || new Date().toISOString()
  });
  const excerpt = clean(text.replace(/\s+/g, ' '), 280);
  const recordUrl = privateRecordUrl(id);
  const rows = await sql`
    INSERT INTO core.contents
      (id, content_type, title, url, excerpt, body_text, status, source, metadata, created_at, updated_at)
    VALUES
      (${id}, ${CLIP_TYPE}, ${title}, ${recordUrl}, ${excerpt}, ${text}, 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      url = EXCLUDED.url,
      title = EXCLUDED.title,
      excerpt = EXCLUDED.excerpt,
      body_text = EXCLUDED.body_text,
      status = 'active',
      metadata = EXCLUDED.metadata,
      updated_at = now()
    WHERE core.contents.source = ${SOURCE}
    RETURNING id, title, body_text, metadata, created_at, updated_at
  `;
  if (!rows[0]) { const error = new Error('clip_conflict'); error.status = 409; throw error; }
  return toClip(rows[0]);
}

async function archiveClip(sql, id) {
  const rows = await sql`
    UPDATE core.contents
    SET status = 'archived', updated_at = now()
    WHERE id = ${dbId(id)}
      AND source = ${SOURCE}
      AND content_type = ${CLIP_TYPE}
      AND status <> 'archived'
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const context = await databaseContext();
    await authorize(req, context.production);
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'),
        storage: context.storage,
        branchId: context.branchId,
        clips: await listClips(context.sql)
      });
    }
    const body = parseBody(req);
    if (req.method === 'POST' || req.method === 'PATCH') {
      const item = await upsertClip(context.sql, body);
      return res.status(200).json({ ok: true, item });
    }
    if (req.method === 'DELETE') {
      const id = clean(body.id, 160);
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const deleted = await archiveClip(context.sql, id);
      return res.status(deleted ? 200 : 404).json({ ok: deleted, deleted });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[private-clips-api]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'private_clips_api_failed', ...(error?.details || {}) });
  }
}
