import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { authorizeArchiveRequest } from './archive-core.js';

const PREVIEW_WORKING_PREFIX = 'preview/weekly-harfway-drafts/';
const PREVIEW_BASELINE_PREFIX = 'preview/weekly-harfway-generated/';
const PRODUCTION_WORKING_PREFIX = 'production/weekly-harfway-working/';
const PRODUCTION_BASELINE_PREFIX = 'production/weekly-harfway-generated/';
const MAX_BYTES = 300 * 1024;

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

function environmentConfig() {
  const environment = String(process.env.VERCEL_ENV || 'development');
  if (environment === 'preview') {
    return {
      environment,
      workingPrefix: PREVIEW_WORKING_PREFIX,
      baselinePrefix: PREVIEW_BASELINE_PREFIX,
      authRequired: false
    };
  }
  if (environment === 'production') {
    return {
      environment,
      workingPrefix: PRODUCTION_WORKING_PREFIX,
      baselinePrefix: PRODUCTION_BASELINE_PREFIX,
      authRequired: true
    };
  }
  const error = new Error('weekly_storage_environment_not_supported');
  error.status = 403;
  throw error;
}

function ensureSameOrigin(req) {
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

function client() {
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

function normalizeWeek(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const key = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? key : '';
}

function objectKey(prefix, week) {
  return `${prefix}${week}.json`;
}

function isMissing(error) {
  const name = String(error?.name || '');
  const status = Number(error?.$metadata?.httpStatusCode || 0);
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

async function readRecord(prefix, week) {
  try {
    const out = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey(prefix, week) }));
    if (!out.Body) return null;
    const raw = await out.Body.transformToString();
    return JSON.parse(raw);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function writeDraft(config, week, draft) {
  const savedAt = new Date().toISOString();
  const record = {
    schema: 'weekly-harfway-draft-v1',
    environment: config.environment,
    scope: 'working-draft',
    week,
    savedAt,
    draft
  };
  const body = JSON.stringify(record);
  if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
    const error = new Error('draft_too_large');
    error.status = 413;
    throw error;
  }
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: objectKey(config.workingPrefix, week),
    Body: body,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store',
    Metadata: { scope: 'weekly-harfway-working', environment: config.environment, week }
  }));
  return record;
}

async function ensureProductionAdmin(req, config) {
  if (!config.authRequired) return;
  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) {
    const error = new Error(auth.error || 'unauthorized');
    error.status = auth.status || 401;
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    const config = environmentConfig();
    await ensureProductionAdmin(req, config);

    const week = normalizeWeek(req.query?.week || parseBody(req)?.week);
    if (!week) return json(res, 400, { ok: false, error: 'valid_week_required' });

    if (req.method === 'GET') {
      const working = await readRecord(config.workingPrefix, week);
      const baseline = working ? null : await readRecord(config.baselinePrefix, week);
      const record = working || baseline;
      const source = working ? 'working-draft' : (baseline ? 'generated-baseline' : 'none');
      return json(res, 200, {
        ok: true,
        environment: config.environment,
        storage: 'r2-weekly',
        workingPrefix: config.workingPrefix,
        baselinePrefix: config.baselinePrefix,
        week,
        found: Boolean(record),
        source,
        fallbackUsed: Boolean(!working && baseline),
        record
      });
    }

    if (req.method === 'POST') {
      ensureSameOrigin(req);
      const body = parseBody(req);
      const draft = body?.draft;
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        return json(res, 400, { ok: false, error: 'draft_required' });
      }
      const record = await writeDraft(config, week, draft);
      return json(res, 200, {
        ok: true,
        environment: config.environment,
        storage: 'r2-working-draft',
        prefix: config.workingPrefix,
        week,
        savedAt: record.savedAt
      });
    }

    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[weekly-harfway-draft-store]', error?.message || error);
    return json(res, error?.status || 500, {
      ok: false,
      error: error?.message || 'weekly_harfway_draft_store_failed',
      environment: process.env.VERCEL_ENV || 'development'
    });
  }
}
