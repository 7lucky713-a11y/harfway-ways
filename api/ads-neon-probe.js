const AUTH_URL = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const DATA_URL = 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';

async function probe(url, kind, origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const target = kind === 'auth' ? `${url}/get-session` : `${url}/`;
    const response = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json', origin },
    });
    const text = await response.text().catch(() => '');
    return {
      reachable: true,
      status: response.status,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      allowCredentials: response.headers.get('access-control-allow-credentials'),
      hint: text.slice(0, 160).replace(/[^\x20-\x7E\u3000-\u30ff\u4e00-\u9fff]/g, ' '),
    };
  } catch (error) {
    return { reachable: false, error: error?.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV === 'production') return res.status(404).json({ ok: false, error: 'preview_only' });

  const origin = `https://${req.headers.host}`;
  const [auth, data] = await Promise.all([
    probe(AUTH_URL, 'auth', origin),
    probe(DATA_URL, 'data', origin),
  ]);
  return res.status(200).json({ ok: true, origin, auth, data });
}
