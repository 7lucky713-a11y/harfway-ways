import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const LABEL_PREFIX = '__ways_label:';

function readHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function databaseUrl() {
  return process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
}

function decodeLabel(marker) {
  const raw = String(marker || '').slice(LABEL_PREFIX.length);
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function labelsOf(game) {
  const tags = Array.isArray(game?.tags) ? game.tags : [];
  const markers = tags
    .filter(tag => String(tag || '').toLowerCase().startsWith(LABEL_PREFIX))
    .map(decodeLabel);
  const explicit = Array.isArray(game?.labels) ? game.labels : [];
  return [...new Set([...markers, ...explicit].map(v => String(v || '').trim()).filter(Boolean))];
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function cleanDescription(value) {
  return String(value || '').trim().slice(0, 800);
}

function stableId(key) {
  return `ways-label:${createHash('sha1').update(String(key || '')).digest('hex').slice(0, 20)}`;
}

async function loadEditorState(adminKey) {
  const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
    method: 'GET',
    cache: 'no-store',
    headers: { accept: 'application/json', 'x-showcase-admin-key': adminKey }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    const error = new Error('invalid_admin_key');
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`editor_state_${response.status}`);
    error.status = 502;
    throw error;
  }
  return data?.state || { games: [] };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const adminKey = String(readHeader(req, 'x-showcase-admin-key') || '').trim();
    if (!adminKey) return res.status(401).json({ ok: false, error: 'admin_key_required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const key = String(body.key || body.assignmentKey || '').trim();
    const name = cleanName(body.name);
    const description = cleanDescription(body.description);
    if (!key) return res.status(400).json({ ok: false, error: 'label_key_required' });
    if (!name) return res.status(400).json({ ok: false, error: 'label_name_required' });

    const state = await loadEditorState(adminKey);
    const games = Array.isArray(state?.games) ? state.games : [];
    const rawLabels = new Set(games.flatMap(labelsOf));
    const count = games.filter(game => labelsOf(game).includes(key)).length;
    if (!count) return res.status(404).json({ ok: false, error: 'label_not_found' });

    const conflictingRaw = [...rawLabels].find(raw => raw !== key && raw.toLowerCase() === name.toLowerCase());
    if (conflictingRaw) return res.status(409).json({ ok: false, error: 'label_name_exists', conflict: conflictingRaw });

    if (process.env.VERCEL_ENV !== 'production') {
      return res.status(200).json({
        ok: true,
        preview: true,
        persisted: false,
        label: { key, name, description, count }
      });
    }

    const url = databaseUrl();
    if (!url) return res.status(503).json({ ok: false, error: 'core_database_not_configured' });
    const sql = neon(url);

    const duplicate = await sql`
      SELECT id, title
      FROM core.contents
      WHERE content_type = 'ways_label'
        AND source = 'ways-label-editor'
        AND status = 'active'
        AND lower(title) = lower(${name})
        AND COALESCE(metadata->>'key', '') <> ${key}
      LIMIT 1
    `;
    if (duplicate.length) return res.status(409).json({ ok: false, error: 'label_name_exists', conflict: duplicate[0]?.title || name });

    const existing = await sql`
      SELECT id, url, metadata
      FROM core.contents
      WHERE content_type = 'ways_label'
        AND source = 'ways-label-editor'
        AND metadata->>'key' = ${key}
      LIMIT 1
    `;

    const metadata = {
      ...(existing[0]?.metadata && typeof existing[0].metadata === 'object' ? existing[0].metadata : {}),
      key
    };
    const metadataJson = JSON.stringify(metadata);

    if (existing.length) {
      await sql`
        UPDATE core.contents
        SET title = ${name},
            excerpt = ${description},
            status = 'active',
            source = 'ways-label-editor',
            metadata = CAST(${metadataJson} AS jsonb),
            updated_at = now()
        WHERE id = ${existing[0].id}
      `;
    } else {
      const id = stableId(key);
      await sql`
        INSERT INTO core.contents (
          id, content_type, title, url, excerpt, body_text, featured_image_url,
          status, source, metadata, created_at, updated_at
        ) VALUES (
          ${id}, 'ways_label', ${name}, ${`ways-label://${id}`}, ${description}, '', '',
          'active', 'ways-label-editor', CAST(${metadataJson} AS jsonb), now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          excerpt = EXCLUDED.excerpt,
          status = 'active',
          source = 'ways-label-editor',
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `;
    }

    return res.status(200).json({
      ok: true,
      preview: false,
      persisted: true,
      label: { key, name, description, count }
    });
  } catch (error) {
    console.error('[ways-label-admin]', error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'label_update_failed' });
  }
}
