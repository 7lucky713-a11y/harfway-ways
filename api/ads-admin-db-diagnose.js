import { getSql } from './ads-fair-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false, error: 'not_found' });

  try {
    const sql = getSql();

    const functions = await sql`
      SELECT
        n.nspname AS schema_name,
        p.proname AS function_name,
        p.prosecdef AS security_definer,
        pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'hwads_is_admin'
      ORDER BY n.nspname
    `;

    const policies = await sql`
      SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename LIKE 'ad_%'
      ORDER BY tablename, policyname
    `;

    const candidateColumns = await sql`
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND (
          table_name ILIKE '%admin%'
          OR table_name ILIKE '%role%'
          OR column_name ILIKE '%admin%'
          OR column_name ILIKE '%role%'
          OR column_name IN ('user_id', 'owner_id', 'owner_user_id')
        )
      ORDER BY table_schema, table_name, ordinal_position
    `;

    const campaignColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ad_campaigns'
      ORDER BY ordinal_position
    `;

    return res.status(200).json({
      ok: true,
      previewOnly: true,
      readOnly: true,
      functions,
      policies,
      candidateColumns,
      campaignColumns
    });
  } catch (error) {
    console.error('[ads-admin-db-diagnose]', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'diagnose_failed' });
  }
}
