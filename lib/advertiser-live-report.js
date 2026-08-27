const ADMIN_LOGIN_URL = 'https://harfway-ads-admin.vercel.app/api/admin/login';
const ADMIN_CAMPAIGNS_URL = 'https://harfway-ads-admin.vercel.app/api/admin/campaigns';

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ja-JP');
}

function dateOnly(value) {
  if (!value) return '';
  const text = String(value);
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return iso || text;
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
    return String(firstValue(value.name, value.placement, value.key, '—'));
  }
  return String(value || '—');
}

function advertiserIdentity(campaign) {
  const id = firstValue(
    campaign?.advertiserId,
    campaign?.advertiser_id,
    campaign?.advertiser?.id,
    campaign?.clientId,
    campaign?.client_id,
    campaign?.client?.id,
    campaign?.ownerId,
    campaign?.owner_id,
    campaign?.owner?.id,
  );

  const name = firstValue(
    campaign?.advertiserName,
    campaign?.advertiser_name,
    typeof campaign?.advertiser === 'string' ? campaign.advertiser : campaign?.advertiser?.name,
    campaign?.clientName,
    campaign?.client_name,
    campaign?.client?.name,
    campaign?.ownerName,
    campaign?.owner_name,
    campaign?.owner?.name,
  );

  return {
    id: id === undefined || id === null ? '' : String(id),
    name: name === undefined || name === null ? '' : String(name),
  };
}

function belongsToAdvertiser(campaign, session) {
  const identity = advertiserIdentity(campaign);
  const sessionId = normalizeText(session?.sub);
  const sessionName = normalizeText(session?.name);

  if (identity.id && sessionId && normalizeText(identity.id) === sessionId) return true;
  if (identity.name && sessionName && normalizeText(identity.name) === sessionName) return true;

  // Fail closed: campaigns without a positive advertiser match are never returned.
  return false;
}

function normalizeCampaign(campaign) {
  const target = toNumber(firstValue(
    campaign?.impressionsTarget,
    campaign?.impressionTarget,
    campaign?.targetImpressions,
    campaign?.target,
  ));
  const served = toNumber(firstValue(
    campaign?.impressionsServed,
    campaign?.impressions,
    campaign?.servedImpressions,
    campaign?.delivered,
  ));
  const clicks = toNumber(firstValue(campaign?.clicks, campaign?.clickCount));

  return {
    id: String(firstValue(campaign?.id, campaign?.campaignId, campaign?.slug, '')),
    name: String(firstValue(campaign?.campaignName, campaign?.name, campaign?.title, '名称未設定')),
    status: String(firstValue(campaign?.campaignStatus, campaign?.status, '—')),
    placement: normalizePlacement(firstValue(campaign?.placements, campaign?.placement, campaign?.placementName)),
    impressionsTarget: target,
    impressionsServed: served,
    clicks,
    startDate: dateOnly(firstValue(campaign?.startDate, campaign?.startsAt, campaign?.start_at, campaign?.start)),
    endDate: dateOnly(firstValue(campaign?.endDate, campaign?.endsAt, campaign?.end_at, campaign?.end)),
  };
}

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'HARF-WAY-ADVERTISER-PORTAL/1.0',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

function adminKey() {
  return process.env.ADS_ADVERTISER_ADMIN_KEY
    || process.env.ADS_ADMIN_KEY
    || process.env.HARFWAY_ADS_ADMIN_KEY
    || '';
}

export async function fetchLiveAdvertiserReport(session) {
  if (!session || session.demo) return { attempted: false, report: null };

  const key = adminKey();
  if (!key) return { attempted: false, report: null };

  try {
    const login = await fetchJson(ADMIN_LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key }),
    });

    if (!login.response.ok) {
      return { attempted: true, report: null };
    }

    const sessionToken = typeof login.payload?.sessionToken === 'string'
      ? login.payload.sessionToken
      : '';
    if (!sessionToken) return { attempted: true, report: null };

    const result = await fetchJson(ADMIN_CAMPAIGNS_URL, {
      method: 'GET',
      headers: { 'x-harfway-admin-session': sessionToken },
    });

    if (!result.response.ok) {
      return { attempted: true, report: null };
    }

    const campaigns = extractCampaigns(result.payload)
      .filter((campaign) => belongsToAdvertiser(campaign, session))
      .map(normalizeCampaign);

    return {
      attempted: true,
      report: {
        advertiser: { id: session.sub, name: session.name },
        dataState: 'configured',
        campaigns,
      },
    };
  } catch {
    return { attempted: true, report: null };
  }
}
