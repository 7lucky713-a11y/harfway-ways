import { neon } from '@neondatabase/serverless';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const LABEL_PREFIX = '__ways_label:';

function databaseUrl() {
  return process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
}

function decodeLabel(marker) {
  const raw = String(marker || '').slice(LABEL_PREFIX.length);
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function labelsOf(game) {
  const tags = Array.isArray(game?.tags) ? game.tags : [];
  const fromMarkers = tags
    .filter(tag => String(tag || '').toLowerCase().startsWith(LABEL_PREFIX))
    .map(decodeLabel);
  const explicit = Array.isArray(game?.labels) ? game.labels : [];
  return [...new Set([...explicit, ...fromMarkers].map(v => String(v || '').trim()).filter(Boolean))];
}

async function loadDefinitions() {
  const url = databaseUrl();
  if (!url) return [];
  const sql = neon(url);
  try {
    const rows = await sql`
      SELECT id, title, excerpt, metadata, updated_at
      FROM core.contents
      WHERE content_type = 'ways_label'
        AND source = 'ways-label-editor'
        AND status = 'active'
      ORDER BY updated_at DESC
    `;
    return rows.map(row => ({
      id: String(row?.id || ''),
      key: String(row?.metadata?.key || row?.title || '').trim(),
      name: String(row?.title || '').trim(),
      description: String(row?.excerpt || '').trim()
    })).filter(row => row.key && row.name);
  } catch (error) {
    console.warn('[ways-labels] definitions unavailable', error?.message || error);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const key = process.env.WAYS_EDITOR_ADMIN_KEY;
    if (!key) throw new Error('WAYS_EDITOR_ADMIN_KEY_missing');

    const [response, definitions] = await Promise.all([
      fetch(`${EDITOR_URL}/api/proxy?target=state`, {
        method: 'GET',
        cache: 'no-store',
        headers: { accept: 'application/json', 'x-showcase-admin-key': key }
      }),
      loadDefinitions()
    ]);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`editor_state_${response.status}`);

    const definitionByKey = new Map(definitions.map(item => [item.key, item]));
    const games = Array.isArray(data?.state?.games) ? data.state.games : [];
    const rawAssignments = {};
    const counts = new Map();
    const order = [];

    for (const game of games) {
      if (game?.status !== 'published' || !(game?.video || game?.video_url)) continue;
      const rawLabels = labelsOf(game);
      if (!rawLabels.length) continue;
      const id = String(game?.id || '').trim();
      if (id) rawAssignments[id] = rawLabels;
      for (const label of rawLabels) {
        if (!counts.has(label)) order.push(label);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }

    const labels = order.map(rawKey => {
      const definition = definitionByKey.get(rawKey);
      return {
        key: rawKey,
        name: definition?.name || rawKey,
        description: definition?.description || '',
        count: counts.get(rawKey) || 0,
        managed: Boolean(definition)
      };
    });
    const displayByKey = new Map(labels.map(item => [item.key, item.name]));
    const assignments = Object.fromEntries(Object.entries(rawAssignments).map(([id, rawLabels]) => [
      id,
      rawLabels.map(rawKey => displayByKey.get(rawKey) || rawKey)
    ]));

    return res.status(200).json({ ok: true, labels, assignments, count: labels.length });
  } catch (error) {
    console.error('[ways-labels]', error);
    return res.status(503).json({ ok: false, error: 'labels_unavailable' });
  }
}
