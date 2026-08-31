import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import weeklyDraftHandler from './weekly-harfway-draft.js';

const MAX_BYTES = 300 * 1024;
const PREVIEW_BASELINE_PREFIX = 'preview/weekly-harfway-generated/';
const PREVIEW_WORKING_PREFIX = 'preview/weekly-harfway-drafts/';
const PRODUCTION_BASELINE_PREFIX = 'production/weekly-harfway-generated/';
const PRODUCTION_WORKING_PREFIX = 'production/weekly-harfway-working/';

function send(res, status, body) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.json(body);
}

function environment() {
  return String(process.env.VERCEL_ENV || 'development');
}

function ensurePreviewPost(req) {
  if (environment() !== 'preview') {
    const error = new Error('preview_post_only');
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

function ensureProductionCron(req) {
  if (environment() !== 'production') {
    const error = new Error('production_get_only');
    error.status = 403;
    throw error;
  }
  const secret = String(process.env.CRON_SECRET || '');
  const authorization = String(req.headers.authorization || '');
  if (!secret || authorization !== `Bearer ${secret}`) {
    const error = new Error('unauthorized_cron');
    error.status = 401;
    throw error;
  }
}

function modeForRequest(req) {
  if (req.method === 'POST') {
    ensurePreviewPost(req);
    return {
      environment: 'preview',
      mode: 'production-safety-preview',
      baselinePrefix: PREVIEW_BASELINE_PREFIX,
      workingPrefix: PREVIEW_WORKING_PREFIX,
      productionMutationEnabled: false
    };
  }
  if (req.method === 'GET') {
    ensureProductionCron(req);
    return {
      environment: 'production',
      mode: 'production-cron',
      baselinePrefix: PRODUCTION_BASELINE_PREFIX,
      workingPrefix: PRODUCTION_WORKING_PREFIX,
      productionMutationEnabled: true
    };
  }
  const error = new Error('method_not_allowed');
  error.status = 405;
  throw error;
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

function objectKey(prefix, week) {
  return `${prefix}${week}.json`;
}

function isMissing(error) {
  const name = String(error?.name || '');
  const status = Number(error?.$metadata?.httpStatusCode || 0);
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

function sha256(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

async function readObject(prefix, week) {
  try {
    const out = await r2Client().send(new GetObjectCommand({
      Bucket: r2Bucket(),
      Key: objectKey(prefix, week)
    }));
    if (!out.Body) return { found: false, raw: '', record: null, hash: '' };
    const raw = await out.Body.transformToString();
    let record = null;
    try { record = JSON.parse(raw); } catch {}
    return { found: true, raw, record, hash: sha256(raw) };
  } catch (error) {
    if (isMissing(error)) return { found: false, raw: '', record: null, hash: '' };
    throw error;
  }
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

function generatedHash(generated) {
  return sha256(JSON.stringify({
    week: generated.week || '',
    range: generated.range || null,
    draft: generated.draft || null,
    boardMeta: generated.boardMeta || null,
    sources: generated.sources || null
  }));
}

async function writeBaseline(config, generated, previous) {
  const week = String(generated.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('generated_week_invalid');

  const contentHash = generatedHash(generated);
  if (previous?.found && previous.record?.contentHash === contentHash) {
    return { record: previous.record, writePerformed: false, contentChanged: false };
  }

  const savedAt = new Date().toISOString();
  const revision = Math.max(0, Number(previous?.record?.revision || 0)) + 1;
  const record = {
    schema: 'weekly-harfway-generated-v1',
    environment: config.environment,
    scope: 'generated-baseline',
    browserStateUsed: false,
    week,
    revision,
    savedAt,
    generatedAt: generated.generatedAt || '',
    contentHash,
    range: generated.range || null,
    boardMeta: generated.boardMeta || null,
    sources: generated.sources || null,
    warnings: generated.warnings || [],
    draft: generated.draft || null
  };

  const raw = JSON.stringify(record);
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
    const error = new Error('generated_baseline_too_large');
    error.status = 413;
    throw error;
  }

  await r2Client().send(new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: objectKey(config.baselinePrefix, week),
    Body: raw,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store',
    Metadata: { scope: 'weekly-harfway-generated', environment: config.environment, week }
  }));
  return { record, writePerformed: true, contentChanged: true };
}

function sameIds(a, b) {
  return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const config = modeForRequest(req);
    const generated = await generateDraft(req);
    const week = String(generated.week || '').trim();

    const workingBefore = await readObject(config.workingPrefix, week);
    const baselineBefore = await readObject(config.baselinePrefix, week);
    const written = await writeBaseline(config, generated, baselineBefore);
    const baselineReadback = await readObject(config.baselinePrefix, week);
    const workingAfter = await readObject(config.workingPrefix, week);

    const baselineReadbackVerified = Boolean(
      baselineReadback.found &&
      baselineReadback.record &&
      baselineReadback.record.schema === 'weekly-harfway-generated-v1' &&
      baselineReadback.record.scope === 'generated-baseline' &&
      baselineReadback.record.environment === config.environment &&
      baselineReadback.record.week === week &&
      baselineReadback.record.contentHash === written.record.contentHash &&
      sameIds(baselineReadback.record.draft?.updateIds, written.record.draft?.updateIds) &&
      sameIds(baselineReadback.record.draft?.requiredScrapIds, written.record.draft?.requiredScrapIds)
    );

    const workingDraftUntouched = Boolean(
      workingBefore.found === workingAfter.found &&
      workingBefore.hash === workingAfter.hash
    );

    if (!baselineReadbackVerified) throw new Error('generated_baseline_readback_mismatch');
    if (!workingDraftUntouched) throw new Error('working_draft_changed_during_cron_test');

    return send(res, 200, {
      ok: true,
      mode: config.mode,
      cronReady: true,
      productionReady: true,
      browserStateUsed: false,
      authModel: 'Authorization: Bearer CRON_SECRET',
      productionScheduleEnabled: false,
      productionMutationEnabled: config.productionMutationEnabled,
      week,
      revision: written.record.revision,
      savedAt: written.record.savedAt,
      contentHash: written.record.contentHash,
      contentChanged: written.contentChanged,
      writePerformed: written.writePerformed,
      storage: 'r2-generated-baseline',
      baselinePrefix: config.baselinePrefix,
      workingPrefix: config.workingPrefix,
      baselineReadbackVerified: true,
      readbackVerified: true,
      workingDraftUntouched: true,
      workingDraftFound: workingAfter.found,
      range: written.record.range,
      boardMeta: written.record.boardMeta,
      sources: written.record.sources,
      warnings: written.record.warnings,
      recommendedSchedule: {
        note: 'Cron schedule remains disabled until explicit 本番OK. Because Monday-published SCRAPS can arrive later, generated baseline may be safely refreshed more than once without overwriting working drafts.'
      }
    });
  } catch (error) {
    console.error('[weekly-harfway-cron]', error?.message || error);
    return send(res, error?.status || 500, {
      ok: false,
      error: error?.message || 'weekly_harfway_cron_failed',
      environment: environment(),
      productionScheduleEnabled: false,
      productionMutationEnabled: false
    });
  }
}
