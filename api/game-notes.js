import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-mute-fire-aw1c2dpw';
const SOURCE = 'private-game-notes';
const NOTE_TYPE = 'private_game_note';
const GAME_TYPE = 'private_game_note_game';
const DICTIONARY_TYPE = 'private_game_note_type';
const DEFAULT_TYPES = [
  ['memo', 'メモ'],
  ['idea', 'アイデア'],
  ['scene', 'シーン'],
  ['quote', 'セリフ'],
  ['character', 'キャラ']
];

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function normalizeList(value, maxItems = 40, maxLength = 100) {
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
function publicId(id, entity) {
  return String(id || '').replace(new RegExp(`^game-notes:${entity}:`), '');
}
function dbId(entity, id) {
  const raw = clean(id, 160).replace(new RegExp(`^game-notes:${entity}:`), '');
  return `game-notes:${entity}:${raw || crypto.randomUUID()}`;
}
function validMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.slice(0, 12).map((item) => {
    const key = clean(item?.key, 1200);
    if (!/^private-game-notes\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm)$/i.test(key)) return null;
    return {
      key,
      type: clean(item?.type, 120),
      kind: clean(item?.kind, 24),
      size: Math.max(0, Number(item?.size || 0) || 0),
      name: clean(item?.name, 240)
    };
  }).filter(Boolean);
}

async function databaseContext() {
  const config = archiveDatabaseConfig();
  const expectedBranchId = config.production ? PRODUCTION_BRANCH_ID : PREVIEW_BRANCH_ID;
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
  if (projectId !== PROJECT_ID || branchId !== expectedBranchId || !tableReady) {
    const error = new Error('database_identity_mismatch');
    error.status = 409;
    error.details = { projectId: projectId || null, branchId: branchId || null, expectedBranchId, tableReady };
    throw error;
  }
  return { sql, production: config.production, branchId, storage: config.production ? 'shared-content-core' : 'neon-preview' };
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
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id, 'game'),
    name: row.title || '',
    canonicalGameId: meta.canonicalGameId || '',
    createdAt: meta.createdAt || row.created_at || null,
    updatedAt: row.updated_at || null
  };
}
function toType(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id, 'type'),
    name: row.title || '',
    system: Boolean(meta.system),
    createdAt: meta.createdAt || row.created_at || null,
    updatedAt: row.updated_at || null
  };
}
function toNote(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id, 'note'),
    title: row.title || '',
    body: row.body_text || '',
    gameId: meta.gameId || '',
    typeId: meta.typeId || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    characters: Array.isArray(meta.characters) ? meta.characters : [],
    themes: Array.isArray(meta.themes) ? meta.themes : [],
    media: Array.isArray(meta.media) ? meta.media : [],
    outputStatus: meta.outputStatus || 'private',
    exportedTo: Array.isArray(meta.exportedTo) ? meta.exportedTo : [],
    createdAt: meta.createdAt || (row.created_at ? new Date(row.created_at).toISOString() : null),
    updatedAt: row.updated_at || null
  };
}

async function listAll(sql) {
  const rows = await sql`
    SELECT id, content_type, title, body_text, metadata, created_at, updated_at
    FROM core.contents
    WHERE source = ${SOURCE}
      AND content_type IN (${NOTE_TYPE}, ${GAME_TYPE}, ${DICTIONARY_TYPE})
      AND status <> 'archived'
    ORDER BY updated_at DESC
  `;
  const games = [], types = [], notes = [];
  for (const row of rows) {
    if (row.content_type === GAME_TYPE) games.push(toGame(row));
    if (row.content_type === DICTIONARY_TYPE) types.push(toType(row));
    if (row.content_type === NOTE_TYPE) notes.push(toNote(row));
  }
  games.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  types.sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, 'ja'));
  notes.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  return { games, types, notes };
}

async function bootstrap(sql) {
  for (const [id, name] of DEFAULT_TYPES) {
    const metadata = JSON.stringify({ system: true, createdAt: new Date().toISOString() });
    await sql`
      INSERT INTO core.contents
        (id, content_type, title, body_text, status, source, metadata, created_at, updated_at)
      VALUES
        (${dbId('type', id)}, ${DICTIONARY_TYPE}, ${name}, '', 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
      ON CONFLICT (id) DO UPDATE SET status = 'active', title = EXCLUDED.title, updated_at = now()
      WHERE core.contents.source = ${SOURCE}
    `;
  }
  return true;
}

async function ensureUniqueTitle(sql, contentType, title, currentDbId = '') {
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE source = ${SOURCE}
      AND content_type = ${contentType}
      AND status <> 'archived'
      AND lower(title) = lower(${title})
      AND (${currentDbId} = '' OR id <> ${currentDbId})
    LIMIT 1
  `;
  if (rows[0]) {
    const error = new Error('duplicate_dictionary_value');
    error.status = 409;
    throw error;
  }
}

async function upsertDictionary(sql, entity, body) {
  const isGame = entity === 'game';
  const contentType = isGame ? GAME_TYPE : DICTIONARY_TYPE;
  const title = clean(body.name || body.title, 180);
  if (!title) {
    const error = new Error('name_required'); error.status = 400; throw error;
  }
  const id = dbId(entity, body.id);
  await ensureUniqueTitle(sql, contentType, title, body.id ? id : '');
  const metadata = JSON.stringify({
    ...(isGame ? { canonicalGameId: clean(body.canonicalGameId, 180) } : { system: false }),
    createdAt: clean(body.createdAt, 60) || new Date().toISOString()
  });
  const rows = await sql`
    INSERT INTO core.contents
      (id, content_type, title, body_text, status, source, metadata, created_at, updated_at)
    VALUES
      (${id}, ${contentType}, ${title}, '', 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, metadata = EXCLUDED.metadata, status = 'active', updated_at = now()
    WHERE core.contents.source = ${SOURCE}
    RETURNING id, content_type, title, body_text, metadata, created_at, updated_at
  `;
  if (!rows[0]) { const error = new Error('dictionary_conflict'); error.status = 409; throw error; }
  return isGame ? toGame(rows[0]) : toType(rows[0]);
}

async function assertDictionaryExists(sql, entity, publicValue) {
  const contentType = entity === 'game' ? GAME_TYPE : DICTIONARY_TYPE;
  const id = dbId(entity, publicValue);
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE id = ${id} AND source = ${SOURCE} AND content_type = ${contentType} AND status <> 'archived'
    LIMIT 1
  `;
  if (!rows[0]) { const error = new Error(`${entity}_not_found`); error.status = 400; throw error; }
}

async function upsertNote(sql, body) {
  const gameId = clean(body.gameId, 160);
  const typeId = clean(body.typeId, 160);
  const text = clean(body.body, 30000);
  if (!gameId || !typeId || !text) {
    const error = new Error('game_type_body_required'); error.status = 400; throw error;
  }
  await assertDictionaryExists(sql, 'game', gameId);
  await assertDictionaryExists(sql, 'type', typeId);
  const id = dbId('note', body.id);
  const title = clean(body.title, 280) || clean(text.replace(/\s+/g, ' '), 60);
  const outputStatus = ['private', 'candidate', 'exported'].includes(body.outputStatus) ? body.outputStatus : 'private';
  const metadata = JSON.stringify({
    gameId,
    typeId,
    tags: normalizeList(body.tags),
    characters: normalizeList(body.characters),
    themes: normalizeList(body.themes),
    media: validMedia(body.media),
    outputStatus,
    exportedTo: normalizeList(body.exportedTo, 20, 80),
    createdAt: clean(body.createdAt, 60) || new Date().toISOString()
  });
  const excerpt = text.slice(0, 280);
  const rows = await sql`
    INSERT INTO core.contents
      (id, content_type, title, excerpt, body_text, status, source, metadata, created_at, updated_at)
    VALUES
      (${id}, ${NOTE_TYPE}, ${title}, ${excerpt}, ${text}, 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      excerpt = EXCLUDED.excerpt,
      body_text = EXCLUDED.body_text,
      status = 'active',
      metadata = EXCLUDED.metadata,
      updated_at = now()
    WHERE core.contents.source = ${SOURCE}
    RETURNING id, content_type, title, body_text, metadata, created_at, updated_at
  `;
  if (!rows[0]) { const error = new Error('note_conflict'); error.status = 409; throw error; }
  return toNote(rows[0]);
}

async function archiveEntity(sql, entity, id) {
  const contentType = entity === 'note' ? NOTE_TYPE : entity === 'game' ? GAME_TYPE : DICTIONARY_TYPE;
  const dbid = dbId(entity, id);
  if (entity !== 'note') {
    const field = entity === 'game' ? 'gameId' : 'typeId';
    const rows = await sql`
      SELECT count(*)::int AS count FROM core.contents
      WHERE source = ${SOURCE} AND content_type = ${NOTE_TYPE} AND status <> 'archived'
        AND metadata->>${field} = ${clean(id, 160)}
    `;
    const count = Number(rows[0]?.count || 0);
    if (count > 0) {
      const error = new Error('dictionary_in_use'); error.status = 409; error.details = { count }; throw error;
    }
  }
  const rows = await sql`
    UPDATE core.contents SET status = 'archived', updated_at = now()
    WHERE id = ${dbid} AND source = ${SOURCE} AND content_type = ${contentType} AND status <> 'archived'
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
      return res.status(200).json({ ok: true, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId, ...(await listAll(context.sql)) });
    }
    const body = parseBody(req);
    if (req.method === 'POST' || req.method === 'PATCH') {
      const entity = clean(body.entity, 20).toLowerCase();
      if (entity === 'bootstrap') {
        await bootstrap(context.sql);
        return res.status(200).json({ ok: true, bootstrapped: true });
      }
      if (entity === 'game' || entity === 'type') {
        const item = await upsertDictionary(context.sql, entity, body);
        return res.status(200).json({ ok: true, entity, item });
      }
      if (entity === 'note') {
        const item = await upsertNote(context.sql, body);
        return res.status(200).json({ ok: true, entity, item });
      }
      return res.status(400).json({ ok: false, error: 'invalid_entity' });
    }
    if (req.method === 'DELETE') {
      const entity = clean(body.entity, 20).toLowerCase();
      if (!['note', 'game', 'type'].includes(entity)) return res.status(400).json({ ok: false, error: 'invalid_entity' });
      const id = clean(body.id, 160);
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const deleted = await archiveEntity(context.sql, entity, id);
      return res.status(deleted ? 200 : 404).json({ ok: deleted, deleted });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[game-notes-api]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'game_notes_api_failed', ...(error?.details || {}) });
  }
}
