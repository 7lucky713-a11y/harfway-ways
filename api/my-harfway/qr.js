import QRCode from 'qrcode';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'production') {
    return res.status(403).json({ ok: false, error: 'production_only' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const text = String(req.query?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text_required' });
    }
    if (text.length > 2400) {
      return res.status(413).json({ ok: false, error: 'text_too_long' });
    }

    const svg = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#111315', light: '#ffffff' }
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    return res.status(200).send(svg);
  } catch (error) {
    console.error('[my-harfway-qr]', error);
    return res.status(500).json({ ok: false, error: 'qr_failed' });
  }
}
