const UPSTREAM = process.env.PLAYBACK_EDITOR_UPSTREAM || 'https://harfway-playback-editor.vercel.app';
const ALLOWED = new Set(['auth', 'state', 'videos', 'sign-upload']);

function readHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const target = String(req.query?.target || '').trim();
  if (!ALLOWED.has(target)) return res.status(400).json({ ok: false, error: 'unsupported_target' });

  try {
    const headers = { accept: 'application/json' };
    const adminKey = readHeader(req, 'x-showcase-admin-key');
    const contentType = readHeader(req, 'content-type');
    if (adminKey) headers['x-showcase-admin-key'] = adminKey;
    if (contentType) headers['content-type'] = contentType;

    const method = String(req.method || 'GET').toUpperCase();
    let body;
    if (!['GET', 'HEAD'].includes(method)) {
      if (Buffer.isBuffer(req.body) || typeof req.body === 'string') body = req.body;
      else if (req.body != null) body = JSON.stringify(req.body);
    }

    const upstream = await fetch(`${UPSTREAM}/api/proxy?target=${encodeURIComponent(target)}`, {
      method,
      headers,
      body,
      cache: 'no-store'
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.send(payload);
  } catch (error) {
    console.error('[playback-editor-proxy]', error);
    return res.status(502).json({ ok: false, error: 'upstream_unavailable' });
  }
}
