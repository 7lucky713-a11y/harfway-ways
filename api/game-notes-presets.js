import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'private-game-notes';
const FACET_TYPE = 'private_game_note_facet';
const PRESET_TYPE = 'private_game_note_facet_preset';
const LEGACY_FACETS = new Set(['tags', 'characters', 'themes']);

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function normalizeIds(value, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const id = clean(item, 160);
    if (!id || LEGACY_FACETS.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= maxItems) break;
  }
  return result;
}
function publicId(id) {
  return String(id || '').replace(/^game-notes:preset:/, '');
}
function dbId(id) {
  const raw = clean(id, 160).replace(/^game-notes:preset:/, '');
  return `game-notes:preset:${raw || crypto.randomUUID()}`;
}
function privateRecordUrl(id) {
  return `/game-notes/_private/preset/${encodeURIComponent(publicId(id))}`;
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
    storage: 'game-notes-preview',
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
    SELECT current_setting('neon.project_id', true)::text AS project_id,
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

async function allowedFacetIds(sql) {
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE source=${SOURCE} AND content_type=${FACET_TYPE} AND status='active'
  `;
  return new Set(rows.map(row => String(row.id || '').replace(/^game-notes:facet:/, '')).filter(id => id && !LEGACY_FACETS.has(id)));
}

function toPreset(row, allowed) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const facetIds = normalizeIds(meta.facetIds).filter(id => allowed.has(id));
  return {
    id: publicId(row.id),
    name: row.title || '',
    facetIds,
    createdAt: meta.createdAt || row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function listPresets(sql) {
  const allowed = await allowedFacetIds(sql);
  const rows = await sql`
    SELECT id, title, metadata, created_at, updated_at
    FROM core.contents
    WHERE source=${SOURCE} AND content_type=${PRESET_TYPE} AND status='active'
    ORDER BY lower(title), updated_at DESC
  `;
  return rows.map(row => toPreset(row, allowed));
}

async function ensureUniqueTitle(sql, title, currentId = '') {
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE source=${SOURCE} AND content_type=${PRESET_TYPE} AND status='active'
      AND lower(title)=lower(${title})
      AND (${currentId}='' OR id<>${currentId})
    LIMIT 1
  `;
  if (rows[0]) {
    const error = new Error('duplicate_preset_name');
    error.status = 409;
    throw error;
  }
}

async function savePreset(sql, body, method) {
  const name = clean(body.name || body.title, 120);
  if (!name) { const error = new Error('name_required'); error.status = 400; throw error; }
  if (method === 'PATCH' && !clean(body.id, 160)) { const error = new Error('id_required'); error.status = 400; throw error; }

  const allowed = await allowedFacetIds(sql);
  const facetIds = normalizeIds(body.facetIds).filter(id => allowed.has(id));
  if (!facetIds.length) { const error = new Error('facet_ids_required'); error.status = 400; throw error; }

  const id = dbId(body.id);
  await ensureUniqueTitle(sql, name, body.id ? id : '');

  let createdAt = new Date().toISOString();
  if (body.id) {
    const current = await sql`
      SELECT metadata FROM core.contents
      WHERE id=${id} AND source=${SOURCE} AND content_type=${PRESET_TYPE}
      LIMIT 1
    `;
    if (current[0]?.metadata?.createdAt) createdAt = clean(current[0].metadata.createdAt, 60);
  }
  const metadata = JSON.stringify({ facetIds, createdAt });
  const rows = await sql`
    INSERT INTO core.contents (id, content_type, title, url, body_text, status, source, metadata, created_at, updated_at)
    VALUES (${id}, ${PRESET_TYPE}, ${name}, ${privateRecordUrl(id)}, '', 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      title=EXCLUDED.title,
      url=EXCLUDED.url,
      metadata=EXCLUDED.metadata,
      status='active',
      updated_at=now()
    WHERE core.contents.source=${SOURCE} AND core.contents.content_type=${PRESET_TYPE}
    RETURNING id, title, metadata, created_at, updated_at
  `;
  if (!rows[0]) { const error = new Error('preset_conflict'); error.status = 409; throw error; }
  return toPreset(rows[0], allowed);
}

async function archivePreset(sql, id) {
  const recordId = dbId(id);
  const rows = await sql`
    UPDATE core.contents SET status='archived', updated_at=now()
    WHERE id=${recordId} AND source=${SOURCE} AND content_type=${PRESET_TYPE} AND status='active'
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
        presets: await listPresets(context.sql)
      });
    }

    const body = parseBody(req);
    if (req.method === 'POST' || req.method === 'PATCH') {
      const preset = await savePreset(context.sql, body, req.method);
      return res.status(200).json({ ok: true, preset });
    }
    if (req.method === 'DELETE') {
      const id = clean(body.id, 160);
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const deleted = await archivePreset(context.sql, id);
      return res.status(deleted ? 200 : 404).json({ ok: deleted, deleted });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[game-notes-presets-api]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'game_notes_presets_failed', ...(error?.details || {}) });
  }
}
