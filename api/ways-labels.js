const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const LABEL_PREFIX = '__ways_label:';

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const key = process.env.WAYS_EDITOR_ADMIN_KEY;
    if (!key) throw new Error('WAYS_EDITOR_ADMIN_KEY_missing');
    const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json', 'x-showcase-admin-key': key }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`editor_state_${response.status}`);

    const games = Array.isArray(data?.state?.games) ? data.state.games : [];
    const assignments = {};
    const counts = new Map();
    const order = [];

    for (const game of games) {
      if (game?.status !== 'published' || !(game?.video || game?.video_url)) continue;
      const labels = labelsOf(game);
      if (!labels.length) continue;
      const id = String(game?.id || '').trim();
      if (id) assignments[id] = labels;
      for (const label of labels) {
        if (!counts.has(label)) order.push(label);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }

    const labels = order.map(name => ({ name, count: counts.get(name) || 0 }));
    return res.status(200).json({ ok: true, labels, assignments, count: labels.length });
  } catch (error) {
    console.error('[ways-labels]', error);
    return res.status(503).json({ ok: false, error: 'labels_unavailable' });
  }
}
