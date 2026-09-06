import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const ALLOWED_EVENTS = new Set([
  'page_view','view','select','play','p25','p50','p75','complete','view_end',
  'store_click','article_click','tag_click','content_click','filter_change','search'
]);
const STAGING_TRACK_URL = 'https://ways-analytics-staging.vercel.app/api/track';
const VISITOR_COOKIE = 'hw_analytics_vid_v1';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

const cleanText = (value, max = 128) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
};

const cleanNumber = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};

const shouldUseProductionDb = () => process.env.VERCEL_ENV === 'production';

function readCookie(req, name) {
  const header = String(req.headers?.cookie || '');
  if (!header) return '';
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey !== name) continue;
    try { return decodeURIComponent(rest.join('=')); } catch { return rest.join('='); }
  }
  return '';
}

function ensureVisitorId(req, res, event) {
  const existing = cleanText(readCookie(req, VISITOR_COOKIE), 64);
  if (existing) return existing;
  if (event !== 'page_view') return null;
  const id = randomUUID();
  res.setHeader('Set-Cookie', `${VISITOR_COOKIE}=${encodeURIComponent(id)}; Max-Age=${VISITOR_MAX_AGE}; Path=/; SameSite=Lax; Secure; HttpOnly`);
  return id;
}

async function proxyToStaging(body, res) {
  try {
    const upstream = await fetch(STAGING_TRACK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const text = await upstream.text();
    res.status(upstream.status);
    try { return res.json(JSON.parse(text)); } catch { return res.end(text); }
  } catch (error) {
    console.error('[ways-track-staging-proxy]', error?.message || error);
    return res.status(502).json({ ok: false, error: 'staging_proxy_failed' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const event = cleanText(body.event, 64);
    const sessionId = cleanText(body.sessionId, 128);
    if (!event || !ALLOWED_EVENTS.has(event)) return res.status(400).json({ ok: false, error: 'invalid_event' });
    if (!sessionId) return res.status(400).json({ ok: false, error: 'missing_session' });

    const visitorId = ensureVisitorId(req, res, event);
    const incomingMetadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {};
    const metadata = visitorId
      ? { ...incomingMetadata, visitor_id: visitorId }
      : incomingMetadata;
    const normalizedBody = { ...body, metadata };

    if (!shouldUseProductionDb()) return proxyToStaging(normalizedBody, res);

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return res.status(503).json({ ok: false, error: 'database_not_configured' });

    const gameId = cleanText(body.gameId, 128);
    const page = cleanText(body.page, 64) || 'ways';
    const device = ['desktop','mobile'].includes(body.device) ? body.device : 'unknown';
    const progress = cleanNumber(body.progress, 0, 100);
    const duration = cleanNumber(body.duration, 0, 86400);
    const source = cleanText(body.source, 64);

    const sql = neon(connectionString);
    await sql`
      INSERT INTO public.ways_analytics_events
        (event_name, game_id, session_id, page, device, progress, duration, source, metadata)
      VALUES
        (${event}, ${gameId}, ${sessionId}, ${page}, ${device}, ${progress}, ${duration}, ${source}, ${JSON.stringify(metadata)}::jsonb)
    `;

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[ways-track]', error?.message || error);
    return res.status(500).json({ ok: false, error: 'track_failed' });
  }
}
