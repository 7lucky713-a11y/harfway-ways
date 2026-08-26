import staticGamesHandler from './games.js';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

function fallbackPayload() {
  let statusCode = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };

  staticGamesHandler({ method: 'GET' }, res);
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) {
    throw new Error('static_games_fallback_failed');
  }
  return payload;
}

function normalizeGame(game, index) {
  const sortRaw = game?.sortOrder ?? game?.sort_order;
  const sortOrder = Number.isFinite(Number(sortRaw)) ? Number(sortRaw) : index;
  const width = Number(game?.videoWidth ?? game?.video_width ?? 0) || 0;
  const height = Number(game?.videoHeight ?? game?.video_height ?? 0) || 0;
  const duration = Number(game?.videoDuration ?? game?.video_duration ?? 0) || 0;
  const thumbnailUrl = game?.thumbnailUrl || game?.thumbnail || game?.thumbnail_url || '';
  const fastStartRaw = game?.fastStart ?? game?.fast_start;

  return {
    id: String(game?.id || `game-${index}`),
    title: String(game?.title || ''),
    description: String(game?.description || ''),
    video: String(game?.video || game?.video_url || ''),
    tags: Array.isArray(game?.tags) ? game.tags.map(v => String(v || '').trim()).filter(Boolean) : [],
    articleUrl: String(game?.articleUrl || game?.article_url || ''),
    storeUrl: String(game?.storeUrl || game?.store_url || ''),
    category: game?.category === '通常' ? '' : String(game?.category || ''),
    thumbnailUrl: String(thumbnailUrl),
    fastStart: fastStartRaw == null ? false : Boolean(fastStartRaw),
    videoWidth: width,
    videoHeight: height,
    videoDuration: duration,
    videoOrientation: String(game?.videoOrientation || game?.video_orientation || ''),
    videoLayoutMode: String(game?.videoLayoutMode || game?.video_layout_mode || 'auto'),
    status: game?.status === 'published' ? 'published' : 'draft',
    sponsored: Boolean(game?.sponsored),
    sponsorName: String(game?.sponsorName || game?.sponsor_name || ''),
    sortOrder
  };
}

async function fetchEditorGames() {
  const key = process.env.WAYS_EDITOR_ADMIN_KEY;
  if (!key) throw new Error('WAYS_EDITOR_ADMIN_KEY_missing');

  const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'x-showcase-admin-key': key
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`editor_state_${response.status}`);

  const games = Array.isArray(data?.state?.games) ? data.state.games : [];
  const entries = games
    .map(normalizeGame)
    .filter(game => game.status === 'published' && game.video)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!entries.length) throw new Error('editor_state_has_no_published_games');
  return entries;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const entries = await fetchEditorGames();
    return res.status(200).json({
      ok: true,
      source: 'playback-editor-live',
      entries,
      count: entries.length
    });
  } catch (error) {
    console.warn('[ways-games-live] editor unavailable; using Git fallback:', error?.message || error);
    try {
      const fallback = fallbackPayload();
      return res.status(200).json({
        ...fallback,
        source: 'playback-editor-fallback',
        stale: true
      });
    } catch (fallbackError) {
      console.error('[ways-games-live] fallback failed:', fallbackError?.message || fallbackError);
      return res.status(503).json({ ok: false, error: 'games_unavailable' });
    }
  }
}
