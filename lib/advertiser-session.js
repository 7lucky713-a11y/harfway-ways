import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADVERTISER_COOKIE = '__Host-hw_ads_advertiser';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const isProduction = () => process.env.VERCEL_ENV === 'production';

function sessionSecret() {
  const configured = process.env.ADS_ADVERTISER_SESSION_SECRET;
  if (configured) return configured;
  if (!isProduction()) return 'harfway-advertiser-preview-demo-v1';
  return '';
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createAdvertiserSession(advertiser) {
  const secret = sessionSecret();
  if (!secret) throw new Error('advertiser_session_secret_missing');

  const payload = {
    sub: String(advertiser.id),
    name: String(advertiser.name || advertiser.id),
    demo: Boolean(advertiser.demo),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyAdvertiserSession(token) {
  const secret = sessionSecret();
  if (!secret || typeof token !== 'string') return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readAdvertiserCookie(req) {
  const raw = String(req.headers?.cookie || '');
  const cookies = raw.split(';').map((part) => part.trim());
  const prefix = `${ADVERTISER_COOKIE}=`;
  const item = cookies.find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

export function advertiserCookieHeader(token) {
  return `${ADVERTISER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearAdvertiserCookieHeader() {
  return `${ADVERTISER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function resolveAdvertiserByCode(code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  const normalized = code.trim();

  try {
    const configured = JSON.parse(process.env.ADS_ADVERTISER_CODES || '{}');
    const entry = configured?.[normalized];
    if (entry && typeof entry === 'object') {
      const id = entry.id || entry.advertiserId;
      if (id) return { id: String(id), name: String(entry.name || entry.advertiserName || id), demo: false };
    }
  } catch {
    // Invalid configuration is handled as no match; never expose config details to the client.
  }

  if (!isProduction() && normalized === 'HARFWAY-DEMO') {
    return { id: 'demo-studio', name: 'HARF-WAY DEMO STUDIO', demo: true };
  }

  return null;
}

export function getAdvertiserReport(session) {
  if (!session) return null;

  if (session.demo) {
    return {
      advertiser: { id: session.sub, name: session.name },
      dataState: 'demo',
      campaigns: [
        {
          id: 'demo-001',
          name: 'WAYS スポンサード枠',
          status: '配信中',
          placement: 'WAYS / 切れ端',
          impressionsTarget: 5000,
          impressionsServed: 3280,
          clicks: 146,
          startDate: '2026-08-20',
          endDate: '2026-09-05',
        },
        {
          id: 'demo-002',
          name: 'プレイリスト特集枠',
          status: '終了',
          placement: 'プレイリスト',
          impressionsTarget: 3000,
          impressionsServed: 3000,
          clicks: 112,
          startDate: '2026-08-01',
          endDate: '2026-08-18',
        },
      ],
    };
  }

  try {
    const reports = JSON.parse(process.env.ADS_ADVERTISER_REPORTS || '{}');
    const report = reports?.[session.sub];
    if (report && typeof report === 'object') {
      return {
        advertiser: { id: session.sub, name: session.name },
        dataState: 'configured',
        campaigns: Array.isArray(report.campaigns) ? report.campaigns : [],
      };
    }
  } catch {
    // Fall through to an empty report without exposing configuration details.
  }

  return {
    advertiser: { id: session.sub, name: session.name },
    dataState: 'waiting_for_data',
    campaigns: [],
  };
}

export function summarizeAdvertiserCampaigns(campaigns = []) {
  const normalized = campaigns.map((campaign) => {
    const target = Number(campaign.impressionsTarget || 0);
    const served = Number(campaign.impressionsServed || 0);
    const clicks = Number(campaign.clicks || 0);
    return {
      ...campaign,
      impressionsTarget: Number.isFinite(target) ? target : 0,
      impressionsServed: Number.isFinite(served) ? served : 0,
      clicks: Number.isFinite(clicks) ? clicks : 0,
      remainingImpressions: Math.max((Number.isFinite(target) ? target : 0) - (Number.isFinite(served) ? served : 0), 0),
      ctr: served > 0 ? (clicks / served) * 100 : 0,
    };
  });

  const totals = normalized.reduce((acc, campaign) => {
    acc.impressionsTarget += campaign.impressionsTarget;
    acc.impressionsServed += campaign.impressionsServed;
    acc.clicks += campaign.clicks;
    acc.remainingImpressions += campaign.remainingImpressions;
    if (/配信中|active|running|live/i.test(String(campaign.status || ''))) acc.activeCampaigns += 1;
    return acc;
  }, { impressionsTarget: 0, impressionsServed: 0, clicks: 0, remainingImpressions: 0, activeCampaigns: 0 });

  totals.ctr = totals.impressionsServed > 0 ? (totals.clicks / totals.impressionsServed) * 100 : 0;
  return { campaigns: normalized, summary: totals };
}
