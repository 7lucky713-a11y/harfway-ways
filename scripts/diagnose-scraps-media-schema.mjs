import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);

const columns = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ad_media'
  ORDER BY ordinal_position
`;
const policies = await sql`
  SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE schemaname='public' AND tablename='ad_media'
  ORDER BY policyname
`;
const table = await sql`
  SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='ad_media'
  LIMIT 1
`;
console.log('[scraps-media-schema]', JSON.stringify({ columns, policies, table: table[0] || null }));
