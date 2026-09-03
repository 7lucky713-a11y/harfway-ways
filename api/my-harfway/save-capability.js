import { createHash } from 'node:crypto';
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
const SAVE_CONTEXTS = new Set(['ways', 'scraps', 'sale']);

function cleanSource(value) {
  const source = String(value || '').trim().toLowerCase();
  return ALLOWED_SOURCES.has(source) ? source : '';
}

function cleanContextSource(value, fallback = '') {
  const source = String(value || fallback || '').trim().toLowerCase();
  return SAVE_CONTEXTS.has(source) ? source : '';
}

function cleanSteam(value) {
  const raw = String(value || '').trim();
  return /^\d{1,12}$/.test(raw) ? raw : '';
}

function cleanGameId(value) {
  return String(value || '').trim().slice(0, 220);
}

function cleanSourceItemId(value) {
  return String(value || '').trim().slice(0, 220);
}

function cleanTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 300);
}

function cleanStoreUrl(value) {
  const raw = String(value || '').trim().slice(0, 1400);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString().slice(0, 1400);
  } catch {
    return '';
  }
}

function normalizedStore(value) {
  const raw = cleanStoreUrl(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '';
  }
}

function normalizedTitle(value) {
  return cleanTitle(value).normalize('NFKC').toLocaleLowerCase('ja-JP');
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

async function fetchCoreCatalog() {
  const response = await fetch(`${CORE}?limit=500`, {
    headers: { accept: 'application/json', 'user-agent': 'HARF-WAY-UniversalSave/1.0' },
    cache: 'no-store'
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.ok && Array.isArray(data.games) ? data.games : [];
}

function findCanonical(games, { gameId, steamAppid, storeUrl, title }) {
  const requestedId = cleanGameId(gameId);
  if (requestedId && !requestedId.startsWith('pending-')) {
    const exact = games.find((game) => String(game?.id || '') === requestedId);
    if (exact) return exact;
  }

  const requestedSteam = cleanSteam(steamAppid);
  if (requestedSteam) {
    const exact = games.find((game) => steamFromGame(game) === requestedSteam);
    if (exact) return exact;
  }

  const requestedStore = normalizedStore(storeUrl);
  if (requestedStore) {
    const hits = games.filter((game) => {
      if (normalizedStore(game?.storeUrl) === requestedStore) return true;
      return (game?.refs || []).some((ref) => normalizedStore(ref?.externalUrl) === requestedStore);
    });
    if (hits.length === 1) return hits[0];
  }

  const requestedTitle = normalizedTitle(title);
  if (requestedTitle) {
    const hits = games.filter((game) => normalizedTitle(game?.title) === requestedTitle);
    if (hits.length === 1) return hits[0];
  }

  return null;
}

function provisionalId({ contextSource, sourceItemId, storeUrl, title }) {
  const seed = [
    cleanContextSource(contextSource),
    cleanSourceItemId(sourceItemId),
    normalizedStore(storeUrl),
    normalizedTitle(title)
  ].join('\n');
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 24);
  return `pending-${cleanContextSource(contextSource) || 'harfway'}-${digest}`;
}

async function resolveIdentity(input, contextSource) {
  const requested = {
    gameId: cleanGameId(input.gameId),
    steamAppid: cleanSteam(input.steamAppid),
    sourceItemId: cleanSourceItemId(input.sourceItemId),
    title: cleanTitle(input.title),
    storeUrl: cleanStoreUrl(input.storeUrl)
  };

  const games = await fetchCoreCatalog();
  const canonical = findCanonical(games, requested);
  if (canonical) {
    const canonicalSteam = steamFromGame(canonical);
    if (requested.steamAppid && canonicalSteam && requested.steamAppid !== canonicalSteam) {
      return { ok: false, status: 409, error: 'game_identity_conflict' };
    }
    return {
      ok: true,
      game: {
        id: String(canonical.id || ''),
        title: cleanTitle(canonical.title) || requested.title,
        steamAppid: canonicalSteam || requested.steamAppid || '',
        storeUrl: cleanStoreUrl(canonical.storeUrl) || requested.storeUrl,
        sourceItemId: requested.sourceItemId,
        canonicalized: true,
        identityStatus: 'canonical'
      }
    };
  }

  if (!requested.sourceItemId || !requested.title) {
    return { ok: false, status: 404, error: 'game_identity_unresolved' };
  }

  return {
    ok: true,
    game: {
      id: provisionalId({ contextSource, ...requested }),
      title: requested.title,
      steamAppid: requested.steamAppid,
      storeUrl: requested.storeUrl,
      sourceItemId: requested.sourceItemId,
      canonicalized: false,
      identityStatus: 'provisional'
    }
  };
}

async function saveIdentity(sql, workspaceId, game, contextSource, capabilitySource) {
  const gameId = String(game.id || '').trim();
  const steamAppid = cleanSteam(game.steamAppid) || null;
  const sourceContext = {
    source: contextSource,
    capabilitySource,
    bridge: 'save-capability-v2',
    canonicalized: Boolean(game.canonicalized),
    identityStatus: String(game.identityStatus || (game.canonicalized ? 'canonical' : 'provisional')),
    sourceItemId: cleanSourceItemId(game.sourceItemId),
    title: cleanTitle(game.title),
    storeUrl: cleanStoreUrl(game.storeUrl)
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

  const contextSource = cleanContextSource(body.contextSource, capability.source);
  if (!contextSource) return res.status(400).json({ ok: false, error: 'save_context_invalid' });

  const resolved = await resolveIdentity(body, contextSource);
  if (!resolved.ok) return res.status(resolved.status).json({ ok: false, error: resolved.error });

  const saved = await saveIdentity(sql, capability.workspace_id, resolved.game, contextSource, capability.source);
  await sql`
    UPDATE reader.save_capabilities
    SET last_used_at = now(), use_count = use_count + 1
    WHERE id = ${capability.id}
  `;

  return res.status(200).json({ ok: true, ...saved, contextSource, game: resolved.game });
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
        mode: process.env.VERCEL_ENV === 'production' ? 'production' : 'preview',
        schema: { saveCapabilities: Boolean(schema.save_capabilities) },
        contexts: [...SAVE_CONTEXTS],
        identity: 'core-or-provisional-v2'
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
