import {
  authenticateDevice,
  bearer,
  cors,
  ensureReaderSchema,
  getSql,
  hashSecret,
  parseBody,
  randomSecret,
  readerSchemaStatus,
  sendError
} from '../../lib/my-harfway-db.js';

const CORE = 'https://harfway-playback.vercel.app/api/core/games';
const CAPABILITY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ALLOWED_SOURCES = new Set(['ways']);

function cleanSource(value) {
  const source = String(value || '').trim().toLowerCase();
  return ALLOWED_SOURCES.has(source) ? source : '';
}

function cleanSteam(value) {
  const raw = String(value || '').trim();
  return /^\d{1,12}$/.test(raw) ? raw : '';
}

function cleanGameId(value) {
  return String(value || '').trim().slice(0, 220);
}

function sourceOriginAllowed(source, origin) {
  if (source !== 'ways') return false;
  let url;
  try { url = new URL(String(origin || '')); } catch { return false; }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return false;

  if (process.env.VERCEL_ENV === 'production') {
    return url.origin === 'https://harfway-playback.vercel.app';
  }

  if (
    process.env.VERCEL_ENV === 'preview' &&
    String(process.env.VERCEL_GIT_COMMIT_REF || '') === 'preview/my-harfway-sync-20260902'
  ) {
    return url.hostname.startsWith('harfway-playback-') && url.hostname.endsWith('-harf-way.vercel.app');
  }

  return false;
}

function requestOrigin(req) {
  const direct = String(req.headers?.origin || '').trim();
  if (direct) return direct;
  const referer = String(req.headers?.referer || '').trim();
  if (!referer) return '';
  try { return new URL(referer).origin; } catch { return ''; }
}

function steamFromGame(game) {
  const ref = (game?.refs || []).find((item) => item?.service === 'steam' && /^\d+$/.test(String(item.externalId || '')));
  if (ref) return String(ref.externalId);
  const match = String(game?.storeUrl || '').match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match ? match[1] : '';
}

async function fetchCoreById(gameId) {
  if (!gameId) return null;
  const response = await fetch(`${CORE}?id=${encodeURIComponent(gameId)}`, {
    headers: { accept: 'application/json', 'user-agent': 'HARF-WAY-SaveCapability/1.0' },
    cache: 'no-store'
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.ok && Array.isArray(data.games) ? data.games[0] || null : null;
}

async function fetchCoreBySteam(steamAppid) {
  if (!steamAppid) return null;
  const response = await fetch(`${CORE}?q=${encodeURIComponent(steamAppid)}&limit=20`, {
    headers: { accept: 'application/json', 'user-agent': 'HARF-WAY-SaveCapability/1.0' },
    cache: 'no-store'
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data?.ok || !Array.isArray(data.games)) return null;
  return data.games.find((game) => steamFromGame(game) === steamAppid) || null;
}

async function resolveCoreIdentity({ gameId, steamAppid }) {
  const requestedId = cleanGameId(gameId);
  const requestedSteam = cleanSteam(steamAppid);
  if (!requestedId && !requestedSteam) return { ok: false, status: 400, error: 'game_identity_required' };

  let game = requestedId ? await fetchCoreById(requestedId) : null;
  if (!game && requestedSteam) game = await fetchCoreBySteam(requestedSteam);
  if (!game) return { ok: false, status: 404, error: 'core_game_not_found' };

  const canonicalSteam = steamFromGame(game);
  if (requestedSteam && canonicalSteam && requestedSteam !== canonicalSteam) {
    return { ok: false, status: 409, error: 'game_identity_conflict' };
  }
  if (requestedId && requestedId !== String(game.id) && !requestedSteam) {
    return { ok: false, status: 409, error: 'game_identity_conflict' };
  }

  return {
    ok: true,
    game: {
      id: String(game.id || ''),
      title: String(game.title || ''),
      steamAppid: canonicalSteam || requestedSteam || '',
      storeUrl: String(game.storeUrl || '')
    }
  };
}

async function saveCanonical(sql, workspaceId, game, source) {
  const gameId = String(game.id || '').trim();
  const steamAppid = cleanSteam(game.steamAppid) || null;
  const sourceContext = {
    source,
    bridge: 'save-capability',
    canonicalized: true
  };

  if (steamAppid) {
    const duplicate = await sql`
      SELECT game_id FROM reader.saved_games
      WHERE workspace_id = ${workspaceId}
        AND steam_appid = ${steamAppid}
      LIMIT 1
    `;
    if (duplicate?.[0] && duplicate[0].game_id !== gameId) {
      await sql`
        UPDATE reader.saved_games
        SET source_context = source_context || ${JSON.stringify(sourceContext)}::jsonb,
            updated_at = now()
        WHERE workspace_id = ${workspaceId}
          AND game_id = ${duplicate[0].game_id}
      `;
      return { saved: true, deduped: true, gameId: duplicate[0].game_id };
    }
  }

  await sql`
    INSERT INTO reader.saved_games (workspace_id, game_id, steam_appid, source_context)
    VALUES (${workspaceId}, ${gameId}, ${steamAppid}, ${JSON.stringify(sourceContext)}::jsonb)
    ON CONFLICT (workspace_id, game_id) DO UPDATE SET
      steam_appid = COALESCE(reader.saved_games.steam_appid, EXCLUDED.steam_appid),
      source_context = reader.saved_games.source_context || EXCLUDED.source_context,
      updated_at = now()
  `;
  return { saved: true, deduped: false, gameId };
}

async function issueCapability(sql, req, res, body) {
  const source = cleanSource(body.source);
  const sourceOrigin = String(body.sourceOrigin || '').trim();
  if (!source) return res.status(400).json({ ok: false, error: 'capability_source_invalid' });
  if (!sourceOriginAllowed(source, sourceOrigin)) {
    return res.status(400).json({ ok: false, error: 'capability_origin_invalid' });
  }

  const device = await authenticateDevice(sql, bearer(req));
  if (!device) return res.status(401).json({ ok: false, error: 'invalid_device_token' });

  const id = randomSecret('cap_', 14);
  const token = randomSecret('hwsc_', 32);
  const expiresAt = new Date(Date.now() + CAPABILITY_TTL_MS).toISOString();

  await sql`
    INSERT INTO reader.save_capabilities (
      id, workspace_id, token_hash, source, source_origin, created_by_device_id, expires_at
    ) VALUES (
      ${id}, ${device.workspace_id}, ${hashSecret(token)}, ${source}, ${sourceOrigin}, ${device.id}, ${expiresAt}
    )
  `;

  return res.status(201).json({
    ok: true,
    capabilityToken: token,
    source,
    sourceOrigin,
    expiresAt
  });
}

async function useCapability(sql, req, res, body) {
  const rawToken = bearer(req);
  if (!rawToken) return res.status(401).json({ ok: false, error: 'save_capability_required' });

  const rows = await sql`
    SELECT id, workspace_id, source, source_origin, expires_at
    FROM reader.save_capabilities
    WHERE token_hash = ${hashSecret(rawToken)}
      AND revoked_at IS NULL
    LIMIT 1
  `;
  const capability = rows?.[0] || null;
  if (!capability) return res.status(401).json({ ok: false, error: 'save_capability_invalid' });

  const expires = new Date(capability.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return res.status(410).json({ ok: false, error: 'save_capability_expired' });
  }

  const origin = requestOrigin(req);
  if (!origin || origin !== String(capability.source_origin)) {
    return res.status(403).json({ ok: false, error: 'save_capability_origin_mismatch' });
  }

  const resolved = await resolveCoreIdentity({ gameId: body.gameId, steamAppid: body.steamAppid });
  if (!resolved.ok) return res.status(resolved.status).json({ ok: false, error: resolved.error });

  const saved = await saveCanonical(sql, capability.workspace_id, resolved.game, capability.source);
  await sql`
    UPDATE reader.save_capabilities
    SET last_used_at = now(), use_count = use_count + 1
    WHERE id = ${capability.id}
  `;

  return res.status(200).json({ ok: true, ...saved, game: resolved.game });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const sql = getSql();
    await ensureReaderSchema(sql);

    if (req.method === 'GET') {
      const schema = await readerSchemaStatus(sql);
      return res.status(200).json({
        ok: true,
        mode: process.env.VERCEL_ENV === 'production' ? 'production' : 'isolated-preview',
        schema: { saveCapabilities: Boolean(schema.save_capabilities) }
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const body = parseBody(req);
    const action = String(body.action || '').trim();
    if (action === 'issue') return issueCapability(sql, req, res, body);
    if (action === 'save') return useCapability(sql, req, res, body);
    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (error) {
    return sendError(res, error);
  }
}
