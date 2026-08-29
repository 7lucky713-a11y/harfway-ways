export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const hasAdminKey = Boolean(
    process.env.ADS_ADVERTISER_ADMIN_KEY
    || process.env.ADS_ADMIN_KEY
    || process.env.HARFWAY_ADS_ADMIN_KEY
  );

  return res.status(200).json({
    ok: true,
    configured: {
      sessionSecret: Boolean(process.env.ADS_ADVERTISER_SESSION_SECRET),
      advertiserCodes: Boolean(process.env.ADS_ADVERTISER_CODES),
      adminReadKey: hasAdminKey,
      manualReports: Boolean(process.env.ADS_ADVERTISER_REPORTS),
    },
    environment: process.env.VERCEL_ENV || 'unknown',
  });
}
