import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);
await sql`DROP POLICY IF EXISTS ad_media_public_servable ON public.ad_media`;
await sql`REVOKE SELECT ON TABLE public.ad_media FROM anonymous`;
await sql`DROP FUNCTION IF EXISTS public.ad_media_is_servable(uuid)`;
const policy = await sql`
  SELECT policyname FROM pg_policies
  WHERE schemaname='public' AND tablename='ad_media' AND policyname='ad_media_public_servable'
`;
const grant = await sql`
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='ad_media'
    AND grantee='anonymous' AND privilege_type='SELECT'
`;
if (policy.length || grant.length) throw new Error('rollback verification failed');
console.log('[public-ad-media-rollback] removed policy, anonymous grant, helper function');
