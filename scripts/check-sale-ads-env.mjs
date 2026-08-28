import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) {
  console.log('[SALE_ADS_ENV_CHECK] configured=false');
  process.exit(0);
}

try {
  const sql = neon(url);
  const rows = await sql`
    SELECT
      to_regclass('public.ad_campaigns') IS NOT NULL AS campaigns_table,
      to_regclass('public.ad_events') IS NOT NULL AS events_table,
      to_regclass('public.ad_placement_rules') IS NOT NULL AS rules_table,
      (SELECT count(*)::int FROM public.ad_campaigns) AS campaigns
  `;
  console.log('[SALE_ADS_ENV_CHECK]', JSON.stringify({ configured: true, connected: true, ...rows[0] }));
} catch (error) {
  console.log('[SALE_ADS_ENV_CHECK]', JSON.stringify({ configured: true, connected: false, error: String(error?.message || error).slice(0, 160) }));
}
