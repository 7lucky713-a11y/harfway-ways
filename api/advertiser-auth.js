import {
  advertiserCookieHeader,
  createAdvertiserSession,
  resolveAdvertiserByCode,
} from '../lib/advertiser-session.js';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = readBody(req);
  const advertiser = resolveAdvertiserByCode(body.code);
  if (!advertiser) {
    return res.status(401).json({ ok: false, error: 'invalid_access_code' });
  }

  try {
    const token = createAdvertiserSession(advertiser);
    res.setHeader('Set-Cookie', advertiserCookieHeader(token));
    return res.status(200).json({
      ok: true,
      advertiser: { id: advertiser.id, name: advertiser.name },
      demo: Boolean(advertiser.demo),
    });
  } catch {
    return res.status(503).json({ ok: false, error: 'portal_not_configured' });
  }
}
