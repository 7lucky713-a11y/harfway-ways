import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);
const campaignId = '35482ff8-19a9-4741-ba04-157ce0fc45ab';

const rows = await sql`
  SELECT
    jsonb_strip_nulls(to_jsonb(m) - 'data_base64' - 'data_url') AS meta,
    length(coalesce(to_jsonb(m)->>'data_base64',''))::int AS data_base64_len,
    length(coalesce(to_jsonb(m)->>'data_url',''))::int AS data_url_len
  FROM public.ad_media m
  WHERE to_jsonb(m)->>'campaign_id' = ${campaignId}
  ORDER BY coalesce((to_jsonb(m)->>'created_at')::timestamptz, now()) DESC
  LIMIT 10
`;

console.log('[scraps-legacy-media]', JSON.stringify({ count: rows.length, rows }));
