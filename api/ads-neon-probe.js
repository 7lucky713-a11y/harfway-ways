const candidates = [
  {
    key: 'current-neon-tech',
    auth: 'https://ep-damp-resonance-awphji1s.neonauth.us-east-1.aws.neon.tech/neondb/auth',
    data: 'https://ep-damp-resonance-awphji1s.apirest.us-east-1.aws.neon.tech/neondb/rest/v1',
  },
  {
    key: 'cluster-neon-tech',
    auth: 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth',
    data: 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1',
  },
  {
    key: 'cluster-neon-build',
    auth: 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.build/neondb/auth',
    data: 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.build/neondb/rest/v1',
  },
];

async function probe(url, kind) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const target = kind === 'auth' ? `${url}/get-session` : `${url}/`;
    const response = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const text = await response.text().catch(() => '');
    return {
      reachable: true,
      status: response.status,
      contentType: response.headers.get('content-type') || null,
      hint: text.slice(0, 120).replace(/[^\x20-\x7E\u3000-\u30ff\u4e00-\u9fff]/g, ' '),
    };
  } catch (error) {
    return {
      reachable: false,
      error: error?.name === 'AbortError' ? 'timeout' : 'network_error',
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Preview diagnostics only. Never ship this route as part of the final production implementation.
  if (process.env.VERCEL_ENV === 'production') {
    return res.status(404).json({ ok: false, error: 'preview_only' });
  }

  const results = [];
  for (const candidate of candidates) {
    const [auth, data] = await Promise.all([
      probe(candidate.auth, 'auth'),
      probe(candidate.data, 'data'),
    ]);
    results.push({ key: candidate.key, auth, data });
  }

  return res.status(200).json({ ok: true, results });
}
