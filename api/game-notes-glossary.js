import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'private-game-notes';
const GAME_TYPE = 'private_game_note_game';
const GLOSSARY_TYPE = 'private_game_note_glossary';

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function normalizeList(value, maxItems = 20, maxLength = 100) {
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
function normalizeIdList(value, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const id = clean(item, 160).replace(/^game-notes:glossary:/, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= maxItems) break;
  }
  return result;
}
function publicId(id, entity) {
  return String(id || '').replace(new RegExp(`^game-notes:${entity}:`), '');
}
function dbId(entity, id) {
  const raw = clean(id, 160).replace(new RegExp(`^game-notes:${entity}:`), '');
  return `game-notes:${entity}:${raw || crypto.randomUUID()}`;
}
function privateRecordUrl(entity, id) {
  return `/game-notes/_private/${entity}/${encodeURIComponent(publicId(id, entity))}`;
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

function toGame(row) {
  return { id: publicId(row.id, 'game'), name: row.title || '' };
}
function toEntry(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id, 'glossary'),
    term: row.title || '',
    description: row.body_text || '',
    gameId: clean(meta.gameId, 160),
    relatedEntryIds: normalizeIdList(meta.relatedEntryIds),
    relatedTerms: normalizeList(meta.relatedTerms),
    createdAt: meta.createdAt || (row.created_at ? new Date(row.created_at).toISOString() : null),
    updatedAt: row.updated_at || null
  };
}

function makeRelationsSymmetric(entries) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const links = new Map(entries.map(entry => [entry.id, new Set()]));
  for (const entry of entries) {
    for (const targetId of entry.relatedEntryIds || []) {
      if (!targetId || targetId === entry.id || !byId.has(targetId)) continue;
      links.get(entry.id).add(targetId);
      links.get(targetId).add(entry.id);
    }
  }
  for (const entry of entries) {
    entry.relatedEntryIds = [...(links.get(entry.id) || [])]
      .sort((a, b) => (byId.get(a)?.term || '').localeCompare(byId.get(b)?.term || '', 'ja'));
  }
  return entries;
}

async function listAll(sql) {
  const rows = await sql`
    SELECT id, content_type, title, body_text, metadata, created_at, updated_at
    FROM core.contents
    WHERE source=${SOURCE}
      AND status<>'archived'
      AND content_type IN (${GAME_TYPE}, ${GLOSSARY_TYPE})
    ORDER BY updated_at DESC
  `;
  const games = [];
  const entries = [];
  for (const row of rows) {
    if (row.content_type === GAME_TYPE) games.push(toGame(row));
    if (row.content_type === GLOSSARY_TYPE) entries.push(toEntry(row));
  }
  games.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  entries.sort((a, b) => a.term.localeCompare(b.term, 'ja'));
  makeRelationsSymmetric(entries);
  return { games, entries };
}

async function assertGameExists(sql, gameId) {
  if (!gameId) return;
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE id=${dbId('game', gameId)} AND source=${SOURCE} AND content_type=${GAME_TYPE} AND status<>'archived'
    LIMIT 1
  `;
  if (!rows[0]) {
    const error = new Error('game_not_found');
    error.status = 400;
    throw error;
  }
}

async function validatedRelatedIds(sql, currentId, value) {
  const requested = normalizeIdList(value).filter(id => id !== currentId);
  if (!requested.length) return [];
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE source=${SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived'
  `;
  const allowed = new Set(rows.map(row => publicId(row.id, 'glossary')));
  return requested.filter(id => allowed.has(id));
}

async function syncReciprocalRelations(sql, currentId, desiredIds) {
  const desired = new Set(normalizeIdList(desiredIds));
  const rows = await sql`
    SELECT id, metadata FROM core.contents
    WHERE source=${SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived'
  `;
  for (const row of rows) {
    const targetId = publicId(row.id, 'glossary');
    if (!targetId || targetId === currentId) continue;
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const existing = normalizeIdList(meta.relatedEntryIds).filter(id => id !== targetId);
    const hasCurrent = existing.includes(currentId);
    const shouldHaveCurrent = desired.has(targetId);
    if (hasCurrent === shouldHaveCurrent) continue;
    const next = existing.filter(id => id !== currentId);
    if (shouldHaveCurrent) next.push(currentId);
    const nextMeta = JSON.stringify({ ...meta, relatedEntryIds: normalizeIdList(next) });
    await sql`
      UPDATE core.contents
      SET metadata=CAST(${nextMeta} AS jsonb), updated_at=now()
      WHERE id=${row.id} AND source=${SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived'
    `;
  }
}

async function saveEntry(sql, body) {
  const term = clean(body.term || body.title, 180);
  const description = clean(body.description || body.body, 12000);
  const gameId = clean(body.gameId, 160);
  if (!term || !description) {
    const error = new Error('term_description_required');
    error.status = 400;
    throw error;
  }
  await assertGameExists(sql, gameId);

  const id = dbId('glossary', body.id);
  const currentId = publicId(id, 'glossary');
  const duplicate = await sql`
    SELECT id FROM core.contents
    WHERE source=${SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived'
      AND lower(title)=lower(${term})
      AND COALESCE(metadata->>'gameId','')=${gameId}
      AND (${body.id ? id : ''}='' OR id<>${body.id ? id : ''})
    LIMIT 1
  `;
  if (duplicate[0]) {
    const error = new Error('duplicate_glossary_term');
    error.status = 409;
    throw error;
  }

  let currentMeta = {};
  if (body.id) {
    const current = await sql`
      SELECT metadata FROM core.contents
      WHERE id=${id} AND source=${SOURCE} AND content_type=${GLOSSARY_TYPE}
      LIMIT 1
    `;
    currentMeta = current[0]?.metadata && typeof current[0].metadata === 'object' ? current[0].metadata : {};
  }

  const relationInput = Array.isArray(body.relatedEntryIds) ? body.relatedEntryIds : currentMeta.relatedEntryIds;
  const relatedEntryIds = await validatedRelatedIds(sql, currentId, relationInput);
  const metadata = JSON.stringify({
    ...currentMeta,
    gameId,
    relatedEntryIds,
    relatedTerms: normalizeList(currentMeta.relatedTerms),
    createdAt: clean(currentMeta.createdAt, 60) || new Date().toISOString()
  });

  const rows = await sql`
    INSERT INTO core.contents (id, content_type, title, url, excerpt, body_text, status, source, metadata, created_at, updated_at)
    VALUES (${id}, ${GLOSSARY_TYPE}, ${term}, ${privateRecordUrl('glossary', id)}, ${description.slice(0, 280)}, ${description}, 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      title=EXCLUDED.title,
      url=EXCLUDED.url,
      excerpt=EXCLUDED.excerpt,
      body_text=EXCLUDED.body_text,
      metadata=EXCLUDED.metadata,
      status='active',
      updated_at=now()
    WHERE core.contents.source=${SOURCE} AND core.contents.content_type=${GLOSSARY_TYPE}
    RETURNING id, title, body_text, metadata, created_at, updated_at
  `;
  if (!rows[0]) {
    const error = new Error('glossary_conflict');
    error.status = 409;
    throw error;
  }
  await syncReciprocalRelations(sql, currentId, relatedEntryIds);
  return toEntry(rows[0]);
}

async function archiveEntry(sql, id) {
  const publicEntryId = clean(id, 160).replace(/^game-notes:glossary:/, '');
  const rows = await sql`
    UPDATE core.contents SET status='archived', updated_at=now()
    WHERE id=${dbId('glossary', publicEntryId)} AND source=${SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived'
    RETURNING id
  `;
  if (!rows[0]) return false;
  await syncReciprocalRelations(sql, publicEntryId, []);
  return true;
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
        ...(await listAll(context.sql))
      });
    }

    const body = parseBody(req);
    if (req.method === 'POST' || req.method === 'PATCH') {
      const item = await saveEntry(context.sql, body);
      return res.status(200).json({ ok: true, item });
    }
    if (req.method === 'DELETE') {
      const id = clean(body.id, 160);
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const deleted = await archiveEntry(context.sql, id);
      return res.status(deleted ? 200 : 404).json({ ok: deleted, deleted });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[game-notes-glossary]', error?.message || error);
    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.message || 'game_notes_glossary_failed',
      ...(error?.details || {})
    });
  }
}
