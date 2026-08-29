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

let dbHost = '';
try { dbHost = new URL(url).hostname; } catch {}
console.log('[ads-admin-db-diagnose] db-host', dbHost || 'invalid');

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
    WHERE (n.nspname = 'public' AND p.proname IN ('hwads_is_admin','ad_is_admin'))
       OR (n.nspname = 'auth' AND p.proname = 'user_id')
    ORDER BY n.nspname, p.proname
  `;

  const functionSecurity = await sql`
    SELECT
      pg_get_userbyid(p.proowner) AS function_owner,
      c.relowner::regrole::text AS user_table_owner,
      c.relrowsecurity AS user_table_rls,
      c.relforcerowsecurity AS user_table_force_rls,
      r.rolbypassrls AS function_owner_bypassrls,
      has_table_privilege(pg_get_userbyid(p.proowner), 'neon_auth.user', 'SELECT') AS function_owner_can_select_user
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_class c ON c.oid = 'neon_auth.user'::regclass
    JOIN pg_roles r ON r.rolname = pg_get_userbyid(p.proowner)
    WHERE n.nspname='public' AND p.proname='ad_is_admin'
    LIMIT 1
  `;

  const policies = await sql`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'ad_%'
    ORDER BY tablename, policyname
  `;

  const triggers = await sql`
    SELECT
      t.tgname AS trigger_name,
      pg_get_triggerdef(t.oid, true) AS trigger_def,
      n.nspname AS function_schema,
      p.proname AS function_name,
      pg_get_functiondef(p.oid) AS function_def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND cn.nspname = 'public'
      AND c.relname = 'ad_campaigns'
    ORDER BY t.tgname
  `;

  const ownerGuardFunctions = await sql`
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','auth')
      AND p.prokind IN ('f','p')
      AND (
        pg_get_functiondef(p.oid) ILIKE '%not owner%'
        OR pg_get_functiondef(p.oid) ILIKE '%owner_user_id%'
      )
    ORDER BY n.nspname, p.proname
  `;

  const statusConstraints = await sql`
    SELECT conname, pg_get_constraintdef(oid, true) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.ad_campaigns'::regclass
      AND contype = 'c'
    ORDER BY conname
  `;

  const statusCounts = await sql`
    SELECT status, count(*)::int AS count
    FROM public.ad_campaigns
    GROUP BY status
    ORDER BY status
  `;

  await sql`
    DO $probe$
    BEGIN
      CREATE TEMP TABLE hwads_status_probe(status text) ON COMMIT DROP;
      ALTER TABLE hwads_status_probe
        ADD CONSTRAINT hwads_status_probe_check
        CHECK (status = ANY (ARRAY['draft'::text,'pending'::text,'active'::text,'paused'::text,'completed'::text,'rejected'::text]));
      INSERT INTO hwads_status_probe(status) VALUES ('paused');
    END
    $probe$;
  `;
  console.log('[ads-admin-db-diagnose] paused-migration-probe OK (temporary table only)');

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
  console.log('[ads-admin-db-diagnose] function-security', JSON.stringify(functionSecurity));
  console.log('[ads-admin-db-diagnose] triggers', JSON.stringify(triggers.map(x => ({...x, trigger_def:redact(x.trigger_def), function_def:redact(x.function_def)}))));
  console.log('[ads-admin-db-diagnose] owner-guard-functions', JSON.stringify(ownerGuardFunctions.map(x => ({...x, definition:redact(x.definition)}))));
  console.log('[ads-admin-db-diagnose] status-constraints', JSON.stringify(statusConstraints));
  console.log('[ads-admin-db-diagnose] status-counts', JSON.stringify(statusCounts));
  console.log('[ads-admin-db-diagnose] candidates', JSON.stringify(candidates));
  console.log('[ads-admin-db-diagnose] policies', JSON.stringify(policies.map(x => ({...x, qual:redact(x.qual), with_check:redact(x.with_check)}))));
  console.log('[ads-admin-db-diagnose] sohi-owner', JSON.stringify(sohiOwner));
  console.log('[ads-admin-db-diagnose] role-counts', JSON.stringify(roleCounts));
} catch (error) {
  console.error('[ads-admin-db-diagnose] failed', String(error?.message || error));
  process.exitCode = 1;
}
