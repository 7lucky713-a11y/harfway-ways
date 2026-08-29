import { neon } from '@neondatabase/serverless';
const url = process.env.ADS_DATABASE_URL;
if (!url) throw new Error('ADS_DATABASE_URL missing');
const sql = neon(url);
const rows = await sql`
  SELECT c.id, c.title, c.status,
         c.media_url, c.media_mime,
         count(m.campaign_id)::int AS media_rows,
         max(m.mime_type) AS legacy_mime,
         max(m.file_name) AS legacy_file,
         max(m.size_bytes)::int AS legacy_size,
         max(length(m.data_base64))::int AS base64_len,
         max(m.created_at) AS media_created_at
  FROM public.ad_campaigns c
  LEFT JOIN public.ad_media m ON m.campaign_id=c.id
  GROUP BY c.id,c.title,c.status,c.media_url,c.media_mime
  ORDER BY c.created_at DESC
  LIMIT 20
`;
console.log('[all-ad-media-shapes]', JSON.stringify(rows.map(r => ({...r, media_url: r.media_url ? String(r.media_url).slice(0,90) : ''}))));
