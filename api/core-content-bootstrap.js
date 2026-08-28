import { neon } from '@neondatabase/serverless';
import { authorizeArchiveRequest } from './archive-core.js';

async function schemaStatus(sql) {
  const rows = await sql`
    SELECT
      to_regclass('core.contents')::text AS contents,
      to_regclass('core.content_game_links')::text AS content_game_links,
      to_regclass('core.content_assets')::text AS content_assets,
      to_regclass('core.content_catalog')::text AS content_catalog
  `;
  const schema = rows[0] || {};
  return { schema, ready: Boolean(schema.contents && schema.content_game_links && schema.content_assets && schema.content_catalog) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV !== 'production') return res.status(403).json({ ok: false, error: 'production_only' });

  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'unauthorized' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.confirm !== 'CREATE_CORE_CONTENT_REGISTRY') return res.status(400).json({ ok: false, error: 'confirmation_required' });

  const databaseUrl = auth.config?.url || '';
  if (!databaseUrl) return res.status(503).json({ ok: false, error: 'core_database_not_configured' });

  try {
    const sql = neon(databaseUrl);
    const before = await schemaStatus(sql);

    await sql`CREATE TABLE IF NOT EXISTS core.contents (
      id text PRIMARY KEY,
      content_type text NOT NULL,
      title text NOT NULL,
      url text NOT NULL UNIQUE,
      published_at timestamptz,
      excerpt text NOT NULL DEFAULT '',
      body_text text NOT NULL DEFAULT '',
      featured_image_url text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft',
      source text NOT NULL DEFAULT '',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS core.content_game_links (
      content_id text NOT NULL,
      game_id text NOT NULL,
      relation_type text NOT NULL DEFAULT 'mentioned',
      mention_text text NOT NULL DEFAULT '',
      note text NOT NULL DEFAULT '',
      confidence integer NOT NULL DEFAULT 0,
      source text NOT NULL DEFAULT '',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (content_id, game_id),
      CONSTRAINT content_game_links_content_fk FOREIGN KEY (content_id) REFERENCES core.contents(id) ON DELETE CASCADE
    )`;

    await sql`CREATE TABLE IF NOT EXISTS core.content_assets (
      id text PRIMARY KEY,
      content_id text NOT NULL,
      game_id text,
      asset_type text NOT NULL DEFAULT 'image',
      source_url text NOT NULL,
      alt_text text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT content_assets_content_fk FOREIGN KEY (content_id) REFERENCES core.contents(id) ON DELETE CASCADE,
      CONSTRAINT content_assets_content_url_unique UNIQUE (content_id, source_url)
    )`;

    await sql`CREATE INDEX IF NOT EXISTS contents_type_source_idx ON core.contents(content_type, source, updated_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS content_game_links_game_idx ON core.content_game_links(game_id, updated_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS content_assets_content_idx ON core.content_assets(content_id, sort_order)`;

    await sql`CREATE OR REPLACE VIEW core.content_catalog AS
      SELECT
        c.id,c.content_type,c.title,c.url,c.published_at,c.excerpt,c.body_text,c.featured_image_url,c.status,c.source,c.metadata,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'gameId',l.game_id,'title',g.title,'relationType',l.relation_type,'mentionText',l.mention_text,
            'note',l.note,'confidence',l.confidence,'source',l.source,'metadata',l.metadata
          ) ORDER BY g.title NULLS LAST,l.game_id)
          FROM core.content_game_links l
          LEFT JOIN core.games g ON g.id=l.game_id
          WHERE l.content_id=c.id
        ),'[]'::jsonb) AS games,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',a.id,'gameId',a.game_id,'assetType',a.asset_type,'sourceUrl',a.source_url,
            'altText',a.alt_text,'sortOrder',a.sort_order,'metadata',a.metadata
          ) ORDER BY a.sort_order,a.id)
          FROM core.content_assets a WHERE a.content_id=c.id
        ),'[]'::jsonb) AS assets,
        c.created_at,c.updated_at
      FROM core.contents c`;

    const after = await schemaStatus(sql);
    return res.status(200).json({ ok: true, created: !before.ready && after.ready, before, after });
  } catch (error) {
    console.error('[core-content-bootstrap]', error);
    return res.status(500).json({ ok: false, error: 'core_content_bootstrap_failed', code: error?.code || null });
  }
}
