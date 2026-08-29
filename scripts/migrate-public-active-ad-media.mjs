import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);

const roles = await sql`SELECT rolname FROM pg_roles WHERE rolname IN ('anonymous','authenticated') ORDER BY rolname`;
const roleNames = new Set(roles.map((r) => r.rolname));
if (!roleNames.has('anonymous') || !roleNames.has('authenticated')) throw new Error('expected Data API roles missing');

const conflicts = await sql`
  SELECT policyname
  FROM pg_policies
  WHERE schemaname='public' AND tablename='ad_media' AND policyname='ad_media_public_servable'
`;
if (conflicts.length) {
  console.log('[public-ad-media] policy already exists; verifying only');
} else {
  await sql`
    CREATE OR REPLACE FUNCTION public.ad_media_is_servable(p_campaign_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.ad_campaigns c
        WHERE c.id = p_campaign_id
          AND c.status = 'active'
          AND coalesce(c.impressions, 0) < coalesce(c.impression_limit, 0)
          AND (c.end_date IS NULL OR c.end_date >= current_date)
      )
    $$
  `;
  await sql`REVOKE ALL ON FUNCTION public.ad_media_is_servable(uuid) FROM PUBLIC`;
  await sql`GRANT EXECUTE ON FUNCTION public.ad_media_is_servable(uuid) TO anonymous, authenticated`;
  await sql`GRANT SELECT ON TABLE public.ad_media TO anonymous`;
  await sql`
    CREATE POLICY ad_media_public_servable
    ON public.ad_media
    FOR SELECT
    TO anonymous, authenticated
    USING (public.ad_media_is_servable(campaign_id))
  `;
}

const policy = await sql`
  SELECT policyname, cmd, roles, qual
  FROM pg_policies
  WHERE schemaname='public' AND tablename='ad_media' AND policyname='ad_media_public_servable'
`;
const grant = await sql`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='ad_media'
    AND grantee='anonymous' AND privilege_type='SELECT'
`;
if (policy.length !== 1 || grant.length !== 1) throw new Error('public active media verification failed');
console.log('[public-ad-media]', JSON.stringify({ policy: policy[0], anonymousSelect: true }));
