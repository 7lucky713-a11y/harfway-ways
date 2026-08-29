import {
  getAdvertiserReport,
  readAdvertiserCookie,
  summarizeAdvertiserCampaigns,
  verifyAdvertiserSession,
} from '../lib/advertiser-session.js';
import { fetchLiveAdvertiserReport } from '../lib/advertiser-live-report.js';

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

  let report = getAdvertiserReport(session);
  let liveAttempted = false;

  if (!session.demo) {
    const live = await fetchLiveAdvertiserReport(session);
    liveAttempted = Boolean(live?.attempted);
    if (live?.report) {
      report = live.report;
    } else if (liveAttempted && report?.dataState === 'waiting_for_data') {
      report = { ...report, dataState: 'live_unavailable' };
    }
  }

  const { campaigns, summary } = summarizeAdvertiserCampaigns(report?.campaigns || []);

  return res.status(200).json({
    ok: true,
    advertiser: report?.advertiser || { id: session.sub, name: session.name },
    dataState: report?.dataState || 'waiting_for_data',
    generatedAt: new Date().toISOString(),
    summary,
    campaigns,
  });
}
