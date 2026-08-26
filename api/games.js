const UPSTREAM_GAMES_URL = 'https://harfway-playback-bxd2xeak7-harf-way.vercel.app/api/games';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const upstream = await fetch(UPSTREAM_GAMES_URL, {
      headers: { accept: 'application/json' },
      cache: 'no-store'
    });

    const text = await upstream.text();
    res.status(upstream.status);

    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.end(text);
    }
  } catch (error) {
    console.error('[ways-games-proxy]', error?.message || error);
    return res.status(502).json({ ok: false, error: 'games_upstream_failed' });
  }
}
