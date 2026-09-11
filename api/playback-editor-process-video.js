const UPSTREAM = process.env.PLAYBACK_EDITOR_UPSTREAM || 'https://harfway-playback-editor.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const upstream = await fetch(`${UPSTREAM}/api/process-video`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
      cache: 'no-store'
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.send(payload);
  } catch (error) {
    console.error('[playback-editor-process-video]', error);
    return res.status(502).json({ ok: false, error: 'upstream_unavailable' });
  }
}
