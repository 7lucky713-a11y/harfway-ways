import { clearAdvertiserCookieHeader } from '../lib/advertiser-session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  res.setHeader('Set-Cookie', clearAdvertiserCookieHeader());
  return res.status(200).json({ ok: true });
}
