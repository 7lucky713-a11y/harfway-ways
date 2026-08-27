import {
  getAdvertiserReport,
  readAdvertiserCookie,
  summarizeAdvertiserCampaigns,
  verifyAdvertiserSession,
} from '../lib/advertiser-session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const session = verifyAdvertiserSession(readAdvertiserCookie(req));
  if (!session) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const report = getAdvertiserReport(session);
  const { campaigns, summary } = summarizeAdvertiserCampaigns(report?.campaigns || []);

  return res.status(200).json({
    ok: true,
    advertiser: report.advertiser,
    dataState: report.dataState,
    generatedAt: new Date().toISOString(),
    summary,
    campaigns,
  });
}
