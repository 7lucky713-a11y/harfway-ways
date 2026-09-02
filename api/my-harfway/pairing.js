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

function cleanLabel(value, fallback = 'Linked Device') {
  const text = String(value || '').trim().slice(0, 80);
  return text || fallback;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const sql = getSql();
    await ensureReaderSchema(sql);
    const body = parseBody(req);
    const action = String(body.action || '').trim();

    if (action === 'create') {
      const device = await authenticateDevice(sql, bearer(req));
      if (!device) return res.status(401).json({ ok: false, error: 'invalid_device_token' });

      const pairToken = randomSecret('hwp_', 28);
      const pairId = randomSecret('pair_', 14);
      await sql`
        INSERT INTO reader.pairing_tokens
          (id, workspace_id, token_hash, created_by_device_id, expires_at)
        VALUES
          (${pairId}, ${device.workspace_id}, ${hashSecret(pairToken)}, ${device.id}, now() + interval '10 minutes')
      `;

      return res.status(201).json({
        ok: true,
        pairToken,
        expiresInSeconds: 600,
        workspaceId: device.workspace_id
      });
    }

    if (action === 'claim') {
      const pairToken = String(body.pairToken || '').trim();
      if (!pairToken) return res.status(400).json({ ok: false, error: 'pair_token_required' });

      const claimed = await sql`
        UPDATE reader.pairing_tokens
        SET used_at = now()
        WHERE token_hash = ${hashSecret(pairToken)}
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING workspace_id
      `;
      const target = claimed?.[0];
      if (!target) return res.status(410).json({ ok: false, error: 'pair_token_expired_or_used' });

      const currentToken = String(body.currentDeviceToken || '').trim();
      let sourceDevice = null;
      let mergedFromWorkspace = null;
      if (currentToken) {
        sourceDevice = await authenticateDevice(sql, currentToken);
        if (!sourceDevice) return res.status(401).json({ ok: false, error: 'invalid_current_device_token' });
        if (sourceDevice.workspace_id !== target.workspace_id) {
          mergedFromWorkspace = sourceDevice.workspace_id;
          await sql`
            INSERT INTO reader.saved_games (workspace_id, game_id, steam_appid, source_context, saved_at, updated_at)
            SELECT
              ${target.workspace_id}, game_id, steam_appid, source_context, saved_at, now()
            FROM reader.saved_games
            WHERE workspace_id = ${sourceDevice.workspace_id}
            ON CONFLICT (workspace_id, game_id) DO UPDATE SET
              steam_appid = COALESCE(reader.saved_games.steam_appid, EXCLUDED.steam_appid),
              source_context = reader.saved_games.source_context || EXCLUDED.source_context,
              updated_at = now()
          `;
        }
      }

      const deviceId = randomSecret('dev_', 14);
      const deviceToken = randomSecret('hwd_', 32);
      await sql`
        INSERT INTO reader.devices (id, workspace_id, token_hash, label)
        VALUES (${deviceId}, ${target.workspace_id}, ${hashSecret(deviceToken)}, ${cleanLabel(body.label)})
      `;

      const counts = await sql`
        SELECT count(*)::int AS game_count
        FROM reader.saved_games
        WHERE workspace_id = ${target.workspace_id}
      `;

      return res.status(201).json({
        ok: true,
        workspaceId: target.workspace_id,
        deviceId,
        deviceToken,
        mergedFromWorkspace,
        gameCount: Number(counts?.[0]?.game_count || 0)
      });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (error) {
    return sendError(res, error);
  }
}
