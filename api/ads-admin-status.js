import { getSql } from './ads-fair-core.js';

const AUTH_UPSTREAM = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const DATA_UPSTREAM = 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const TRUSTED_ORIGIN = 'https://harfway-playback.vercel.app';

function decodeJwtPayload(authorization) {
  try {
    const token = String(authorization || '').replace(/^Bearer\s+/i, '');
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function sessionAuthorization(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const response = await fetch(`${AUTH_UPSTREAM}/get-session`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      cookie: String(cookie),
      origin: TRUSTED_ORIGIN,
      referer: `${TRUSTED_ORIGIN}/ads-admin/`,
      'user-agent': req.headers['user-agent'] || 'HARF-WAY-ADS-Admin-Status/1.1'
    },
    redirect: 'manual'
  });
  if (!response.ok) return null;
  const jwt = response.headers.get('set-auth-jwt');
  return jwt ? `Bearer ${jwt}` : null;
}

async function patchCampaign(campaignId, authorization, body) {
  const response = await fetch(`${DATA_UPSTREAM}/ad_campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const message = data?.message || data?.error || data?.details || text || `status update failed (${response.status})`;
    throw new Error(String(message));
  }
  if (!Array.isArray(data) || data.length !== 1) throw new Error('campaign status update was not applied');
  return data[0];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false, error: 'not_found' });

  try {
    const campaignId = String(req.body?.campaignId || '').trim();
    const action = String(req.body?.action || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
      return res.status(400).json({ ok: false, error: 'invalid_campaign' });
    }
    if (!['activate', 'pause'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid_action' });
    }

    const authorization = await sessionAuthorization(req);
    if (!authorization) return res.status(401).json({ ok: false, error: 'session_required' });
    const payload = decodeJwtPayload(authorization);
    const userId = String(payload?.sub || '');
    if (!userId) return res.status(401).json({ ok: false, error: 'invalid_session' });

    const sql = getSql();
    const adminRows = await sql`
      SELECT role
      FROM neon_auth."user"
      WHERE id::text = ${userId}
      LIMIT 1
    `;
    if (String(adminRows[0]?.role || '') !== 'admin') {
      return res.status(403).json({ ok: false, error: 'admin_required' });
    }

    const beforeRows = await sql`
      SELECT id::text AS id, title, status
      FROM public.ad_campaigns
      WHERE id = ${campaignId}::uuid
      LIMIT 1
    `;
    const before = beforeRows[0];
    if (!before) return res.status(404).json({ ok: false, error: 'campaign_not_found' });

    const nextStatus = action === 'pause' ? 'paused' : 'active';
    const patch = { status: nextStatus };
    if (action === 'activate' && before.status === 'pending') {
      patch.approved_at = new Date().toISOString();
    }

    const after = await patchCampaign(campaignId, authorization, patch);
    console.log(`[ads-admin-status] campaign=${campaignId} action=${action} before=${before.status} after=${after?.status || ''} via=data-api`);
    return res.status(200).json({ ok: true, campaign: after });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'status_update_failed');
    console.error(`[ads-admin-status] failed message=${JSON.stringify(message)}`);
    return res.status(500).json({ ok: false, error: 'status_update_failed', message });
  }
}
