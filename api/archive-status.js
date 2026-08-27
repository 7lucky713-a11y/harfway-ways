import { archiveDatabaseConfig } from './archive-core.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const config = archiveDatabaseConfig();
  return res.status(200).json({
    ok: true,
    version: '0.7',
    environment: process.env.VERCEL_ENV || 'unknown',
    configured: Boolean(config.url),
    previewDatabaseConfigured: Boolean(process.env.SALVAGER_PREVIEW_DATABASE_URL),
    productionCoreConfigured: Boolean(
      process.env.WAYS_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL
    ),
    writeMode: config.url ? config.mode : 'browser-draft-only',
    authRequired: config.production,
    gameRegistration: config.url ? (config.production ? 'authenticated-core' : 'preview-enabled') : 'safe-locked'
  });
}
