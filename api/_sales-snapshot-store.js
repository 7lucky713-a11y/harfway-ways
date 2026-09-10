import { neon } from '@neondatabase/serverless';

export const SALES_SNAPSHOT_ID = 'runtime-sale-watch-live-v1';
export const SALES_SNAPSHOT_URL = 'runtime://sale-watch/live-v1';
export const SALES_SNAPSHOT_VERSION = 1;
export const SALES_PUBLIC_MAX_AGE_HOURS = 8;

export function getDatabaseUrl() {
  return (
    process.env.WAYS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

export function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) throw new Error('database_url_missing');
  return neon(databaseUrl);
}

function safeJson(value, fallback) {
  try {
    if (!value) return fallback;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function emptySnapshot() {
  return {
    version: SALES_SNAPSHOT_VERSION,
    cursor: 0,
    cycle: 0,
    states: {},
    generatedAt: null,
    catalogUpdatedAt: null,
  };
}

export async function readSnapshot() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, body_text, metadata, updated_at
    FROM core.contents
    WHERE id = ${SALES_SNAPSHOT_ID}
      AND content_type = 'sale_snapshot'
      AND source = 'sale-watch'
      AND status = 'active'
    LIMIT 1
  `;

  if (!rows.length) return null;
  const row = rows[0];
  const snapshot = safeJson(row.body_text, emptySnapshot());
  const metadata = safeJson(row.metadata, {});
  return {
    ...emptySnapshot(),
    ...snapshot,
    states: snapshot.states && typeof snapshot.states === 'object' ? snapshot.states : {},
    metadata,
    updatedAt: row.updated_at || null,
  };
}

export async function writeSnapshot(snapshot, metadata = {}) {
  const sql = getSql();
  const now = new Date().toISOString();
  const bodyText = JSON.stringify({
    version: SALES_SNAPSHOT_VERSION,
    cursor: Number(snapshot.cursor || 0),
    cycle: Number(snapshot.cycle || 0),
    states: snapshot.states && typeof snapshot.states === 'object' ? snapshot.states : {},
    generatedAt: snapshot.generatedAt || now,
    catalogUpdatedAt: snapshot.catalogUpdatedAt || null,
  });

  const meta = {
    version: SALES_SNAPSHOT_VERSION,
    country: 'JP',
    currency: 'JPY',
    ...metadata,
    generatedAt: snapshot.generatedAt || now,
  };

  await sql`
    INSERT INTO core.contents (
      id, content_type, title, url, published_at, excerpt, body_text,
      featured_image_url, status, source, metadata, created_at, updated_at
    ) VALUES (
      ${SALES_SNAPSHOT_ID},
      'sale_snapshot',
      'SALE WATCH live snapshot',
      ${SALES_SNAPSHOT_URL},
      NOW(),
      'Precomputed current Steam sale snapshot for HARF-WAY reader surfaces.',
      ${bodyText},
      '',
      'active',
      'sale-watch',
      ${JSON.stringify(meta)}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      url = EXCLUDED.url,
      published_at = EXCLUDED.published_at,
      excerpt = EXCLUDED.excerpt,
      body_text = EXCLUDED.body_text,
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `;
}

export function snapshotSaleItems(snapshot, maxAgeHours = SALES_PUBLIC_MAX_AGE_HOURS) {
  const cutoff = Date.now() - Math.max(1, Number(maxAgeHours || SALES_PUBLIC_MAX_AGE_HOURS)) * 60 * 60 * 1000;
  return Object.values(snapshot?.states || {})
    .filter((item) => {
      if (!item?.onSale) return false;
      const checked = Date.parse(item.checkedAt || '');
      return Number.isFinite(checked) && checked >= cutoff;
    })
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ja'));
}
