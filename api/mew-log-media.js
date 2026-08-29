import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', kind: 'image', max: 8 * 1024 * 1024 },
  'image/png': { ext: 'png', kind: 'image', max: 8 * 1024 * 1024 },
  'image/webp': { ext: 'webp', kind: 'image', max: 8 * 1024 * 1024 },
  'image/gif': { ext: 'gif', kind: 'image', max: 8 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', kind: 'video', max: 20 * 1024 * 1024 },
  'video/webm': { ext: 'webm', kind: 'video', max: 20 * 1024 * 1024 }
};
const MAX_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 2_500_000;
const MAX_PARTS = Math.ceil(MAX_BYTES / CHUNK_BYTES);
const STALE_MS = 24 * 60 * 60 * 1000;

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(status).json(body);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

function safeName(value) {
  return String(value || 'media').replace(/[\u0000-\u001f]/g, '').slice(0, 180) || 'media';
}

function cleanUploadId(value) {
  const s = String(value || '');
  return /^[0-9a-f-]{20,64}$/i.test(s) ? s : '';
}

function envStatus() {
  return {
    accountId: Boolean(process.env.R2_ACCOUNT_ID),
    accessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
    secretKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
    bucket: Boolean(process.env.R2_BUCKET),
    publicBase: Boolean(process.env.R2_PUBLIC_BASE_URL)
  };
}

function ensurePreview() {
  if (process.env.VERCEL_ENV === 'production') {
    const error = new Error('production_disabled');
    error.status = 403;
    throw error;
  }
}

function ensureWriteOrigin(req) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');
  if (!origin || !host) {
    const error = new Error('origin_required');
    error.status = 403;
    throw error;
  }
  let originHost = '';
  try { originHost = new URL(origin).host; } catch {}
  if (!originHost || originHost !== host) {
    const error = new Error('origin_mismatch');
    error.status = 403;
    throw error;
  }
}

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('r2_credentials_not_configured');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function bucket() {
  const value = String(process.env.R2_BUCKET || '').trim();
  if (!value) throw new Error('r2_bucket_not_configured');
  return value;
}

function publicUrl(key) {
  const base = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('r2_public_base_not_configured');
  return `${base}/${key}`;
}

function tempKey(uploadId, part) {
  return `mew-log/tmp/${uploadId}/${part}.part`;
}
function tempPrefix(uploadId) {
  return `mew-log/tmp/${uploadId}/`;
}
function reservationKey(uploadId) {
  return `mew-log/guard/open/${uploadId}.json`;
}
function finalKey(uploadId, ext) {
  return `mew-log/${new Date().toISOString().slice(0, 10)}/${uploadId}.${ext}`;
}

async function readReservation(client, bkt, uploadId) {
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: bkt, Key: reservationKey(uploadId) }));
    if (!obj.Body) return null;
    return JSON.parse(await obj.Body.transformToString());
  } catch {
    return null;
  }
}

function validReservation(value, contentType, size) {
  if (!value || value.contentType !== contentType || Number(value.size) !== Number(size)) return false;
  const created = Date.parse(value.createdAt || '');
  return Number.isFinite(created) && Date.now() - created <= STALE_MS;
}

async function cleanupStale(client, bkt) {
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bkt, Prefix: 'mew-log/guard/open/', MaxKeys: 100 }));
  const keys = [];
  for (const item of listed.Contents || []) {
    if (!item.Key || !item.LastModified || Date.now() - item.LastModified.getTime() <= STALE_MS) continue;
    const uploadId = cleanUploadId((item.Key.split('/').pop() || '').replace(/\.json$/, ''));
    if (uploadId) {
      const parts = await client.send(new ListObjectsV2Command({ Bucket: bkt, Prefix: tempPrefix(uploadId), MaxKeys: MAX_PARTS }));
      for (const part of parts.Contents || []) if (part.Key) keys.push({ Key: part.Key });
    }
    keys.push({ Key: item.Key });
  }
  if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bkt, Delete: { Objects: keys, Quiet: true } }));
}

async function startUpload(req, res) {
  const body = parseBody(req);
  const contentType = String(body.contentType || '').toLowerCase();
  const size = Number(body.size || 0);
  const fileName = safeName(body.fileName);
  const info = MEDIA_TYPES[contentType];
  if (!info) return json(res, 400, { ok: false, error: 'unsupported_media_type' });
  if (!Number.isInteger(size) || size <= 0 || size > info.max) {
    return json(res, 413, { ok: false, error: info.kind === 'video' ? 'video_too_large' : 'image_too_large', maxBytes: info.max });
  }
  const client = r2();
  const bkt = bucket();
  await cleanupStale(client, bkt).catch(() => undefined);
  const uploadId = crypto.randomUUID();
  await client.send(new PutObjectCommand({
    Bucket: bkt,
    Key: reservationKey(uploadId),
    Body: JSON.stringify({ fileName, contentType, size, createdAt: new Date().toISOString() }),
    ContentType: 'application/json',
    CacheControl: 'no-store'
  }));
  return json(res, 200, { ok: true, uploadId, chunkBytes: CHUNK_BYTES, maxBytes: info.max, kind: info.kind });
}

async function putPart(req, res) {
  const uploadId = cleanUploadId(req.headers['x-upload-id']);
  const part = Number(req.headers['x-part-number'] || 0);
  const contentType = String(req.headers['x-content-type'] || '').toLowerCase();
  const size = Number(req.headers['x-file-size'] || 0);
  const info = MEDIA_TYPES[contentType];
  if (!uploadId || !Number.isInteger(part) || part < 1 || part > MAX_PARTS || !info) {
    return json(res, 400, { ok: false, error: 'invalid_part_request' });
  }
  if (!Number.isInteger(size) || size <= 0 || size > info.max) return json(res, 413, { ok: false, error: 'media_too_large' });
  const client = r2();
  const bkt = bucket();
  const reservation = await readReservation(client, bkt, uploadId);
  if (!validReservation(reservation, contentType, size)) return json(res, 409, { ok: false, error: 'upload_session_invalid' });
  const expectedParts = Math.ceil(size / CHUNK_BYTES);
  if (part > expectedParts) return json(res, 400, { ok: false, error: 'unexpected_part' });

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  if (!bytes.length || bytes.length > CHUNK_BYTES) return json(res, 413, { ok: false, error: 'chunk_too_large_or_empty' });
  await client.send(new PutObjectCommand({
    Bucket: bkt,
    Key: tempKey(uploadId, part),
    Body: bytes,
    ContentType: 'application/octet-stream',
    CacheControl: 'no-store'
  }));
  return json(res, 200, { ok: true, part, bytes: bytes.length });
}

async function completeUpload(req, res) {
  const body = parseBody(req);
  const uploadId = cleanUploadId(body.uploadId);
  const contentType = String(body.contentType || '').toLowerCase();
  const size = Number(body.size || 0);
  const parts = Number(body.parts || 0);
  const fileName = safeName(body.fileName);
  const info = MEDIA_TYPES[contentType];
  if (!uploadId || !info || !Number.isInteger(size) || size <= 0 || size > info.max) {
    return json(res, 400, { ok: false, error: 'invalid_upload_metadata' });
  }
  const expectedParts = Math.ceil(size / CHUNK_BYTES);
  if (!Number.isInteger(parts) || parts !== expectedParts || parts < 1 || parts > MAX_PARTS) {
    return json(res, 400, { ok: false, error: 'invalid_part_count' });
  }

  const client = r2();
  const bkt = bucket();
  const reservation = await readReservation(client, bkt, uploadId);
  if (!validReservation(reservation, contentType, size)) return json(res, 409, { ok: false, error: 'upload_session_invalid' });

  const buffers = [];
  const tempObjects = [];
  let total = 0;
  for (let part = 1; part <= parts; part += 1) {
    const key = tempKey(uploadId, part);
    const obj = await client.send(new GetObjectCommand({ Bucket: bkt, Key: key }));
    if (!obj.Body) throw new Error(`missing_part_${part}`);
    const buffer = Buffer.from(await obj.Body.transformToByteArray());
    total += buffer.length;
    if (total > info.max) throw new Error('media_too_large');
    buffers.push(buffer);
    tempObjects.push({ Key: key });
  }
  if (total !== size) throw new Error('uploaded_size_mismatch');

  const key = finalKey(uploadId, info.ext);
  await client.send(new PutObjectCommand({
    Bucket: bkt,
    Key: key,
    Body: Buffer.concat(buffers),
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  await client.send(new DeleteObjectsCommand({ Bucket: bkt, Delete: { Objects: tempObjects, Quiet: true } })).catch(() => undefined);
  await client.send(new DeleteObjectCommand({ Bucket: bkt, Key: reservationKey(uploadId) })).catch(() => undefined);

  return json(res, 200, {
    ok: true,
    mediaUrl: publicUrl(key),
    mediaKey: key,
    mediaType: contentType,
    mediaKind: info.kind,
    mediaSize: size,
    mediaName: fileName
  });
}

async function deleteMedia(req, res) {
  const body = parseBody(req);
  const key = String(body.key || '').trim();
  if (!/^mew-log\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm)$/i.test(key)) {
    return json(res, 400, { ok: false, error: 'invalid_media_key' });
  }
  const client = r2();
  await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  return json(res, 200, { ok: true, deleted: true });
}

export default async function handler(req, res) {
  try {
    ensurePreview();
    if (req.method === 'GET') {
      const flags = envStatus();
      const configured = Object.values(flags).every(Boolean);
      return json(res, configured ? 200 : 503, {
        ok: configured,
        configured,
        env: flags,
        maxImageBytes: 8 * 1024 * 1024,
        maxVideoBytes: 20 * 1024 * 1024,
        chunkBytes: CHUNK_BYTES
      });
    }
    ensureWriteOrigin(req);
    if (req.method === 'POST') {
      const action = String(req.query?.action || '');
      if (action === 'start') return await startUpload(req, res);
      if (action === 'complete') return await completeUpload(req, res);
      return json(res, 400, { ok: false, error: 'unknown_action' });
    }
    if (req.method === 'PUT') return await putPart(req, res);
    if (req.method === 'DELETE') return await deleteMedia(req, res);
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[mew-log-media]', error?.message || error);
    const accessDenied = /access\s*denied/i.test(String(error?.message || '')) || String(error?.name || '') === 'AccessDenied';
    return json(res, accessDenied ? 403 : (error?.status || 500), {
      ok: false,
      error: accessDenied ? 'r2_write_permission_denied' : (error?.message || 'mew_log_media_failed')
    });
  }
}
