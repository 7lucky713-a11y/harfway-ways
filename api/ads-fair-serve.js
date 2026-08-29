import {
  cors,
  getSql,
  cleanPlacement,
  cleanSid,
  cleanTags,
  loadRule,
  normalizeCampaign,
  compareCandidates,
  frequencyCount,
} from './ads-fair-core.js';

function cleanCampaignId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const placement = cleanPlacement(req.query?.placement);
  if (!placement) return res.status(400).json({ ok: false, error: 'invalid_placement' });

  const sid = cleanSid(req.query?.sid);
  const tags = cleanTags(req.query?.tags);
  const avoidCampaignId = cleanCampaignId(req.query?.avoid);

  try {
    const sql = getSql();
    const rule = await loadRule(sql, placement);
    if (!rule.enabled) {
      return res.status(200).json({
        ok: true,
        ad: null,
        placement,
        tags,
        frequencyBlocked: false,
        pacing: 'fair-v2',
        rotation: { avoidCampaignId, applied: false, fallback: false },
        rule: { everyNItems: rule.everyNItems, sessionCap: rule.sessionCap },
      });
    }

    const rows = await sql`
      SELECT to_jsonb(c) AS campaign
      FROM public.ad_campaigns c
      WHERE c.status = 'active'
        AND ${placement} = ANY(c.placements)
        AND coalesce(c.impressions, 0) < coalesce(c.impression_limit, 0)
        AND (c.end_date IS NULL OR c.end_date >= current_date)
      ORDER BY c.created_at ASC
      LIMIT 100
    `;

    const candidates = rows.map((row) => row.campaign).filter(Boolean);
    const now = Date.now();
    candidates.sort((a, b) => compareCandidates(a, b, tags, now));

    let chosen = null;
    let frequencyBlocked = false;

    const choose = async (allowAvoided) => {
      for (const campaign of candidates) {
        if (!allowAvoided && avoidCampaignId && String(campaign.id).toLowerCase() === avoidCampaignId) continue;
        const seen = await frequencyCount(sql, campaign.id, placement, sid);
        if (seen >= rule.sessionCap) {
          frequencyBlocked = true;
          continue;
        }
        return campaign;
      }
      return null;
    };

    chosen = await choose(false);
    let rotationFallback = false;
    if (!chosen && avoidCampaignId) {
      chosen = await choose(true);
      rotationFallback = Boolean(chosen);
    }

    const rotationApplied = Boolean(
      avoidCampaignId &&
      chosen &&
      String(chosen.id).toLowerCase() !== avoidCampaignId
    );

    return res.status(200).json({
      ok: true,
      ad: normalizeCampaign(chosen),
      placement,
      tags,
      frequencyBlocked: Boolean(!chosen && candidates.length && frequencyBlocked),
      pacing: 'fair-v2',
      candidateCount: candidates.length,
      rotation: {
        avoidCampaignId,
        applied: rotationApplied,
        fallback: rotationFallback,
      },
      rule: { everyNItems: rule.everyNItems, sessionCap: rule.sessionCap },
    });
  } catch (error) {
    const notConfigured = error?.code === 'ADS_DB_NOT_CONFIGURED';
    console.error('[ads-fair-serve]', placement, notConfigured ? 'not_configured' : String(error?.message || error));
    return res.status(notConfigured ? 503 : 500).json({
      ok: false,
      error: notConfigured ? 'ads_database_not_configured' : 'ads_temporarily_unavailable',
    });
  }
}
