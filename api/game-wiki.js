import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'private-game-notes';
const GAME_TYPE = 'private_game_note_game';
const GLOSSARY_TYPE = 'private_game_note_glossary';

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
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
function publicId(id, entity) {
  return String(id || '').replace(new RegExp(`^game-notes:${entity}:`), '');
}
function databaseConfig() {
  const production = process.env.VERCEL_ENV === 'production';
  if (production) {
    return {
      production,
      expectedBranchId: PRODUCTION_BRANCH_ID,
      url: archiveDatabaseConfig().url || ''
    };
  }
  return {
    production,
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
    throw error;
  }
  return { sql, production: config.production };
}

function toPublicEntry(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: publicId(row.id, 'glossary'),
    term: row.title || '',
    description: row.body_text || '',
    gameId: clean(meta.gameId, 160),
    gameName: row.game_name || '',
    relatedTerms: normalizeList(meta.relatedTerms),
    publishedAt: clean(meta.publishedAt, 80) || null,
    updatedAt: row.updated_at || null,
    url: `/game-wiki/?entry=${encodeURIComponent(publicId(row.id, 'glossary'))}`
  };
}

async function listPublished(sql) {
  const rows = await sql`
    SELECT c.id, c.title, c.body_text, c.metadata, c.updated_at,
      COALESCE((
        SELECT g.title
        FROM core.contents g
        WHERE g.id = ('game-notes:game:' || COALESCE(c.metadata->>'gameId',''))
          AND g.source=${SOURCE}
          AND g.content_type=${GAME_TYPE}
          AND g.status<>'archived'
        LIMIT 1
      ), '') AS game_name
    FROM core.contents c
    WHERE c.source=${SOURCE}
      AND c.content_type=${GLOSSARY_TYPE}
      AND c.status<>'archived'
      AND COALESCE(c.metadata->>'publicationState','private')='published'
    ORDER BY COALESCE(c.metadata->>'publishedAt', c.updated_at::text) DESC, c.title ASC
  `;
  return rows.map(toPublicEntry);
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const context = await databaseContext();
    const entries = await listPublished(context.sql);
    return res.status(200).json({
      ok: true,
      environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'),
      entries
    });
  } catch (error) {
    console.error('[game-wiki]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'game_wiki_failed' });
  }
}
