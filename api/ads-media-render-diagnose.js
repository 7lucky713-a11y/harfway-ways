import { getSql } from './ads-fair-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false, error: 'not_found' });

  try {
    const sql = getSql();
    const campaignId = '35482ff8-19a9-4741-ba04-157ce0fc45ab';
    const campaigns = await sql`
      SELECT id::text AS id, media_url, media_mime
      FROM public.ad_campaigns
      WHERE id = ${campaignId}::uuid
      LIMIT 1
    `;
    const mediaRows = await sql`
      SELECT
        campaign_id::text AS campaign_id,
        COALESCE(mime_type, '') AS mime_type,
        COALESCE(file_name, '') AS file_name,
        CASE WHEN data_url IS NULL THEN false ELSE true END AS has_data_url,
        CASE WHEN data_base64 IS NULL THEN false ELSE true END AS has_data_base64,
        CASE WHEN data_url LIKE 'data:%;base64,%' THEN true ELSE false END AS data_url_is_data_uri,
        length(COALESCE(data_url, ''))::int AS data_url_length,
        length(COALESCE(data_base64, ''))::int AS data_base64_length
      FROM public.ad_media
      WHERE campaign_id = ${campaignId}::uuid
      LIMIT 20
    `;
    return res.status(200).json({
      ok: true,
      campaign: campaigns[0] ? {
        hasMediaUrl: Boolean(campaigns[0].media_url),
        mediaUrlHost: (() => { try { return new URL(campaigns[0].media_url).hostname; } catch { return ''; } })(),
        mediaMime: campaigns[0].media_mime || ''
      } : null,
      legacyMedia: mediaRows,
      legacyRowCount: mediaRows.length
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
