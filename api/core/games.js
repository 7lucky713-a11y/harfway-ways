import { neon } from '@neondatabase/serverless';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function getDatabaseUrl() {
  return (
    process.env.WAYS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

function clampLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    id: String(row.id || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
    storeUrl: String(row.store_url || ''),
    articleUrl: String(row.article_url || ''),
    category: String(row.category || ''),
    status: String(row.status || ''),
    sourceOfTruth: String(row.source_of_truth || ''),
    tags: Array.isArray(row.tags) ? row.tags : [],
    refs: Array.isArray(row.refs) ? row.refs : [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return res.status(503).json({
      ok: false,
      error: 'database_not_configured',
      expectedEnv: ['WAYS_DATABASE_URL', 'DATABASE_URL', 'NEON_DATABASE_URL', 'POSTGRES_URL']
    });
  }

  const sql = neon(databaseUrl);
  const id = String(req.query?.id || '').trim();
  const q = String(req.query?.q || '').trim();
  const limit = clampLimit(req.query?.limit);

  const baseSelect = sql`
    SELECT
      c.id,
      c.title,
      c.description,
      c.store_url,
      c.article_url,
      c.category,
      c.status,
      c.source_of_truth,
      c.tags,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'service', r.service,
            'externalId', r.external_id,
            'externalUrl', r.external_url,
            'metadata', r.metadata
          ) ORDER BY r.service, r.external_id
        )
        FROM core.game_refs r
        WHERE r.game_id = c.id
      ), '[]'::jsonb) AS refs,
      c.created_at,
      c.updated_at
    FROM core.game_catalog c
  `;

  try {
    let rows;
    if (id) {
      rows = await sql`
        SELECT
          c.id,
          c.title,
          c.description,
          c.store_url,
          c.article_url,
          c.category,
          c.status,
          c.source_of_truth,
          c.tags,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'service', r.service,
                'externalId', r.external_id,
                'externalUrl', r.external_url,
                'metadata', r.metadata
              ) ORDER BY r.service, r.external_id
            )
            FROM core.game_refs r
            WHERE r.game_id = c.id
          ), '[]'::jsonb) AS refs,
          c.created_at,
          c.updated_at
        FROM core.game_catalog c
        WHERE c.status = 'active' AND c.id = ${id}
        LIMIT 1
      `;
    } else if (q) {
      const pattern = `%${q}%`;
      rows = await sql`
        SELECT
          c.id,
          c.title,
          c.description,
          c.store_url,
          c.article_url,
          c.category,
          c.status,
          c.source_of_truth,
          c.tags,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'service', r.service,
                'externalId', r.external_id,
                'externalUrl', r.external_url,
                'metadata', r.metadata
              ) ORDER BY r.service, r.external_id
            )
            FROM core.game_refs r
            WHERE r.game_id = c.id
          ), '[]'::jsonb) AS refs,
          c.created_at,
          c.updated_at
        FROM core.game_catalog c
        WHERE c.status = 'active'
          AND (
            c.title ILIKE ${pattern}
            OR c.category ILIKE ${pattern}
            OR EXISTS (
              SELECT 1 FROM core.game_tags gt
              WHERE gt.game_id = c.id AND gt.tag ILIKE ${pattern}
            )
          )
        ORDER BY c.updated_at DESC, c.title ASC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT
          c.id,
          c.title,
          c.description,
          c.store_url,
          c.article_url,
          c.category,
          c.status,
          c.source_of_truth,
          c.tags,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'service', r.service,
                'externalId', r.external_id,
                'externalUrl', r.external_url,
                'metadata', r.metadata
              ) ORDER BY r.service, r.external_id
            )
            FROM core.game_refs r
            WHERE r.game_id = c.id
          ), '[]'::jsonb) AS refs,
          c.created_at,
          c.updated_at
        FROM core.game_catalog c
        WHERE c.status = 'active'
        ORDER BY c.updated_at DESC, c.title ASC
        LIMIT ${limit}
      `;
    }

    const games = normalizeRows(rows);
    return res.status(200).json({
      ok: true,
      version: '0.1',
      source: 'shared-content-core',
      query: { id: id || null, q: q || null, limit },
      count: games.length,
      games
    });
  } catch (error) {
    console.error('[shared-content-core] games query failed', error);
    return res.status(500).json({ ok: false, error: 'core_query_failed' });
  }
}
