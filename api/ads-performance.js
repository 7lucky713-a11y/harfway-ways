const ADMIN_CAMPAIGNS_URL = 'https://harfway-ads-admin.vercel.app/api/admin/campaigns';
const ADMIN_URL = 'https://harfway-ads-admin.vercel.app';

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

function extractCampaigns(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.campaigns)) return payload.campaigns;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.campaigns)) return payload.data.campaigns;
  return [];
}

function normalizePlacement(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'string' ? item : firstValue(item?.name, item?.placement, item?.key))
      .filter(Boolean)
      .join(' / ');
  }
  if (value && typeof value === 'object') {
    return firstValue(value.name, value.placement, value.key, '—');
  }
  return value || '—';
}

function normalizeCampaign(campaign) {
  const target = toNumber(firstValue(campaign.impressionsTarget, campaign.impressionTarget, campaign.targetImpressions, campaign.target));
  const served = toNumber(firstValue(campaign.impressionsServed, campaign.impressions, campaign.servedImpressions, campaign.delivered));
  const clicks = toNumber(firstValue(campaign.clicks, campaign.clickCount));
  const explicitRemaining = toNumber(firstValue(campaign.remainingImpressions, campaign.impressionsRemaining, campaign.remaining));
  const remaining = explicitRemaining ?? (target !== null && served !== null ? Math.max(target - served, 0) : null);
  const explicitCtr = toNumber(firstValue(campaign.ctr, campaign.clickThroughRate));
  const ctr = explicitCtr ?? (served && clicks !== null ? (clicks / served) * 100 : served === 0 ? 0 : null);

  return {
    id: String(firstValue(campaign.id, campaign.campaignId, campaign.slug, '')),
    name: String(firstValue(campaign.campaignName, campaign.name, campaign.title, '名称未設定')),
    advertiser: String(firstValue(campaign.advertiserName, campaign.advertiser, campaign.clientName, '—')),
    status: String(firstValue(campaign.campaignStatus, campaign.status, '—')),
    placement: normalizePlacement(firstValue(campaign.placements, campaign.placement, campaign.placementName)),
    impressionsTarget: target,
    impressionsServed: served,
    remainingImpressions: remaining,
    clicks,
    ctr,
  };
}

function buildSummary(campaigns) {
  const sum = (key) => campaigns.reduce((total, campaign) => {
    const value = campaign[key];
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);

  const impressions = sum('impressionsServed');
  const clicks = sum('clicks');
  const remaining = sum('remainingImpressions');
  const activePattern = /active|running|delivering|live|配信中|配信予約/i;
  const activeCampaigns = campaigns.filter((campaign) => activePattern.test(campaign.status)).length;

  return {
    activeCampaigns,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    remainingImpressions: remaining,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, status: 'error', error: 'method_not_allowed' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(ADMIN_CAMPAIGNS_URL, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'HARF-WAY-ADS-HUB/1.0',
      },
    });

    if (response.status === 401 || response.status === 403) {
      return res.status(200).json({
        ok: true,
        status: 'protected',
        reason: 'admin_auth_required',
        adminUrl: ADMIN_URL,
        generatedAt: new Date().toISOString(),
      });
    }

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        status: 'unavailable',
        upstreamStatus: response.status,
        adminUrl: ADMIN_URL,
        generatedAt: new Date().toISOString(),
      });
    }

    const payload = await response.json();
    const campaigns = extractCampaigns(payload).map(normalizeCampaign);

    return res.status(200).json({
      ok: true,
      status: 'available',
      generatedAt: new Date().toISOString(),
      adminUrl: ADMIN_URL,
      summary: buildSummary(campaigns),
      campaigns,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      status: 'unavailable',
      error: error?.name === 'AbortError' ? 'timeout' : 'upstream_error',
      adminUrl: ADMIN_URL,
      generatedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timer);
  }
}
