import { neon } from '@neondatabase/serverless';

function databaseUrl() {
  return process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const url = databaseUrl();
  if (!url) return res.status(503).json({ ok: false, error: 'core_database_not_configured' });

  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT
        to_regclass('core.games')::text AS games,
        to_regclass('core.game_refs')::text AS game_refs,
        to_regclass('core.contents')::text AS contents,
        to_regclass('core.content_game_links')::text AS content_game_links,
        to_regclass('core.content_assets')::text AS content_assets,
        to_regclass('core.content_catalog')::text AS content_catalog
    `;
    const schema = rows[0] || {};
    let counts = { contents: null, links: null, assets: null };
    if (schema.contents && schema.content_game_links && schema.content_assets) {
      const c = await sql`
        SELECT
          (SELECT count(*)::int FROM core.contents) AS contents,
          (SELECT count(*)::int FROM core.content_game_links) AS links,
          (SELECT count(*)::int FROM core.content_assets) AS assets
      `;
      counts = c[0] || counts;
    }
    const ready = Boolean(schema.contents && schema.content_game_links && schema.content_assets && schema.content_catalog);
    return res.status(200).json({ ok: true, environment: process.env.VERCEL_ENV || 'unknown', ready, schema, counts });
  } catch (error) {
    console.error('[core-content-status]', error);
    return res.status(500).json({ ok: false, error: 'core_content_status_failed' });
  }
}
