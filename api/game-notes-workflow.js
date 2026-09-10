import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'private-game-notes';
const GAME_TYPE = 'private_game_note_game';
const NOTE_TYPE = 'private_game_note';
const STATUSES = new Set(['play', 'edit', 'publish', 'archive']);
const CHANNELS = new Set(['ways', 'x', 'scraps']);

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function publicGameId(id) {
  return String(id || '').replace(/^game-notes:game:/, '');
}
function dbGameId(id) {
  return `game-notes:game:${clean(id, 160).replace(/^game-notes:game:/, '')}`;
}
function normalizeChannels(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => clean(v, 30).toLowerCase()).filter(v => CHANNELS.has(v)))];
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
  if (projectId !== PROJECT_ID || branchId !== config.expectedBranchId || clean(info.contents_table, 120) !== 'core.contents') {
    const error = new Error('database_identity_mismatch');
    error.status = 409;
    error.details = { projectId: projectId || null, branchId: branchId || null, expectedBranchId: config.expectedBranchId };
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
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const status = STATUSES.has(String(meta.workflowStatus || '').toLowerCase()) ? String(meta.workflowStatus).toLowerCase() : 'play';
  const targets = normalizeChannels(meta.publishTargets);
  const completed = normalizeChannels(meta.publishedTargets).filter(v => targets.includes(v));
  return {
    id: publicGameId(row.id),
    name: row.title || '',
    workflowStatus: status,
    publishTargets: targets,
    publishedTargets: completed,
    workflowUpdatedAt: meta.workflowUpdatedAt || row.updated_at || null,
    noteCount: Number(row.note_count || 0),
    mediaCount: Number(row.media_count || 0),
    latestNoteAt: row.latest_note_at || null
  };
}
async function listGames(sql) {
  const rows = await sql`
    SELECT g.id, g.title, g.metadata, g.created_at, g.updated_at,
      COUNT(n.id)::int AS note_count,
      COALESCE(SUM(CASE WHEN jsonb_typeof(n.metadata->'media') = 'array' THEN jsonb_array_length(n.metadata->'media') ELSE 0 END), 0)::int AS media_count,
      MAX(n.updated_at) AS latest_note_at
    FROM core.contents g
    LEFT JOIN core.contents n
      ON n.source = ${SOURCE}
      AND n.content_type = ${NOTE_TYPE}
      AND n.status <> 'archived'
      AND n.metadata->>'gameId' = regexp_replace(g.id, '^game-notes:game:', '')
    WHERE g.source = ${SOURCE}
      AND g.content_type = ${GAME_TYPE}
      AND g.status <> 'archived'
    GROUP BY g.id, g.title, g.metadata, g.created_at, g.updated_at
    ORDER BY COALESCE(MAX(n.updated_at), g.updated_at) DESC
  `;
  return rows.map(toGame);
}
async function updateWorkflow(sql, body) {
  const gameId = clean(body.gameId || body.id, 160).replace(/^game-notes:game:/, '');
  if (!gameId) { const error = new Error('game_id_required'); error.status = 400; throw error; }
  const requestedStatus = clean(body.workflowStatus || body.status, 30).toLowerCase();
  if (!STATUSES.has(requestedStatus)) { const error = new Error('invalid_workflow_status'); error.status = 400; throw error; }
  const targets = normalizeChannels(body.publishTargets);
  const completed = normalizeChannels(body.publishedTargets).filter(v => targets.includes(v));
  const patch = JSON.stringify({
    workflowStatus: requestedStatus,
    publishTargets: targets,
    publishedTargets: completed,
    workflowUpdatedAt: new Date().toISOString()
  });
  const rows = await sql`
    UPDATE core.contents
    SET metadata = COALESCE(metadata, '{}'::jsonb) || CAST(${patch} AS jsonb),
        updated_at = now()
    WHERE id = ${dbGameId(gameId)}
      AND source = ${SOURCE}
      AND content_type = ${GAME_TYPE}
      AND status <> 'archived'
    RETURNING id
  `;
  if (!rows[0]) { const error = new Error('game_not_found'); error.status = 404; throw error; }
  const games = await listGames(sql);
  return games.find(g => g.id === gameId) || null;
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const context = await databaseContext();
    await authorize(req, context.production);
    if (req.method === 'GET') {
      const games = await listGames(context.sql);
      return res.status(200).json({ ok: true, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId, games });
    }
    if (req.method === 'PATCH') {
      const item = await updateWorkflow(context.sql, parseBody(req));
      return res.status(200).json({ ok: true, item });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[game-notes-workflow-api]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'game_notes_workflow_failed', ...(error?.details || {}) });
  }
}
