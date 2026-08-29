import { neon } from '@neondatabase/serverless';

export const SALE_PLACEMENT = 'sale';
export const SALE_DEFAULT_EVERY = 6;
export const SALE_DEFAULT_CAP = 2;

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
}

export function getSql() {
  const url = process.env.ADS_DATABASE_URL;
  if (!url) {
    const error = new Error('ADS database is not configured');
    error.code = 'ADS_DB_NOT_CONFIGURED';
    throw error;
  }
  return neon(url);
}

export function cleanSid(value) {
  const sid = String(value || '').trim().slice(0, 160);
  return /^[A-Za-z0-9_-]{6,160}$/.test(sid) ? sid : '';
}

export function cleanTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24))];
}

export function cleanCampaignId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
}

export async function loadSaleRule(sql) {
  const readRule = async () => {
    const rows = await sql`
      SELECT every_n_items, session_cap_24h, enabled
      FROM public.ad_placement_rules
      WHERE placement = ${SALE_PLACEMENT}
      LIMIT 1
    `;
    return rows[0] || null;
  };

  try {
    let row = await readRule();

    if (!row && process.env.VERCEL_ENV === 'production') {
      await sql`
        INSERT INTO public.ad_placement_rules
          (placement, every_n_items, session_cap_24h, enabled, updated_at)
        VALUES
          (${SALE_PLACEMENT}, ${SALE_DEFAULT_EVERY}, ${SALE_DEFAULT_CAP}, true, now())
        ON CONFLICT (placement) DO NOTHING
      `;
      row = await readRule();
    }

    if (row) {
      return {
        everyNItems: Math.max(1, Number(row.every_n_items || SALE_DEFAULT_EVERY)),
        sessionCap: Math.max(1, Number(row.session_cap_24h || SALE_DEFAULT_CAP)),
        enabled: row.enabled !== false,
        configured: true,
      };
    }
  } catch (error) {
    if (!/ad_placement_rules/i.test(String(error?.message || ''))) throw error;
  }

  return {
    everyNItems: SALE_DEFAULT_EVERY,
    sessionCap: SALE_DEFAULT_CAP,
    enabled: true,
    configured: false,
  };
}

export function normalizeCampaign(campaign) {
  if (!campaign) return null;
  return {
    id: campaign.id,
    title: campaign.title || 'PROMOTED',
    catchText: campaign.catch_text || '',
    description: campaign.description || '',
    storeUrl: campaign.store_url || '',
    targetTags: Array.isArray(campaign.target_tags) ? campaign.target_tags : [],
    mediaUrl: campaign.media_url || '',
    mediaMime: campaign.media_mime || '',
  };
}

export function tagScore(campaign, contextTags) {
  const targets = Array.isArray(campaign?.target_tags) ? campaign.target_tags : [];
  if (!targets.length || !contextTags.length) return 0;
  const context = new Set(contextTags.map((x) => x.toLocaleLowerCase('ja-JP')));
  return targets.reduce((score, tag) => score + (context.has(String(tag).toLocaleLowerCase('ja-JP')) ? 1 : 0), 0);
}

export async function frequencyCount(sql, campaignId, sid) {
  if (!sid) return 0;
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM public.ad_events
    WHERE campaign_id = ${campaignId}::uuid
      AND event_type = 'impression'
      AND placement = ${SALE_PLACEMENT}
      AND session_key = ${sid}
      AND occurred_at >= now() - interval '24 hours'
  `;
  return Number(rows[0]?.n || 0);
}
