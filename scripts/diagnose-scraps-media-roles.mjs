import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);
const roles = await sql`
  SELECT rolname
  FROM pg_roles
  WHERE rolname IN ('anon','anonymous','authenticated','authenticator','neon_superuser')
     OR rolname LIKE '%anon%'
     OR rolname LIKE '%auth%'
  ORDER BY rolname
`;
const grants = await sql`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='ad_media'
  ORDER BY grantee, privilege_type
`;
console.log('[scraps-media-roles]', JSON.stringify({ roles, grants }));
