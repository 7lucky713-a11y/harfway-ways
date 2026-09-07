import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';
import { findSingleGameConfig } from '../src/lib/single-game-kit/configs.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';

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

function gameConfig(req, body = null) {
  const id = clean(req.query?.game || body?.game || '', 80).toLowerCase();
  const config = findSingleGameConfig(id);
  if (!config) {
    const error = new Error('unknown_game');
    error.status = 404;
    throw error;
  }
  return config;
}

function publicId(config, id) {
  const raw = String(id || '');
  return raw.startsWith(config.data.idPrefix) ? raw.slice(config.data.idPrefix.length) : raw;
}

function dbId(config, id) {
  const raw = clean(id, 160);
  const short = raw.startsWith(config.data.idPrefix) ? raw.slice(config.data.idPrefix.length) : raw;
  return `${config.data.idPrefix}${short || crypto.randomUUID()}`;
}

function databaseUrlForEnvironment() {
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
    storage: 'single-game-kit-preview',
    expectedBranchId: PREVIEW_BRANCH_ID,
    url: process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL || ''
  };
}

async function databaseContext() {
  const config = databaseUrlForEnvironment();
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
  return { sql, production: config.production, storage: config.storage, branchId };
}

async function authorizeMutation(req, production) {
  if (!production) return;
  const auth = await authorizeArchiveRequest(req);
  if (auth.ok) return;
  const error = new Error(auth.error || 'unauthorized');
  error.status = auth.status || 401;
  throw error;
}

function toEntry(config, row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(config, row.id),
    type: String(row.content_type || '').replace(config.data.contentTypePrefix, ''),
    title: row.title || '',
    memo: row.body_text || '',
    subject: metadata.subject || metadata.cat || '',
    role: metadata.role || metadata.className || '',
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

async function listEntries(sql, config) {
  const types = config.categories.map((item) => `${config.data.contentTypePrefix}${item.id}`);
  const rows = await sql`
    SELECT id, content_type, title, body_text, featured_image_url, metadata, created_at, updated_at
    FROM core.contents
    WHERE source = ${config.data.source}
      AND content_type = ANY(${types})
      AND status <> 'archived'
    ORDER BY COALESCE(metadata->>'createdAt','') DESC, updated_at DESC
  `;
  return rows.map((row) => toEntry(config, row));
}

async function upsertEntry(sql, config, body) {
  const type = clean(body.type, 40).toLowerCase();
  if (!config.categories.some((item) => item.id === type)) {
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

  const id = dbId(config, body.id);
  const shortId = publicId(config, id);
  const subject = clean(body.subject, 180);
  const role = clean(body.role, 180);
  const tags = normalizeTags(body.tags);
  const mediaUrl = clean(body.mediaUrl, 2000);
  const mediaKey = clean(body.mediaKey, 2000);
  const mediaType = clean(body.mediaType, 120);
  const mediaSize = Math.max(0, Number(body.mediaSize || 0) || 0);
  const mediaName = clean(body.mediaName, 240);
  const createdAt = clean(body.createdAt, 32) || new Date().toISOString().slice(0, 10);
  const metadata = JSON.stringify({ game: config.id, subject, role, tags, mediaUrl, mediaKey, mediaType, mediaSize, mediaName, createdAt });
  const contentType = `${config.data.contentTypePrefix}${type}`;
  const url = `/single-game-kit/${encodeURIComponent(config.id)}/entry/${encodeURIComponent(shortId)}`;
  const excerpt = memo.slice(0, 280);

  const rows = await sql`
    INSERT INTO core.contents
      (id, content_type, title, url, published_at, excerpt, body_text, featured_image_url, status, source, metadata, created_at, updated_at)
    VALUES
      (${id}, ${contentType}, ${title}, ${url}, now(), ${excerpt}, ${memo}, ${mediaUrl}, 'active', ${config.data.source}, CAST(${metadata} AS jsonb), now(), now())
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
    WHERE core.contents.source = ${config.data.source}
    RETURNING id, content_type, title, body_text, featured_image_url, metadata, created_at, updated_at
  `;
  if (!rows[0]) {
    const error = new Error('entry_conflict');
    error.status = 409;
    throw error;
  }
  return toEntry(config, rows[0]);
}

async function deleteEntry(sql, config, body) {
  const id = dbId(config, body.id);
  const rows = await sql`DELETE FROM core.contents WHERE id = ${id} AND source = ${config.data.source} RETURNING id`;
  return Boolean(rows[0]);
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = parseBody(req);
    const config = gameConfig(req, body);
    const context = await databaseContext();

    if (req.method === 'GET') {
      const entries = await listEntries(context.sql, config);
      return res.status(200).json({ ok: true, game: config.id, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId, entries });
    }

    await authorizeMutation(req, context.production);
    if (req.method === 'POST' || req.method === 'PATCH') {
      const entry = await upsertEntry(context.sql, config, body);
      return res.status(200).json({ ok: true, game: config.id, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId, entry });
    }
    if (req.method === 'DELETE') {
      const deleted = await deleteEntry(context.sql, config, body);
      return res.status(deleted ? 200 : 404).json({ ok: deleted, game: config.id, deleted });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[single-game-kit-api]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'single_game_kit_api_failed', ...(error?.details || {}) });
  }
}
