const UPSTREAM = 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const AUTH_UPSTREAM = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const TRUSTED_ORIGIN = 'https://harfway-playback.vercel.app';

function rawPath(req) {
  const value = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path;
  return typeof value === 'string' ? value.replace(/^\/+/, '') : '';
}

function copyQuery(req) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value != null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function buildRequestHeaders(req) {
  const headers = {};
  const blocked = new Set([
    'host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer',
    'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'x-vercel-id',
    'x-vercel-deployment-url', 'x-vercel-proxied-for', 'x-real-ip'
  ]);
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (blocked.has(key.toLowerCase()) || value == null) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  headers.origin = TRUSTED_ORIGIN;
  headers.referer = `${TRUSTED_ORIGIN}/ads-admin/`;
  headers['user-agent'] = req.headers['user-agent'] || 'HARF-WAY-ADS-Preview-Data-Proxy/1.0';
  return headers;
}

async function resolveAuthorization(req) {
  if (req.headers.authorization) return String(req.headers.authorization);
  const cookie = req.headers.cookie;
  if (!cookie) return null;

  try {
    const response = await fetch(`${AUTH_UPSTREAM}/get-session`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: String(cookie),
        origin: TRUSTED_ORIGIN,
        referer: `${TRUSTED_ORIGIN}/ads-admin/`,
        'user-agent': req.headers['user-agent'] || 'HARF-WAY-ADS-Preview-Data-Proxy/1.0'
      },
      redirect: 'manual'
    });
    if (!response.ok) return null;

    const jwt = response.headers.get('set-auth-jwt');
    if (jwt) return `Bearer ${jwt}`;

    const data = await response.json().catch(() => null);
    const fallback = data?.session?.token;
    if (typeof fallback === 'string' && fallback.split('.').length === 3) {
      return `Bearer ${fallback}`;
    }
  } catch (error) {
    console.error('Neon Data API preview token bridge failed', error);
  }
  return null;
}

function copyResponseHeaders(upstream, res) {
  const blocked = new Set([
    'connection', 'content-length', 'content-encoding', 'transfer-encoding',
    'access-control-allow-origin', 'access-control-allow-credentials',
    'access-control-allow-headers', 'access-control-allow-methods', 'set-cookie'
  ]);
  for (const [key, value] of upstream.headers.entries()) {
    if (blocked.has(key.toLowerCase())) continue;
    try { res.setHeader(key, value); } catch {}
  }
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-harfway-preview-data-proxy', '1');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const path = rawPath(req);
  const target = `${UPSTREAM}/${path}${copyQuery(req)}`;
  const headers = buildRequestHeaders(req);
  const authorization = await resolveAuthorization(req);
  if (authorization) headers.authorization = authorization;

  console.log('[preview-data-auth]', {
    path,
    incomingAuthorization: Boolean(req.headers.authorization),
    sessionCookie: Boolean(req.headers.cookie),
    bridgedAuthorization: Boolean(authorization)
  });

  let body;
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    if (Buffer.isBuffer(req.body)) body = req.body;
    else if (typeof req.body === 'string') body = req.body;
    else if (req.body != null) {
      body = JSON.stringify(req.body);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual'
    });
    copyResponseHeaders(upstream, res);
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(bytes);
  } catch (error) {
    console.error('Neon Data API preview proxy failed', error);
    res.status(502).json({ error: 'Preview data proxy failed' });
  }
}
