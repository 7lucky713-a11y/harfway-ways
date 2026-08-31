import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import weeklyDraftHandler from './weekly-harfway-draft.js';

const TEST_PREFIX = 'preview/weekly-harfway-cron-tests/';
const MAX_BYTES = 300 * 1024;

function send(res, status, body) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.json(body);
}

function ensurePreview(req) {
  if (process.env.VERCEL_ENV !== 'preview') {
    const error = new Error('preview_only_cron_test');
    error.status = 403;
    throw error;
  }
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

function r2Client() {
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

function r2Bucket() {
  const value = String(process.env.R2_BUCKET || '').trim();
  if (!value) throw new Error('r2_bucket_not_configured');
  return value;
}

function keyFor(week) {
  return `${TEST_PREFIX}${week}.json`;
}

async function invoke(handler, req) {
  let statusCode = 200;
  let body = null;
  const headers = {};
  const res = {
    status(code) { statusCode = code; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    json(value) { body = value; return res; },
    end() { return res; }
  };
  await handler(req, res);
  return { statusCode, body, headers };
}

async function generateDraft(req) {
  const generated = await invoke(weeklyDraftHandler, {
    method: 'GET',
    headers: { host: String(req.headers.host || '') },
    query: {},
    body: null
  });
  if (generated.statusCode !== 200 || !generated.body?.ok) {
    throw new Error(generated.body?.error || `draft_generate_http_${generated.statusCode}`);
  }
  return generated.body;
}

async function writeTestRecord(generated) {
  const week = String(generated.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('generated_week_invalid');
  const savedAt = new Date().toISOString();
  const record = {
    schema: 'weekly-harfway-cron-preview-v1',
    environment: 'preview',
    mode: 'cron-preview-test',
    browserStateUsed: false,
    week,
    savedAt,
    generatedAt: generated.generatedAt || '',
    range: generated.range || null,
    boardMeta: generated.boardMeta || null,
    sources: generated.sources || null,
    warnings: generated.warnings || [],
    draft: generated.draft || null
  };
  const raw = JSON.stringify(record);
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
    const error = new Error('cron_test_record_too_large');
    error.status = 413;
    throw error;
  }
  await r2Client().send(new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: keyFor(week),
    Body: raw,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store',
    Metadata: { scope: 'weekly-harfway-cron-preview', week }
  }));
  return record;
}

async function readTestRecord(week) {
  const out = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: keyFor(week) }));
  if (!out.Body) throw new Error('cron_test_readback_empty');
  return JSON.parse(await out.Body.transformToString());
}

function sameIds(a, b) {
  return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });

  try {
    ensurePreview(req);

    const generated = await generateDraft(req);
    const written = await writeTestRecord(generated);
    const readback = await readTestRecord(written.week);

    const readbackVerified = Boolean(
      readback &&
      readback.schema === written.schema &&
      readback.environment === 'preview' &&
      readback.browserStateUsed === false &&
      readback.week === written.week &&
      sameIds(readback.draft?.updateIds, written.draft?.updateIds) &&
      sameIds(readback.draft?.requiredScrapIds, written.draft?.requiredScrapIds)
    );

    if (!readbackVerified) throw new Error('cron_test_readback_mismatch');

    return send(res, 200, {
      ok: true,
      mode: 'cron-preview-test',
      cronReady: true,
      browserStateUsed: false,
      productionScheduleEnabled: false,
      productionMutationEnabled: false,
      week: written.week,
      savedAt: written.savedAt,
      storage: 'r2-preview-cron-test-prefix',
      prefix: TEST_PREFIX,
      readbackVerified: true,
      range: written.range,
      boardMeta: written.boardMeta,
      sources: written.sources,
      warnings: written.warnings,
      note: 'Preview test only. Canonical weekly draft is not overwritten. vercel.json Cron is not registered.'
    });
  } catch (error) {
    console.error('[weekly-harfway-cron]', error?.message || error);
    return send(res, error?.status || 500, {
      ok: false,
      error: error?.message || 'weekly_harfway_cron_test_failed',
      environment: process.env.VERCEL_ENV || 'development',
      productionScheduleEnabled: false,
      productionMutationEnabled: false
    });
  }
}
