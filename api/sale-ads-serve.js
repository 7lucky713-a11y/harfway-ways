import {
  SALE_PLACEMENT,
  cors,
  getSql,
  cleanSid,
  cleanTags,
  loadSaleRule,
  normalizeCampaign,
  tagScore,
  frequencyCount,
} from './sale-ads-core.js';

function progress(campaign) {
  const limit = Math.max(1, Number(campaign?.impression_limit || 1));
  return Math.max(0, Number(campaign?.impressions || 0)) / limit;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const placement = String(req.query?.placement || SALE_PLACEMENT).trim();
  if (placement !== SALE_PLACEMENT) return res.status(400).json({ ok: false, error: 'invalid placement' });

  const sid = cleanSid(req.query?.sid);
  const tags = cleanTags(req.query?.tags);

  try {
    const sql = getSql();
    const rule = await loadSaleRule(sql);
    if (!rule.enabled) {
      return res.status(200).json({
        ok: true,
        ad: null,
        placement: SALE_PLACEMENT,
        tags,
        frequencyBlocked: false,
        rule: { everyNItems: rule.everyNItems, sessionCap: rule.sessionCap },
      });
    }

    const rows = await sql`
      SELECT to_jsonb(c) AS campaign
      FROM public.ad_campaigns c
      WHERE c.status = 'active'
        AND ${SALE_PLACEMENT} = ANY(c.placements)
        AND coalesce(c.impressions, 0) < coalesce(c.impression_limit, 0)
        AND (c.end_date IS NULL OR c.end_date >= current_date)
      ORDER BY c.created_at ASC
      LIMIT 100
    `;
    const candidates = rows.map((row) => row.campaign).filter(Boolean);
    candidates.sort((a, b) => {
      const score = tagScore(b, tags) - tagScore(a, tags);
      if (score) return score;
      const pacing = progress(a) - progress(b);
      if (pacing) return pacing;
      return Math.random() - 0.5;
    });

    let chosen = null;
    let frequencyBlocked = false;
    for (const campaign of candidates) {
      const seen = await frequencyCount(sql, campaign.id, sid);
      if (seen >= rule.sessionCap) {
        frequencyBlocked = true;
        continue;
      }
      chosen = campaign;
      break;
    }

    return res.status(200).json({
      ok: true,
      ad: normalizeCampaign(chosen),
      placement: SALE_PLACEMENT,
      tags,
      frequencyBlocked: Boolean(!chosen && candidates.length && frequencyBlocked),
      rule: { everyNItems: rule.everyNItems, sessionCap: rule.sessionCap },
    });
  } catch (error) {
    const notConfigured = error?.code === 'ADS_DB_NOT_CONFIGURED';
    console.error('[sale-ads-serve]', notConfigured ? 'not_configured' : String(error?.message || error));
    return res.status(notConfigured ? 503 : 500).json({
      ok: false,
      error: notConfigured ? 'sale ads preview database is not configured' : 'sale ads temporarily unavailable',
    });
  }
}
