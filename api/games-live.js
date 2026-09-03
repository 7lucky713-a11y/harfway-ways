import staticGamesHandler from './games.js';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const CORE_API_URL = process.env.HARFWAY_CORE_API_URL || 'https://harfway-playback.vercel.app/api/core/games';

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
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) throw new Error('static_games_fallback_failed');
  return payload;
}

function shuffleEntries(entries) {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
    method: 'GET', cache: 'no-store', headers: { accept: 'application/json', 'x-showcase-admin-key': key }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`editor_state_${response.status}`);
  const games = Array.isArray(data?.state?.games) ? data.state.games : [];
  const entries = games.map(normalizeGame).filter(game => game.status === 'published' && game.video).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!entries.length) throw new Error('editor_state_has_no_published_games');
  return entries;
}

function preferText(coreValue, waysValue) {
  const value = String(coreValue || '').trim();
  return value || waysValue;
}

function steamId(value) {
  const match = String(value || '').match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match ? match[1] : '';
}
function coreSteam(game) {
  const ref = (game?.refs || []).find(r => r?.service === 'steam' && /^\d+$/.test(String(r?.externalId || '')));
  return ref ? String(ref.externalId) : steamId(game?.storeUrl);
}
function normalizedTitle(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ');
}
function normalizedStore(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return ''; }
}
function uniqueMap(items, keyFn) {
  const buckets = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const bucket = buckets.get(key) || [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  const out = new Map();
  for (const [key, bucket] of buckets) if (bucket.length === 1) out.set(key, bucket[0]);
  return out;
}

async function mergeCoreMetadata(entries) {
  try {
    const response = await fetch(`${CORE_API_URL}?limit=500`, { method: 'GET', cache: 'no-store', headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !Array.isArray(data.games)) throw new Error(`core_api_${response.status}`);

    const games = data.games;
    const byId = new Map(games.map(game => [String(game?.id || ''), game]));
    const bySteam = uniqueMap(games, coreSteam);
    const byStore = uniqueMap(games, game => normalizedStore(game?.storeUrl));
    const byTitle = uniqueMap(games, game => normalizedTitle(game?.title));
    let matched = 0;
    const methods = { id: 0, steam: 0, store: 0, title: 0 };

    const merged = entries.map(entry => {
      let core = byId.get(entry.id), method = core ? 'id' : '';
      if (!core) { const sid = steamId(entry.storeUrl); if (sid) { core = bySteam.get(sid); if (core) method = 'steam'; } }
      if (!core) { const store = normalizedStore(entry.storeUrl); if (store) { core = byStore.get(store); if (core) method = 'store'; } }
      if (!core) { const title = normalizedTitle(entry.title); if (title) { core = byTitle.get(title); if (core) method = 'title'; } }
      if (!core) return { ...entry, coreLinked: false };
      matched += 1;
      methods[method] += 1;
      return {
        ...entry,
        coreId: String(core.id || ''),
        coreLinked: true,
        coreMatch: method,
        title: preferText(core.title, entry.title),
        description: preferText(core.description, entry.description),
        storeUrl: preferText(core.storeUrl, entry.storeUrl),
        articleUrl: preferText(core.articleUrl, entry.articleUrl),
        category: preferText(core.category, entry.category),
        tags: Array.isArray(core.tags) && core.tags.length ? core.tags : entry.tags
      };
    });

    return { entries: merged, core: { ok: true, matched, total: entries.length, version: String(data.version || ''), methods } };
  } catch (error) {
    console.warn('[ways-games-live] core unavailable; keeping editor metadata:', error?.message || error);
    return { entries, core: { ok: false, matched: 0, total: entries.length, fallback: true } };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const editorEntries = await fetchEditorGames();
    const { entries, core } = await mergeCoreMetadata(editorEntries);
    const shuffledEntries = shuffleEntries(entries);
    return res.status(200).json({ ok: true, source: core.ok ? 'playback-editor-live+shared-content-core' : 'playback-editor-live', core, entries: shuffledEntries, count: shuffledEntries.length });
  } catch (error) {
    console.warn('[ways-games-live] editor unavailable; using Git fallback:', error?.message || error);
    try {
      const fallback = fallbackPayload();
      return res.status(200).json({ ...fallback, entries: shuffleEntries(fallback.entries), source: 'playback-editor-fallback', stale: true, core: { ok: false, skipped: true } });
    } catch (fallbackError) {
      console.error('[ways-games-live] fallback failed:', fallbackError?.message || fallbackError);
      return res.status(503).json({ ok: false, error: 'games_unavailable' });
    }
  }
}
