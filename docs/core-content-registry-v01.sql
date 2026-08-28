-- HARF-WAY Shared Content Core / Content Registry v0.1
-- Adds first-class reusable content records and game-content relations.

CREATE TABLE IF NOT EXISTS core.contents (
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
);

CREATE TABLE IF NOT EXISTS core.content_game_links (
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
  CONSTRAINT content_game_links_content_fk
    FOREIGN KEY (content_id) REFERENCES core.contents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core.content_assets (
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
  CONSTRAINT content_assets_content_fk
    FOREIGN KEY (content_id) REFERENCES core.contents(id) ON DELETE CASCADE,
  CONSTRAINT content_assets_content_url_unique UNIQUE (content_id, source_url)
);

CREATE INDEX IF NOT EXISTS contents_type_source_idx
  ON core.contents(content_type, source, updated_at DESC);
CREATE INDEX IF NOT EXISTS content_game_links_game_idx
  ON core.content_game_links(game_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS content_assets_content_idx
  ON core.content_assets(content_id, sort_order);

CREATE OR REPLACE VIEW core.content_catalog AS
SELECT
  c.id,
  c.content_type,
  c.title,
  c.url,
  c.published_at,
  c.excerpt,
  c.body_text,
  c.featured_image_url,
  c.status,
  c.source,
  c.metadata,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'gameId', l.game_id,
        'title', g.title,
        'relationType', l.relation_type,
        'mentionText', l.mention_text,
        'note', l.note,
        'confidence', l.confidence,
        'source', l.source,
        'metadata', l.metadata
      ) ORDER BY g.title NULLS LAST, l.game_id
    )
    FROM core.content_game_links l
    LEFT JOIN core.games g ON g.id = l.game_id
    WHERE l.content_id = c.id
  ), '[]'::jsonb) AS games,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'gameId', a.game_id,
        'assetType', a.asset_type,
        'sourceUrl', a.source_url,
        'altText', a.alt_text,
        'sortOrder', a.sort_order,
        'metadata', a.metadata
      ) ORDER BY a.sort_order, a.id
    )
    FROM core.content_assets a
    WHERE a.content_id = c.id
  ), '[]'::jsonb) AS assets,
  c.created_at,
  c.updated_at
FROM core.contents c;
