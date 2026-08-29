const UPSTREAM = 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
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
  const blocked = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer']);
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (blocked.has(key.toLowerCase()) || value == null) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  headers.origin = TRUSTED_ORIGIN;
  headers.referer = `${TRUSTED_ORIGIN}/ads-admin/`;
  headers['user-agent'] = req.headers['user-agent'] || 'HARF-WAY-ADS-Preview-Data-Proxy/1.0';
  return headers;
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
