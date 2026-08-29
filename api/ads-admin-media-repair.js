import { getSql } from './ads-fair-core.js';

const AUTH_UPSTREAM = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const TRUSTED_ORIGIN = 'https://harfway-playback.vercel.app';
const ADS_MEDIA_API = 'https://design-stock-harf-way.vercel.app/api/ads-media';
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);

function readableError(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === 'object') {
    for (const key of ['message', 'error', 'detail', 'details', 'hint', 'code']) {
      const nested = value?.[key];
      const text = readableError(nested);
      if (text) return text;
    }
    try { return JSON.stringify(value); } catch {}
  }
  return String(value);
}

function decodeJwtPayload(authorization) {
  try {
    const token = String(authorization || '').replace(/^Bearer\s+/i, '');
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function sessionAuthorization(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const response = await fetch(`${AUTH_UPSTREAM}/get-session`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      cookie: String(cookie),
      origin: TRUSTED_ORIGIN,
      referer: `${TRUSTED_ORIGIN}/ads-admin/`,
      'user-agent': req.headers['user-agent'] || 'HARF-WAY-ADS-Media-Repair/1.2'
    },
    redirect: 'manual'
  });
  if (!response.ok) return null;
  const jwt = response.headers.get('set-auth-jwt');
  return jwt ? `Bearer ${jwt}` : null;
}

function parseLegacy(row) {
  const declaredMime = String(row?.mime_type || row?.media_mime || '').toLowerCase();
  const fileName = String(row?.file_name || 'legacy-media');

  if (typeof row?.data_base64 === 'string' && row.data_base64.trim()) {
    const source = row.data_base64.trim();
    const match = source.match(/^data:([^;,]+);base64,(.+)$/s);
    const mime = String(match?.[1] || declaredMime).toLowerCase();
    const base64 = match?.[2] || source;
    if (!SUPPORTED.has(mime)) return null;
    const bytes = Buffer.from(base64, 'base64');
    return { bytes, mime, fileName };
  }

  if (typeof row?.data_url === 'string' && row.data_url.trim()) {
    const match = row.data_url.trim().match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return null;
    const mime = String(match[1] || declaredMime).toLowerCase();
    if (!SUPPORTED.has(mime)) return null;
    return { bytes: Buffer.from(match[2], 'base64'), mime, fileName };
  }

  return null;
}

async function mediaApi(action, authorization, body) {
  const response = await fetch(`${ADS_MEDIA_API}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readableError(data?.error) || readableError(data?.message) || `R2 ${action} failed (${response.status})`);
  }
  return data;
}

async function uploadToR2(media, campaignId, authorization, setStage) {
  const metadata = {
    campaignId,
    fileName: media.fileName,
    contentType: media.mime,
    size: media.bytes.byteLength
  };

  const max = media.mime.startsWith('video/') ? 10 * 1024 * 1024 : 3 * 1024 * 1024;
  if (!media.bytes.byteLength || media.bytes.byteLength > max) {
    throw new Error(media.mime.startsWith('video/') ? '動画は10MBまでです。' : '画像は3MBまでです。');
  }

  setStage('r2_start');
  const started = await mediaApi('start', authorization, metadata);
  const uploadId = String(started?.uploadId || '');
  if (!uploadId) throw new Error('R2アップロードを開始できませんでした。');
  const chunkBytes = Math.max(1, Number(started?.chunkBytes || 2500000));
  const parts = Math.ceil(media.bytes.byteLength / chunkBytes);

  for (let index = 0; index < parts; index += 1) {
    setStage(`r2_part_${index + 1}`);
    const part = index + 1;
    const start = index * chunkBytes;
    const end = Math.min(media.bytes.byteLength, start + chunkBytes);
    const response = await fetch(`${ADS_MEDIA_API}?action=part`, {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': media.mime,
        'X-Campaign-Id': campaignId,
        'X-Upload-Id': uploadId,
        'X-Part-Number': String(part)
      },
      body: media.bytes.subarray(start, end)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(readableError(data?.error) || readableError(data?.message) || `R2 part failed (${response.status})`);
    }
  }

  setStage('r2_complete');
  return mediaApi('complete', authorization, { ...metadata, uploadId, parts });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false, error: 'not_found' });

  let stage = 'start';
  const setStage = (value) => {
    stage = value;
    console.log(`[ads-admin-media-repair] stage=${value}`);
  };

  try {
    const campaignId = String(req.body?.campaignId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
      return res.status(400).json({ ok: false, error: 'invalid_campaign' });
    }

    setStage('session');
    const authorization = await sessionAuthorization(req);
    if (!authorization) return res.status(401).json({ ok: false, error: 'session_required' });
    const payload = decodeJwtPayload(authorization);
    const userId = String(payload?.sub || '');
    if (!userId) return res.status(401).json({ ok: false, error: 'invalid_session' });

    setStage('admin_check');
    const sql = getSql();
    const adminRows = await sql`
      SELECT role
      FROM neon_auth."user"
      WHERE id::text = ${userId}
      LIMIT 1
    `;
    if (String(adminRows[0]?.role || '') !== 'admin') {
      return res.status(403).json({ ok: false, error: 'admin_required' });
    }

    setStage('campaign_lookup');
    const campaigns = await sql`
      SELECT id::text AS id, title, media_url, media_mime
      FROM public.ad_campaigns
      WHERE id = ${campaignId}::uuid
      LIMIT 1
    `;
    const campaign = campaigns[0];
    if (!campaign) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
    if (campaign.media_url) {
      return res.status(200).json({ ok: true, alreadyRepaired: true, mediaUrl: campaign.media_url, mediaMime: campaign.media_mime || '' });
    }

    setStage('legacy_lookup');
    const rows = await sql`
      SELECT *
      FROM public.ad_media
      WHERE campaign_id = ${campaignId}::uuid
      LIMIT 20
    `;
    let media = null;
    for (const row of rows) {
      media = parseLegacy(row);
      if (media) break;
    }
    if (!media) return res.status(404).json({ ok: false, error: 'legacy_media_not_found' });

    const completed = await uploadToR2(media, campaignId, authorization, setStage);

    setStage('verify_campaign');
    const afterRows = await sql`
      SELECT media_url, media_mime
      FROM public.ad_campaigns
      WHERE id = ${campaignId}::uuid
      LIMIT 1
    `;
    let mediaUrl = String(afterRows[0]?.media_url || completed?.url || completed?.mediaUrl || completed?.publicUrl || '');
    let mediaMime = String(afterRows[0]?.media_mime || completed?.mime || media.mime || '');

    if (!afterRows[0]?.media_url && mediaUrl) {
      setStage('campaign_update');
      await sql`
        UPDATE public.ad_campaigns
        SET media_url = ${mediaUrl}, media_mime = ${mediaMime}, updated_at = now()
        WHERE id = ${campaignId}::uuid
      `;
    }

    if (!mediaUrl) throw new Error('R2保存後の公開URLを確認できませんでした。');

    console.log(`[ads-admin-media-repair] success mime=${mediaMime} legacyPreserved=true`);
    return res.status(200).json({ ok: true, mediaUrl, mediaMime, legacyPreserved: true });
  } catch (error) {
    const message = readableError(error) || 'repair_failed';
    const diagnostic = {
      stage,
      message,
      code: readableError(error?.code),
      detail: readableError(error?.detail),
      hint: readableError(error?.hint)
    };
    console.error(`[ads-admin-media-repair] failed ${JSON.stringify(diagnostic)}`);
    return res.status(500).json({ ok: false, error: 'repair_failed', message, stage });
  }
}
