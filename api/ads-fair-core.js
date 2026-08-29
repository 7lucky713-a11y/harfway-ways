import { neon } from '@neondatabase/serverless';

export const PLACEMENT_DEFAULTS = {
  playback: { everyNItems: 4, sessionCap: 2 },
  playlist: { everyNItems: 4, sessionCap: 2 },
  scraps: { everyNItems: 3, sessionCap: 2 },
  sale: { everyNItems: 6, sessionCap: 2 },
};

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

export function cleanPlacement(value) {
  const placement = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(PLACEMENT_DEFAULTS, placement) ? placement : '';
}

export function cleanSid(value) {
  const sid = String(value || '').trim().slice(0, 160);
  return /^[A-Za-z0-9_-]{6,160}$/.test(sid) ? sid : '';
}

export function cleanTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24))];
}

export async function loadRule(sql, placement) {
  const fallback = PLACEMENT_DEFAULTS[placement];
  try {
    const rows = await sql`
      SELECT every_n_items, session_cap_24h, enabled
      FROM public.ad_placement_rules
      WHERE placement = ${placement}
      LIMIT 1
    `;
    const row = rows[0];
    if (row) {
      return {
        everyNItems: Math.max(1, Number(row.every_n_items || fallback.everyNItems)),
        sessionCap: Math.max(1, Number(row.session_cap_24h || fallback.sessionCap)),
        enabled: row.enabled !== false,
        configured: true,
      };
    }
  } catch (error) {
    if (!/ad_placement_rules/i.test(String(error?.message || ''))) throw error;
  }
  return { ...fallback, enabled: true, configured: false };
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
  const context = new Set(contextTags.map((x) => String(x).toLocaleLowerCase('ja-JP')));
  return targets.reduce((score, tag) => score + (context.has(String(tag).toLocaleLowerCase('ja-JP')) ? 1 : 0), 0);
}

export function actualProgress(campaign) {
  const limit = Math.max(1, Number(campaign?.impression_limit || 1));
  return Math.min(1, Math.max(0, Number(campaign?.impressions || 0) / limit));
}

export function expectedProgress(campaign, now = Date.now()) {
  const start = new Date(campaign?.created_at || 0).getTime();
  const end = campaign?.end_date ? new Date(`${campaign.end_date}T23:59:59Z`).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function pacingGap(campaign, now = Date.now()) {
  const expected = expectedProgress(campaign, now);
  const actual = actualProgress(campaign);
  return expected === null ? -actual : expected - actual;
}

export function compareCandidates(a, b, contextTags, now = Date.now()) {
  const tag = tagScore(b, contextTags) - tagScore(a, contextTags);
  if (tag) return tag;

  const gap = pacingGap(b, now) - pacingGap(a, now);
  if (Math.abs(gap) > 0.000001) return gap;

  const progress = actualProgress(a) - actualProgress(b);
  if (Math.abs(progress) > 0.000001) return progress;

  const createdA = new Date(a?.created_at || 0).getTime() || 0;
  const createdB = new Date(b?.created_at || 0).getTime() || 0;
  if (createdA !== createdB) return createdA - createdB;

  return Math.random() - 0.5;
}

export async function frequencyCount(sql, campaignId, placement, sid) {
  if (!sid) return 0;
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM public.ad_events
    WHERE campaign_id = ${campaignId}::uuid
      AND event_type = 'impression'
      AND placement = ${placement}
      AND session_key = ${sid}
      AND occurred_at >= now() - interval '24 hours'
  `;
  return Number(rows[0]?.n || 0);
}
