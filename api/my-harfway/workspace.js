import {
  authenticateDevice,
  bearer,
  cors,
  ensureReaderSchema,
  getSql,
  hashSecret,
  parseBody,
  randomSecret,
  sendError
} from '../../lib/my-harfway-db.js';

function cleanLabel(value, fallback = 'Device') {
  const text = String(value || '').trim().slice(0, 80);
  return text || fallback;
}

function cleanSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(out).length >= 12) break;
    const safeKey = String(key).slice(0, 48);
    if (!safeKey) continue;
    if (['string', 'number', 'boolean'].includes(typeof raw) || raw === null) out[safeKey] = raw;
  }
  return out;
}

async function createWorkspace(sql, label) {
  const workspaceId = randomSecret('ws_', 18);
  const deviceId = randomSecret('dev_', 14);
  const deviceToken = randomSecret('hwd_', 32);
  const recoveryCode = randomSecret('HW-REC-', 20);
  await sql`
    INSERT INTO reader.workspaces (id, recovery_hash)
    VALUES (${workspaceId}, ${hashSecret(recoveryCode)})
  `;
  await sql`
    INSERT INTO reader.devices (id, workspace_id, token_hash, label)
    VALUES (${deviceId}, ${workspaceId}, ${hashSecret(deviceToken)}, ${cleanLabel(label)})
  `;
  return { workspaceId, deviceId, deviceToken, recoveryCode };
}

async function listWorkspace(sql, device) {
  const games = await sql`
    SELECT game_id, steam_appid, source_context, saved_at, updated_at
    FROM reader.saved_games
    WHERE workspace_id = ${device.workspace_id}
    ORDER BY saved_at DESC, game_id ASC
  `;
  const devices = await sql`
    SELECT id, label, created_at, last_seen_at
    FROM reader.devices
    WHERE workspace_id = ${device.workspace_id}
      AND revoked_at IS NULL
    ORDER BY created_at ASC
  `;
  return {
    workspaceId: device.workspace_id,
    device: { id: device.id, label: device.label },
    games,
    devices
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const sql = getSql();
    await ensureReaderSchema(sql);

    if (req.method === 'GET') {
      const device = await authenticateDevice(sql, bearer(req));
      if (!device) return res.status(401).json({ ok: false, error: 'invalid_device_token' });
      return res.status(200).json({ ok: true, ...(await listWorkspace(sql, device)) });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const body = parseBody(req);
    const action = String(body.action || 'create').trim();

    if (action === 'create') {
      const created = await createWorkspace(sql, body.label || 'Browser');
      return res.status(201).json({ ok: true, ...created });
    }

    if (action === 'recover') {
      const recoveryCode = String(body.recoveryCode || '').trim();
      if (!recoveryCode) return res.status(400).json({ ok: false, error: 'recovery_code_required' });
      const rows = await sql`
        SELECT id FROM reader.workspaces
        WHERE recovery_hash = ${hashSecret(recoveryCode)}
        LIMIT 1
      `;
      const workspace = rows?.[0];
      if (!workspace) return res.status(404).json({ ok: false, error: 'recovery_not_found' });
      const deviceId = randomSecret('dev_', 14);
      const deviceToken = randomSecret('hwd_', 32);
      await sql`
        INSERT INTO reader.devices (id, workspace_id, token_hash, label)
        VALUES (${deviceId}, ${workspace.id}, ${hashSecret(deviceToken)}, ${cleanLabel(body.label, 'Recovered Device')})
      `;
      return res.status(201).json({ ok: true, workspaceId: workspace.id, deviceId, deviceToken });
    }

    const device = await authenticateDevice(sql, bearer(req));
    if (!device) return res.status(401).json({ ok: false, error: 'invalid_device_token' });

    if (action === 'save') {
      const gameId = String(body.gameId || '').trim().slice(0, 160);
      const steamAppid = String(body.steamAppid || '').trim().slice(0, 32) || null;
      if (!gameId) return res.status(400).json({ ok: false, error: 'game_id_required' });
      const source = cleanSource(body.sourceContext);

      if (steamAppid) {
        const duplicate = await sql`
          SELECT game_id FROM reader.saved_games
          WHERE workspace_id = ${device.workspace_id}
            AND steam_appid = ${steamAppid}
          LIMIT 1
        `;
        if (duplicate?.[0] && duplicate[0].game_id !== gameId) {
          await sql`
            UPDATE reader.saved_games
            SET source_context = source_context || ${JSON.stringify(source)}::jsonb,
                updated_at = now()
            WHERE workspace_id = ${device.workspace_id}
              AND game_id = ${duplicate[0].game_id}
          `;
          return res.status(200).json({ ok: true, saved: true, deduped: true, gameId: duplicate[0].game_id });
        }
      }

      await sql`
        INSERT INTO reader.saved_games (workspace_id, game_id, steam_appid, source_context)
        VALUES (${device.workspace_id}, ${gameId}, ${steamAppid}, ${JSON.stringify(source)}::jsonb)
        ON CONFLICT (workspace_id, game_id) DO UPDATE SET
          steam_appid = COALESCE(reader.saved_games.steam_appid, EXCLUDED.steam_appid),
          source_context = reader.saved_games.source_context || EXCLUDED.source_context,
          updated_at = now()
      `;
      return res.status(200).json({ ok: true, saved: true, deduped: false, gameId });
    }

    if (action === 'remove') {
      const gameId = String(body.gameId || '').trim().slice(0, 160);
      if (!gameId) return res.status(400).json({ ok: false, error: 'game_id_required' });
      await sql`
        DELETE FROM reader.saved_games
        WHERE workspace_id = ${device.workspace_id}
          AND game_id = ${gameId}
      `;
      return res.status(200).json({ ok: true, removed: true, gameId });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (error) {
    return sendError(res, error);
  }
}
