const DATA_API = 'https://ep-damp-resonance-awphji1s.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const base64Bytes = Math.ceil((10 * 1024 * 1024) / 3) * 4;
  const body = JSON.stringify({
    placement: 'playback',
    probe_only: 'x'.repeat(base64Bytes)
  });

  try {
    const response = await fetch(`${DATA_API}/rpc/ad_pick_campaign_v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const text = await response.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      sentBytes: Buffer.byteLength(body),
      upstreamStatus: response.status,
      acceptedByGateway: response.status !== 413,
      responsePreview: text.slice(0, 240)
    });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
}
