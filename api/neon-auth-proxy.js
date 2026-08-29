const UPSTREAM = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
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

function normalizeSetCookie(cookie) {
  return cookie
    .replace(/;\s*Domain=[^;]*/ig, '')
    .replace(/;\s*Path=[^;]*/ig, '; Path=/');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const path = rawPath(req);
  const target = `${UPSTREAM}/${path}${copyQuery(req)}`;
  const headers = {
    accept: req.headers.accept || 'application/json',
    origin: TRUSTED_ORIGIN,
    referer: `${TRUSTED_ORIGIN}/ads-admin/`,
    'user-agent': req.headers['user-agent'] || 'HARF-WAY-ADS-Preview-Auth-Proxy/1.0'
  };

  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;

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

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-harfway-preview-auth-proxy', '1');

    const location = upstream.headers.get('location');
    if (location) res.setHeader('location', location);

    const setCookies = typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
    if (setCookies.length) res.setHeader('set-cookie', setCookies.map(normalizeSetCookie));

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(bytes);
  } catch (error) {
    console.error('Neon Auth preview proxy failed', error);
    res.status(502).json({ error: 'Preview authentication proxy failed' });
  }
}
