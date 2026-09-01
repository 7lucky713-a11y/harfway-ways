import { neon } from '@neondatabase/serverless';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const PRODUCTION_BASE = 'https://harfway-playback.vercel.app';

function text(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function environment() {
  return String(process.env.VERCEL_ENV || 'development');
}

function databaseUrl() {
  return (
    process.env.WAYS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

function steamAppId(value = '') {
  const match = text(value, 4000).match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match ? match[1] : '';
}

function normalizeWay(game = {}, index = 0) {
  const storeUrl = text(game.storeUrl || game.store_url, 4000);
  return {
    id: text(game.id || `game-${index}`, 500),
    title: text(game.title, 1000),
    description: text(game.description, 4000),
    category: text(game.category, 1000),
    storeUrl,
    steamAppId: steamAppId(storeUrl),
    videoUrl: text(game.video || game.video_url, 4000),
    status: text(game.status, 100)
  };
}

async function fetchWays() {
  const key = text(process.env.WAYS_EDITOR_ADMIN_KEY, 1000);
  if (!key) throw new Error('WAYS_EDITOR_ADMIN_KEY_missing');

  const response = await fetch(`${EDITOR_URL}/api/proxy?target=${encodeURIComponent('state')}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'x-showcase-admin-key': key
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `editor_state_${response.status}`);

  return array(data?.state?.games)
    .map(normalizeWay)
    .filter((game) => game.status === 'published' && game.videoUrl && game.steamAppId);
}

function buildIndexes(coreGames) {
  const byWays = new Map();
  const bySteam = new Map();
  const steamConflicts = new Set();

  for (const game of coreGames) {
    const gameId = text(game?.id, 500);
    if (!gameId) continue;

    for (const ref of array(game?.refs)) {
      const service = text(ref?.service, 100).toLowerCase();
      const externalId = text(ref?.externalId || ref?.external_id, 500);
      if (service === 'ways' && externalId) byWays.set(externalId, game);
    }

    const ids = new Set();
    const fromStore = steamAppId(game?.storeUrl || game?.store_url || '');
    if (fromStore) ids.add(fromStore);
    for (const ref of array(game?.refs)) {
      if (text(ref?.service, 100).toLowerCase() === 'steam') {
        const externalId = text(ref?.externalId || ref?.external_id, 100);
        if (externalId) ids.add(externalId);
        const fromUrl = steamAppId(ref?.externalUrl || ref?.external_url || '');
        if (fromUrl) ids.add(fromUrl);
      }
    }

    for (const id of ids) {
      if (bySteam.has(id) && bySteam.get(id)?.id !== gameId) steamConflicts.add(id);
      else bySteam.set(id, game);
    }
  }

  for (const id of steamConflicts) bySteam.delete(id);
  return { byWays, bySteam, steamConflicts };
}

async function previewCoreGames() {
  const key = text(process.env.WAYS_EDITOR_ADMIN_KEY, 1000);
  if (!key) throw new Error('WAYS_EDITOR_ADMIN_KEY_missing');
  const response = await fetch(`${PRODUCTION_BASE}/api/db-master-core-link`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'x-showcase-admin-key': key
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `production_core_link_${response.status}`);
  return array(data.coreGames);
}

async function productionCoreGames(sql) {
  const rows = await sql`
    SELECT
      g.id, g.title, g.store_url, g.status,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'service', r.service,
          'externalId', r.external_id,
          'externalUrl', r.external_url,
          'metadata', r.metadata
        ) ORDER BY r.service, r.external_id)
        FROM core.game_refs r
        WHERE r.game_id = g.id
      ), '[]'::jsonb) AS refs
    FROM core.games g
    WHERE g.status = 'active'
    ORDER BY g.updated_at DESC, g.title ASC
    LIMIT 2000
  `;

  return rows.map((row) => ({
    id: text(row.id, 500),
    title: text(row.title, 1000),
    storeUrl: text(row.store_url, 4000),
    status: text(row.status, 100),
    refs: array(row.refs)
  }));
}

function planActions(ways, coreGames) {
  const indexes = buildIndexes(coreGames);
  const items = ways.map((way) => {
    const linked = indexes.byWays.get(way.id) || null;
    if (linked) {
      return {
        wayId: way.id,
        title: way.title,
        steamAppId: way.steamAppId,
        action: 'already-linked',
        coreGameId: text(linked.id, 500),
        coreTitle: text(linked.title, 1000)
      };
    }

    if (indexes.steamConflicts.has(way.steamAppId)) {
      return {
        wayId: way.id,
        title: way.title,
        steamAppId: way.steamAppId,
        action: 'conflict',
        coreGameId: '',
        coreTitle: ''
      };
    }

    const steamMatch = indexes.bySteam.get(way.steamAppId) || null;
    if (steamMatch) {
      return {
        wayId: way.id,
        title: way.title,
        steamAppId: way.steamAppId,
        action: 'link-existing',
        coreGameId: text(steamMatch.id, 500),
        coreTitle: text(steamMatch.title, 1000)
      };
    }

    return {
      wayId: way.id,
      title: way.title,
      steamAppId: way.steamAppId,
      action: 'create-and-link',
      coreGameId: `game-ways-steam-${way.steamAppId}`,
      coreTitle: way.title
    };
  });

  const summary = items.reduce((out, item) => {
    out.total += 1;
    out[item.action] = (out[item.action] || 0) + 1;
    return out;
  }, { total: 0, 'already-linked': 0, 'link-existing': 0, 'create-and-link': 0, conflict: 0 });

  return { items, summary };
}

function ensureProductionCron(req) {
  if (environment() !== 'production') return;
  const secret = text(process.env.CRON_SECRET, 2000);
  if (!secret) {
    const error = new Error('cron_secret_not_configured');
    error.status = 503;
    throw error;
  }
  if (text(req.headers.authorization, 3000) !== `Bearer ${secret}`) {
    const error = new Error('unauthorized_cron');
    error.status = 401;
    throw error;
  }
}

async function upsertWaysRef(sql, way, coreGameId, linkMethod) {
  const externalUrl = `${PRODUCTION_BASE}/?game=${encodeURIComponent(way.id)}`;
  const metadata = {
    source: 'ways-auto-sync',
    title: way.title,
    video_url: way.videoUrl,
    store_url: way.storeUrl,
    linked_at: new Date().toISOString(),
    link_method: linkMethod
  };
  await sql`
    INSERT INTO core.game_refs (service, external_id, game_id, external_url, metadata, updated_at)
    VALUES ('ways', ${way.id}, ${coreGameId}, ${externalUrl}, ${JSON.stringify(metadata)}::jsonb, now())
    ON CONFLICT (service, external_id) DO NOTHING
  `;
}

async function upsertSteamRef(sql, way, coreGameId) {
  const metadata = {
    source: 'ways-auto-sync',
    label: 'Steam',
    name: way.title,
    primary: true
  };
  await sql`
    INSERT INTO core.game_refs (service, external_id, game_id, external_url, metadata, updated_at)
    VALUES ('steam', ${way.steamAppId}, ${coreGameId}, ${way.storeUrl}, ${JSON.stringify(metadata)}::jsonb, now())
    ON CONFLICT (service, external_id) DO NOTHING
  `;
}

async function createCoreGame(sql, way, coreGameId) {
  const existing = await sql`SELECT id FROM core.games WHERE id = ${coreGameId} LIMIT 1`;
  if (!existing[0]) {
    await sql`
      INSERT INTO core.games (
        id, title, description, store_url, article_url, category, status, source_of_truth, updated_at
      ) VALUES (
        ${coreGameId}, ${way.title}, ${way.description}, ${way.storeUrl}, '', ${way.category}, 'active', 'ways-editor', now()
      )
    `;
  }
  await upsertSteamRef(sql, way, coreGameId);
  await upsertWaysRef(sql, way, coreGameId, 'steam-app-id-auto-create');
}

async function applyProduction(sql, ways, plan) {
  const byWay = new Map(ways.map((way) => [way.id, way]));
  const results = [];
  const errors = [];

  for (const item of plan.items) {
    const way = byWay.get(item.wayId);
    if (!way) continue;
    try {
      if (item.action === 'already-linked' || item.action === 'conflict') {
        results.push(item);
        continue;
      }
      if (item.action === 'link-existing') {
        await upsertSteamRef(sql, way, item.coreGameId);
        await upsertWaysRef(sql, way, item.coreGameId, 'steam-app-id-auto-link');
        results.push({ ...item, applied: true });
        continue;
      }
      if (item.action === 'create-and-link') {
        await createCoreGame(sql, way, item.coreGameId);
        results.push({ ...item, applied: true });
      }
    } catch (error) {
      errors.push({
        wayId: item.wayId,
        title: item.title,
        action: item.action,
        error: text(error?.message || error, 1000)
      });
    }
  }

  return { results, errors };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    ensureProductionCron(req);
    const ways = await fetchWays();

    if (environment() !== 'production') {
      const coreGames = await previewCoreGames();
      const plan = planActions(ways, coreGames);
      return res.status(200).json({
        ok: true,
        environment: environment(),
        mode: 'preview-dry-run',
        productionMutationEnabled: false,
        summary: plan.summary,
        pending: plan.items.filter((item) => item.action !== 'already-linked'),
        examples: plan.items.slice(0, 20)
      });
    }

    const url = databaseUrl();
    if (!url) return res.status(503).json({ ok: false, error: 'core_database_not_configured' });
    const sql = neon(url);
    const coreGames = await productionCoreGames(sql);
    const plan = planActions(ways, coreGames);
    const applied = await applyProduction(sql, ways, plan);

    if (applied.errors.length) {
      console.error('[ways-core-sync] partial failure', applied.errors);
      return res.status(500).json({
        ok: false,
        environment: 'production',
        mode: 'production-cron',
        summary: plan.summary,
        applied: applied.results.filter((item) => item.applied).length,
        errors: applied.errors
      });
    }

    return res.status(200).json({
      ok: true,
      environment: 'production',
      mode: 'production-cron',
      summary: plan.summary,
      applied: applied.results.filter((item) => item.applied).length,
      conflicts: applied.results.filter((item) => item.action === 'conflict')
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[ways-core-sync]', error?.message || error);
    return res.status(status).json({ ok: false, error: text(error?.message || error, 1000) || 'ways_core_sync_failed' });
  }
}
