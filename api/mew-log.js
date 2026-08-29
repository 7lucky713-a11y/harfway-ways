import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, archiveCors } from './archive-core.js';

const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

async function getDatabaseIdentity(sql) {
  const rows = await sql`
    SELECT
      current_database()::text AS database_name,
      current_user::text AS database_user,
      current_setting('neon.project_id', true)::text AS project_id,
      current_setting('neon.branch_id', true)::text AS branch_id,
      to_regclass('core.contents')::text AS contents_table
  `;
  return rows[0] || {};
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'read_only_probe' });

  const config = archiveDatabaseConfig();
  if (config.production) {
    return res.status(403).json({
      ok: false,
      error: 'production_disabled',
      environment: process.env.VERCEL_ENV || 'production'
    });
  }

  if (!config.url) {
    return res.status(503).json({
      ok: false,
      error: 'preview_database_not_configured',
      environment: process.env.VERCEL_ENV || 'preview',
      expectedEnv: 'SALVAGER_PREVIEW_DATABASE_URL'
    });
  }

  try {
    const sql = neon(config.url);
    const info = await getDatabaseIdentity(sql);
    const branchId = clean(info.branch_id, 80);
    const projectId = clean(info.project_id, 80);
    const tableReady = clean(info.contents_table, 120) === 'core.contents';
    const identityVerified = Boolean(branchId);
    const productionBranch = branchId === PRODUCTION_BRANCH_ID;
    const writeSafe = identityVerified && !productionBranch && tableReady;

    return res.status(200).json({
      ok: true,
      environment: process.env.VERCEL_ENV || 'preview',
      mode: config.mode || 'preview-core',
      databaseConfigured: true,
      databaseName: clean(info.database_name, 120),
      projectId: projectId || null,
      branchId: branchId || null,
      tableReady,
      identityVerified,
      productionBranch,
      writeSafe,
      mutationsEnabled: false
    });
  } catch (error) {
    console.error('[mew-log-probe]', error);
    return res.status(500).json({
      ok: false,
      error: 'preview_database_probe_failed',
      code: error?.code || null
    });
  }
}
