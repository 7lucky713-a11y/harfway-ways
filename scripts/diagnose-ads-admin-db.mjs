import { neon } from '@neondatabase/serverless';

if (process.env.VERCEL_ENV !== 'preview') {
  console.log('[ads-admin-db-diagnose] skip outside Preview');
  process.exit(0);
}

const url = process.env.ADS_DATABASE_URL;
if (!url) {
  console.log('[ads-admin-db-diagnose] ADS_DATABASE_URL missing');
  process.exit(0);
}

const sql = neon(url);
const redact = (s) => String(s ?? '')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '<UUID>')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '<EMAIL>');

try {
  const functions = await sql`
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('hwads_is_admin','ad_is_admin')
    ORDER BY n.nspname, p.proname
  `;

  const policies = await sql`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'ad_%'
    ORDER BY tablename, policyname
  `;

  const candidates = await sql`
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
      AND (
        table_name ILIKE '%admin%' OR table_name ILIKE '%role%'
        OR column_name ILIKE '%admin%' OR column_name ILIKE '%role%'
        OR column_name IN ('user_id','owner_id','owner_user_id')
      )
    ORDER BY table_schema, table_name, ordinal_position
  `;

  const sohiOwner = await sql`
    SELECT
      c.title,
      (c.owner_user_id IS NOT NULL) AS has_owner_user_id,
      (u.id IS NOT NULL) AS auth_user_found,
      COALESCE(u.role, '') AS auth_role,
      (u.email IS NOT NULL) AS auth_email_present
    FROM public.ad_campaigns c
    LEFT JOIN neon_auth."user" u ON u.id::text = c.owner_user_id
    WHERE c.title = 'ソヒ'
    ORDER BY c.created_at DESC
    LIMIT 1
  `;

  const roleCounts = await sql`
    SELECT COALESCE(role,'') AS role, count(*)::int AS n
    FROM neon_auth."user"
    GROUP BY COALESCE(role,'')
    ORDER BY role
  `;

  console.log('[ads-admin-db-diagnose] functions', JSON.stringify(functions.map(x => ({...x, definition:redact(x.definition)}))));
  console.log('[ads-admin-db-diagnose] candidates', JSON.stringify(candidates));
  console.log('[ads-admin-db-diagnose] policies', JSON.stringify(policies.map(x => ({...x, qual:redact(x.qual), with_check:redact(x.with_check)}))));
  console.log('[ads-admin-db-diagnose] sohi-owner', JSON.stringify(sohiOwner));
  console.log('[ads-admin-db-diagnose] role-counts', JSON.stringify(roleCounts));
} catch (error) {
  console.error('[ads-admin-db-diagnose] failed', String(error?.message || error));
  process.exitCode = 1;
}
