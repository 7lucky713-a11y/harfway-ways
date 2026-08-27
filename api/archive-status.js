export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  return res.status(200).json({
    ok: true,
    version: '0.6',
    environment: process.env.VERCEL_ENV || 'unknown',
    previewDatabaseConfigured: Boolean(process.env.SALVAGER_PREVIEW_DATABASE_URL),
    writeMode: process.env.SALVAGER_PREVIEW_DATABASE_URL ? 'preview-database' : 'browser-draft-only',
    productionWriteFallback: false,
    gameRegistration: process.env.SALVAGER_PREVIEW_DATABASE_URL ? 'preview-enabled' : 'safe-locked'
  });
}
