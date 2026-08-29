import { neon } from '@neondatabase/serverless';
const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);
const policies = await sql`
  SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE schemaname='public' AND tablename='ad_campaigns'
  ORDER BY policyname
`;
const grants = await sql`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='ad_campaigns'
  ORDER BY grantee, privilege_type
`;
console.log('[campaign-public-access]', JSON.stringify({ policies, grants }));
