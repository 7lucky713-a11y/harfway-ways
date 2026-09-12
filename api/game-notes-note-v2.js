import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'private-game-notes';
const NOTE_TYPE = 'private_game_note';
const GAME_TYPE = 'private_game_note_game';
const TYPE_TYPE = 'private_game_note_type';
const FACET_TYPE = 'private_game_note_facet';
const TARGET_GAME_IDS = new Set([
  'a10e6a8c-95a7-4480-adcb-bf6f8c8054e2',
  'c5dd23a5-4951-4123-881d-c71df1c446b3'
]);

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
function privateRecordUrl(entity, id) {
  return `/game-notes/_private/${entity}/${encodeURIComponent(publicId(id, entity))}`;
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
function validTime(value) {
  const v = clean(value, 5);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '';
}
function validStage(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return n;
}
function normalizeRun(value) {
  const startTime = validTime(value?.startTime);
  const endTime = validTime(value?.endTime);
  const reachedStage = validStage(value?.reachedStage);
  if (!startTime && !endTime && reachedStage === null) return null;
  return { startTime, endTime, reachedStage };
}
function normalizedFacetObject(meta) {
  const result = {};
  if (meta.facets && typeof meta.facets === 'object' && !Array.isArray(meta.facets)) {
    for (const [key, value] of Object.entries(meta.facets)) {
      const id = clean(key, 160);
      if (id) result[id] = normalizeList(value);
    }
  }
  const legacy = { tags: meta.tags, characters: meta.characters, themes: meta.themes };
  for (const [id, values] of Object.entries(legacy)) {
    if (!result[id]?.length && Array.isArray(values) && values.length) result[id] = normalizeList(values);
  }
  return result;
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

async function assertDictionaryExists(sql, entity, publicValue) {
  const contentType = entity === 'game' ? GAME_TYPE : TYPE_TYPE;
  const id = dbId(entity, publicValue);
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE id=${id} AND source=${SOURCE} AND content_type=${contentType} AND status<>'archived'
    LIMIT 1
  `;
  if (!rows[0]) {
    const error = new Error(`${entity}_not_found`);
    error.status = 400;
    throw error;
  }
}
async function normalizeFacetsForSave(sql, body, currentMeta = {}) {
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE source=${SOURCE} AND content_type=${FACET_TYPE} AND status<>'archived'
  `;
  const allowed = new Set(rows.map(row => publicId(row.id, 'facet')));
  const source = body.facets && typeof body.facets === 'object' && !Array.isArray(body.facets)
    ? body.facets
    : { tags: body.tags, characters: body.characters, themes: body.themes };
  const result = {};
  for (const [rawId, values] of Object.entries(source || {})) {
    const id = clean(rawId, 160);
    if (!allowed.has(id)) continue;
    const list = normalizeList(values);
    if (list.length) result[id] = list;
  }
  const current = normalizedFacetObject(currentMeta);
  for (const legacyId of ['tags', 'characters', 'themes']) {
    if (!result[legacyId]?.length && current[legacyId]?.length && allowed.has(legacyId)) {
      result[legacyId] = [...current[legacyId]];
    }
  }
  return result;
}
function toNote(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const facets = normalizedFacetObject(meta);
  return {
    id: publicId(row.id, 'note'),
    title: row.title || '',
    body: row.body_text || '',
    gameId: meta.gameId || '',
    typeId: meta.typeId || '',
    facets,
    tags: facets.tags || [],
    characters: facets.characters || [],
    themes: facets.themes || [],
    media: Array.isArray(meta.media) ? meta.media : [],
    outputStatus: meta.outputStatus || 'private',
    exportedTo: Array.isArray(meta.exportedTo) ? meta.exportedTo : [],
    createdAt: meta.createdAt || (row.created_at ? new Date(row.created_at).toISOString() : null),
    updatedAt: row.updated_at || null,
    monsterTrainRun: meta?.gameSpecific?.monsterTrain2 || null
  };
}

async function listRuns(sql) {
  const rows = await sql`
    SELECT id, metadata, created_at, updated_at
    FROM core.contents
    WHERE source=${SOURCE} AND content_type=${NOTE_TYPE} AND status<>'archived'
      AND metadata->>'gameId' = ANY(${[...TARGET_GAME_IDS]})
    ORDER BY updated_at DESC
  `;
  return rows.map(row => {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return {
      noteId: publicId(row.id, 'note'),
      gameId: meta.gameId || '',
      run: meta?.gameSpecific?.monsterTrain2 || null,
      updatedAt: row.updated_at || null
    };
  });
}

async function saveNote(sql, body) {
  const gameId = clean(body.gameId, 160);
  const typeId = clean(body.typeId, 160);
  const text = clean(body.body, 30000);
  if (!gameId || !typeId || !text) {
    const error = new Error('game_type_body_required');
    error.status = 400;
    throw error;
  }
  await assertDictionaryExists(sql, 'game', gameId);
  await assertDictionaryExists(sql, 'type', typeId);

  const id = dbId('note', body.id);
  let currentMeta = {};
  if (body.id) {
    const current = await sql`
      SELECT metadata FROM core.contents
      WHERE id=${id} AND source=${SOURCE} AND content_type=${NOTE_TYPE}
      LIMIT 1
    `;
    currentMeta = current[0]?.metadata && typeof current[0].metadata === 'object' ? current[0].metadata : {};
  }

  const facets = await normalizeFacetsForSave(sql, body, currentMeta);
  const title = clean(body.title, 280) || clean(text.replace(/\s+/g, ' '), 60);
  const outputStatus = ['private', 'candidate', 'exported'].includes(body.outputStatus) ? body.outputStatus : 'private';
  const gameSpecific = currentMeta.gameSpecific && typeof currentMeta.gameSpecific === 'object' && !Array.isArray(currentMeta.gameSpecific)
    ? { ...currentMeta.gameSpecific }
    : {};

  if (TARGET_GAME_IDS.has(gameId)) {
    const run = normalizeRun(body.monsterTrainRun);
    if (run) gameSpecific.monsterTrain2 = run;
    else delete gameSpecific.monsterTrain2;
  } else {
    delete gameSpecific.monsterTrain2;
  }

  const metadata = JSON.stringify({
    ...currentMeta,
    gameId,
    typeId,
    facets,
    tags: facets.tags || [],
    characters: facets.characters || [],
    themes: facets.themes || [],
    media: validMedia(body.media),
    outputStatus,
    exportedTo: normalizeList(body.exportedTo, 20, 80),
    createdAt: clean(body.createdAt, 60) || clean(currentMeta.createdAt, 60) || new Date().toISOString(),
    gameSpecific
  });

  const rows = await sql`
    INSERT INTO core.contents (id, content_type, title, url, excerpt, body_text, status, source, metadata, created_at, updated_at)
    VALUES (${id}, ${NOTE_TYPE}, ${title}, ${privateRecordUrl('note', id)}, ${text.slice(0, 280)}, ${text}, 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    ON CONFLICT (id) DO UPDATE SET
      url=EXCLUDED.url,
      title=EXCLUDED.title,
      excerpt=EXCLUDED.excerpt,
      body_text=EXCLUDED.body_text,
      status='active',
      metadata=EXCLUDED.metadata,
      updated_at=now()
    WHERE core.contents.source=${SOURCE} AND core.contents.content_type=${NOTE_TYPE}
    RETURNING id, content_type, title, body_text, metadata, created_at, updated_at
  `;
  if (!rows[0]) {
    const error = new Error('note_conflict');
    error.status = 409;
    throw error;
  }
  return toNote(rows[0]);
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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
        runs: await listRuns(context.sql)
      });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = parseBody(req);
      if (clean(body.entity, 20).toLowerCase() !== 'note') {
        return res.status(400).json({ ok: false, error: 'invalid_entity' });
      }
      const item = await saveNote(context.sql, body);
      return res.status(200).json({ ok: true, entity: 'note', item });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[game-notes-note-v2]', error?.message || error);
    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.message || 'game_notes_note_v2_failed',
      ...(error?.details || {})
    });
  }
}
