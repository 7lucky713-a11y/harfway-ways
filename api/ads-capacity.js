import { getSql, actualProgress, expectedProgress, pacingGap, PLACEMENT_DEFAULTS } from './ads-fair-core.js';

const PLACEMENTS = ['playback', 'playlist', 'scraps', 'sale'];

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function campaignView(campaign) {
  const limit = Math.max(0, safeNumber(campaign.impression_limit));
  const impressions = Math.max(0, safeNumber(campaign.impressions));
  const remaining = Math.max(0, limit - impressions);
  const actual = actualProgress(campaign);
  const expected = expectedProgress(campaign);
  const gap = pacingGap(campaign);
  let pacingState = 'ok';
  if (gap > 0.15) pacingState = 'late';
  else if (gap > 0.05) pacingState = 'watch';
  else if (remaining === 0) pacingState = 'done';

  return {
    id: campaign.id,
    title: campaign.title || '名称未設定',
    placements: Array.isArray(campaign.placements) ? campaign.placements : [],
    impressionLimit: limit,
    impressions,
    remaining,
    progress: actual,
    expectedProgress: expected,
    pacingGap: gap,
    pacingState,
    endDate: campaign.end_date || null,
    createdAt: campaign.created_at || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const sql = getSql();

    const campaignRows = await sql`
      SELECT to_jsonb(c) AS campaign
      FROM public.ad_campaigns c
      WHERE c.status = 'active'
        AND coalesce(c.impressions, 0) < coalesce(c.impression_limit, 0)
        AND (c.end_date IS NULL OR c.end_date >= current_date)
      ORDER BY c.created_at ASC
      LIMIT 200
    `;

    const eventRows = await sql`
      SELECT
        placement,
        count(*) FILTER (WHERE occurred_at >= now() - interval '7 days')::int AS impressions_7d,
        count(*) FILTER (WHERE occurred_at >= now() - interval '30 days')::int AS impressions_30d
      FROM public.ad_events
      WHERE event_type = 'impression'
        AND occurred_at >= now() - interval '30 days'
      GROUP BY placement
    `;

    let ruleRows = [];
    try {
      ruleRows = await sql`
        SELECT placement, every_n_items, session_cap_24h, enabled
        FROM public.ad_placement_rules
        WHERE placement IN ('playback', 'playlist', 'scraps', 'sale')
      `;
    } catch (error) {
      if (!/ad_placement_rules/i.test(String(error?.message || ''))) throw error;
    }

    const campaigns = campaignRows.map((row) => row.campaign).filter(Boolean).map(campaignView);
    const events = Object.fromEntries(eventRows.map((row) => [row.placement, row]));
    const rules = Object.fromEntries(ruleRows.map((row) => [row.placement, row]));

    const placementStats = PLACEMENTS.map((placement) => {
      const e = events[placement] || {};
      const impressions7d = safeNumber(e.impressions_7d);
      const impressions30d = safeNumber(e.impressions_30d);
      const avg7d = impressions7d / 7;
      const avg30d = impressions30d / 30;
      const observedDaily = avg7d > 0 ? avg7d : avg30d;
      const safeDaily = observedDaily * 0.8;
      const active = campaigns.filter((c) => c.placements.includes(placement));
      const remaining = active.reduce((sum, c) => sum + c.remaining, 0);
      const fallback = PLACEMENT_DEFAULTS[placement];
      const rule = rules[placement] || {};
      return {
        placement,
        activeCampaigns: active.length,
        remainingImpressions: remaining,
        impressions7d,
        impressions30d,
        observedDaily,
        safeDaily,
        everyNItems: Math.max(1, safeNumber(rule.every_n_items) || fallback.everyNItems),
        sessionCap: Math.max(1, safeNumber(rule.session_cap_24h) || fallback.sessionCap),
        enabled: rule.enabled !== false,
      };
    });

    const totalRemaining = campaigns.reduce((sum, c) => sum + c.remaining, 0);
    const total7d = placementStats.reduce((sum, p) => sum + p.impressions7d, 0);
    const total30d = placementStats.reduce((sum, p) => sum + p.impressions30d, 0);
    const observedDaily = total7d > 0 ? total7d / 7 : total30d / 30;
    const safeDaily = observedDaily * 0.8;
    const pacingLate = campaigns.filter((c) => c.pacingState === 'late').length;
    const pacingWatch = campaigns.filter((c) => c.pacingState === 'watch').length;

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      pacingAlgorithm: 'fair-v2',
      summary: {
        activeCampaigns: campaigns.length,
        totalRemaining,
        impressions7d: total7d,
        impressions30d: total30d,
        observedDaily,
        safeDaily,
        pacingLate,
        pacingWatch,
      },
      placements: placementStats,
      campaigns,
      defaults: {
        packageImpressions: 5000,
        safetyFactor: 0.8,
        forecastDays: 30,
      },
    });
  } catch (error) {
    const notConfigured = error?.code === 'ADS_DB_NOT_CONFIGURED';
    console.error('[ads-capacity]', notConfigured ? 'not_configured' : String(error?.message || error));
    return res.status(notConfigured ? 503 : 500).json({
      ok: false,
      error: notConfigured ? 'ads_database_not_configured' : 'capacity_unavailable',
    });
  }
}
