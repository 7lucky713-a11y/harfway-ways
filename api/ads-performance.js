const ADMIN_CAMPAIGNS_URL = 'https://harfway-ads-admin.vercel.app/api/admin/campaigns';
const ADMIN_URL = 'https://harfway-ads-admin.vercel.app';
const COOKIE_NAME = '__Host-hw_ads_session';

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

function getCookie(req, name) {
  const source = String(req.headers.cookie || '');
  for (const part of source.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1)); } catch { return ''; }
  }
  return '';
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

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

function statusLabel(value) {
  const status = String(value || '');
  const labels = {
    draft: '下書き',
    scheduled: '配信予約',
    active: '配信中',
    paused: '一時停止',
    completed: '配信終了',
  };
  return labels[status] || status || '—';
}

function normalizeCampaign(campaign) {
  const target = toNumber(firstValue(
    campaign.impression_limit,
    campaign.impressionsTarget,
    campaign.impressionTarget,
    campaign.targetImpressions,
    campaign.target,
  ));
  const served = toNumber(firstValue(
    campaign.impressions,
    campaign.impressionsServed,
    campaign.servedImpressions,
    campaign.delivered,
  ));
  const clicks = toNumber(firstValue(campaign.clicks, campaign.clickCount));
  const explicitRemaining = toNumber(firstValue(
    campaign.remaining_impressions,
    campaign.remainingImpressions,
    campaign.impressionsRemaining,
    campaign.remaining,
  ));
  const remaining = explicitRemaining ?? (target !== null && served !== null ? Math.max(target - served, 0) : null);
  const explicitCtr = toNumber(firstValue(campaign.ctr, campaign.clickThroughRate));
  const ctr = explicitCtr ?? (served && clicks !== null ? (clicks / served) * 100 : served === 0 ? 0 : null);

  return {
    id: String(firstValue(campaign.id, campaign.campaignId, campaign.slug, '')),
    name: String(firstValue(campaign.name, campaign.campaignName, campaign.title, '名称未設定')),
    advertiser: String(firstValue(campaign.advertiser_name, campaign.advertiserName, campaign.advertiser, campaign.clientName, '—')),
    status: statusLabel(firstValue(campaign.status, campaign.campaignStatus)),
    statusRaw: String(firstValue(campaign.status, campaign.campaignStatus, '')),
    placement: normalizePlacement(firstValue(campaign.placement_keys, campaign.placements, campaign.placement, campaign.placementName)),
    impressionsTarget: target,
    impressionsServed: served,
    remainingImpressions: remaining,
    clicks,
    ctr,
    storeVisits: toNumber(firstValue(campaign.store_visits, campaign.storeVisits)),
    startsAt: firstValue(campaign.starts_at, campaign.startsAt, null),
    endsAt: firstValue(campaign.ends_at, campaign.endsAt, null),
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
  const activeCampaigns = campaigns.filter((campaign) => /^(active|running|delivering|live)$/i.test(campaign.statusRaw) || campaign.status === '配信中').length;

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

  const sessionToken = getCookie(req, COOKIE_NAME);
  if (!sessionToken) {
    return res.status(200).json({
      ok: true,
      status: 'protected',
      reason: 'admin_auth_required',
      adminUrl: ADMIN_URL,
      generatedAt: new Date().toISOString(),
    });
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
        'x-harfway-admin-session': sessionToken,
        'user-agent': 'HARF-WAY-ADS-HUB/1.0',
      },
    });

    if (response.status === 401 || response.status === 403) {
      clearSessionCookie(res);
      return res.status(200).json({
        ok: true,
        status: 'protected',
        reason: 'session_expired',
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
      authenticated: true,
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
