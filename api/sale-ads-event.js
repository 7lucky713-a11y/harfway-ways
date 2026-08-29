import {
  SALE_PLACEMENT,
  cors,
  getSql,
  cleanSid,
  cleanTags,
  cleanCampaignId,
  loadSaleRule,
} from './sale-ads-core.js';

const EVENT_TYPES = new Set(['impression', 'click', 'store_visit']);

async function recordImpression(sql, campaignId, sid, tags, sessionCap) {
  const tagsJson = JSON.stringify(tags);
  const rows = await sql`
    WITH allowed AS (
      SELECT c.id
      FROM public.ad_campaigns c
      WHERE c.id = ${campaignId}::uuid
        AND c.status = 'active'
        AND ${SALE_PLACEMENT} = ANY(c.placements)
        AND coalesce(c.impressions, 0) < coalesce(c.impression_limit, 0)
        AND (c.end_date IS NULL OR c.end_date >= current_date)
        AND (
          SELECT count(*)
          FROM public.ad_events e
          WHERE e.campaign_id = c.id
            AND e.event_type = 'impression'
            AND e.placement = ${SALE_PLACEMENT}
            AND e.session_key = ${sid}
            AND e.occurred_at >= now() - interval '24 hours'
        ) < ${sessionCap}
      LIMIT 1
    ), inserted AS (
      INSERT INTO public.ad_events (campaign_id, event_type, placement, context_tags, session_key)
      SELECT id, 'impression', ${SALE_PLACEMENT},
        ARRAY(SELECT jsonb_array_elements_text(${tagsJson}::jsonb)), ${sid}
      FROM allowed
      RETURNING campaign_id
    ), updated AS (
      UPDATE public.ad_campaigns c
      SET impressions = coalesce(c.impressions, 0) + 1,
          status = CASE
            WHEN coalesce(c.impressions, 0) + 1 >= coalesce(c.impression_limit, 0) THEN 'completed'
            ELSE c.status
          END,
          updated_at = now()
      WHERE c.id IN (SELECT campaign_id FROM inserted)
      RETURNING c.id
    )
    SELECT EXISTS(SELECT 1 FROM inserted) AS accepted
  `;
  return Boolean(rows[0]?.accepted);
}

async function recordClick(sql, campaignId, sid, tags) {
  const tagsJson = JSON.stringify(tags);
  const rows = await sql`
    WITH allowed AS (
      SELECT c.id
      FROM public.ad_campaigns c
      WHERE c.id = ${campaignId}::uuid
        AND ${SALE_PLACEMENT} = ANY(c.placements)
      LIMIT 1
    ), inserted AS (
      INSERT INTO public.ad_events (campaign_id, event_type, placement, context_tags, session_key)
      SELECT id, 'click', ${SALE_PLACEMENT},
        ARRAY(SELECT jsonb_array_elements_text(${tagsJson}::jsonb)), ${sid}
      FROM allowed
      RETURNING campaign_id
    ), updated AS (
      UPDATE public.ad_campaigns c
      SET clicks = coalesce(c.clicks, 0) + 1,
          updated_at = now()
      WHERE c.id IN (SELECT campaign_id FROM inserted)
      RETURNING c.id
    )
    SELECT EXISTS(SELECT 1 FROM inserted) AS accepted
  `;
  return Boolean(rows[0]?.accepted);
}

async function recordStoreVisit(sql, campaignId, sid, tags) {
  const tagsJson = JSON.stringify(tags);
  const rows = await sql`
    WITH allowed AS (
      SELECT c.id
      FROM public.ad_campaigns c
      WHERE c.id = ${campaignId}::uuid
        AND ${SALE_PLACEMENT} = ANY(c.placements)
      LIMIT 1
    ), inserted AS (
      INSERT INTO public.ad_events (campaign_id, event_type, placement, context_tags, session_key)
      SELECT id, 'store_visit', ${SALE_PLACEMENT},
        ARRAY(SELECT jsonb_array_elements_text(${tagsJson}::jsonb)), ${sid}
      FROM allowed
      RETURNING campaign_id
    ), updated AS (
      UPDATE public.ad_campaigns c
      SET store_visits = coalesce(c.store_visits, 0) + 1,
          updated_at = now()
      WHERE c.id IN (SELECT campaign_id FROM inserted)
      RETURNING c.id
    )
    SELECT EXISTS(SELECT 1 FROM inserted) AS accepted
  `;
  return Boolean(rows[0]?.accepted);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const type = String(body.type || '').trim();
  const campaignId = cleanCampaignId(body.campaignId);
  const placement = String(body.placement || '').trim();
  const sid = cleanSid(body.sessionKey);
  const tags = cleanTags(body.contextTags);

  if (!EVENT_TYPES.has(type)) return res.status(400).json({ ok: false, error: 'invalid event type' });
  if (placement !== SALE_PLACEMENT) return res.status(400).json({ ok: false, error: 'invalid placement' });
  if (!campaignId) return res.status(400).json({ ok: false, error: 'invalid campaign' });
  if (!sid) return res.status(400).json({ ok: false, error: 'invalid session' });

  try {
    const sql = getSql();
    const rule = await loadSaleRule(sql);
    if (!rule.enabled) return res.status(200).json({ ok: true, result: { accepted: false, reason: 'placement_disabled' } });

    let accepted = false;
    if (type === 'impression') accepted = await recordImpression(sql, campaignId, sid, tags, rule.sessionCap);
    else if (type === 'click') accepted = await recordClick(sql, campaignId, sid, tags);
    else accepted = await recordStoreVisit(sql, campaignId, sid, tags);

    return res.status(200).json({ ok: true, result: { accepted } });
  } catch (error) {
    const notConfigured = error?.code === 'ADS_DB_NOT_CONFIGURED';
    console.error('[sale-ads-event]', notConfigured ? 'not_configured' : String(error?.message || error));
    return res.status(notConfigured ? 503 : 500).json({
      ok: false,
      error: notConfigured ? 'sale ads preview database is not configured' : 'sale ads event unavailable',
    });
  }
}
