import { neon } from '@neondatabase/serverless';

const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);
const campaignId = '35482ff8-19a9-4741-ba04-157ce0fc45ab';

const before = await sql`
  SELECT
    count(*)::int AS row_count,
    max(length(coalesce(data_base64,'')))::int AS base64_len,
    max(length(coalesce(data_url,'')))::int AS data_url_len,
    max(mime_type) AS mime_type
  FROM public.ad_media
  WHERE campaign_id = ${campaignId}::uuid
`;
const state = before[0] || {};
if (Number(state.row_count || 0) !== 1) throw new Error(`unexpected ad_media row count: ${state.row_count}`);
if (Number(state.base64_len || 0) <= 0) throw new Error('legacy data_base64 missing');
if (!/^image\/(jpeg|png|webp)$/i.test(String(state.mime_type || ''))) throw new Error(`unsupported mime: ${state.mime_type}`);

let changed = 0;
if (Number(state.data_url_len || 0) === 0) {
  const rows = await sql`
    UPDATE public.ad_media
    SET data_url = 'data:' || mime_type || ';base64,' || data_base64,
        updated_at = now()
    WHERE campaign_id = ${campaignId}::uuid
      AND coalesce(data_url,'') = ''
      AND coalesce(data_base64,'') <> ''
    RETURNING campaign_id
  `;
  changed = rows.length;
}

const after = await sql`
  SELECT
    length(coalesce(data_base64,''))::int AS base64_len,
    length(coalesce(data_url,''))::int AS data_url_len,
    mime_type
  FROM public.ad_media
  WHERE campaign_id = ${campaignId}::uuid
  LIMIT 1
`;
if (!after[0] || Number(after[0].data_url_len || 0) <= Number(after[0].base64_len || 0)) {
  throw new Error('legacy data_url verification failed');
}
console.log('[scraps-media-compat]', JSON.stringify({ changed, after: after[0] }));
