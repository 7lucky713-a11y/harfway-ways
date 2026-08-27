const ADMIN_LOGIN_URL = 'https://harfway-ads-admin.vercel.app/api/admin/login';
const COOKIE_NAME = '__Host-hw_ads_session';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict`);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = readBody(req);
  const key = typeof body.key === 'string' ? body.key : '';
  if (!key) {
    return res.status(400).json({ ok: false, error: 'key_required' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(ADMIN_LOGIN_URL, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'HARF-WAY-ADS-HUB/1.0',
      },
      body: JSON.stringify({ key }),
    });

    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ ok: false, error: 'invalid_key' });
    }

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: 'admin_login_unavailable', upstreamStatus: response.status });
    }

    const payload = await response.json().catch(() => ({}));
    const sessionToken = typeof payload?.sessionToken === 'string' ? payload.sessionToken : '';
    if (!sessionToken) {
      return res.status(502).json({ ok: false, error: 'session_token_missing' });
    }

    setSessionCookie(res, sessionToken);
    return res.status(200).json({ ok: true, status: 'authenticated' });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error?.name === 'AbortError' ? 'timeout' : 'admin_login_unavailable',
    });
  } finally {
    clearTimeout(timer);
  }
}
