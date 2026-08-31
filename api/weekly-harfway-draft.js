import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { authorizeArchiveRequest } from './archive-core.js';

const JST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_WORKING_PREFIX = 'preview/weekly-harfway-drafts/';
const PRODUCTION_WORKING_PREFIX = 'production/weekly-harfway-working/';

function send(res, status, body) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.json(body);
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function mondayRange(now = new Date()) {
  const shifted = new Date(now.getTime() + JST_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const mondayLocalAsUtc = Date.UTC(y, m, d - daysSinceMonday, 0, 0, 0);
  const end = new Date(mondayLocalAsUtc - JST_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return { start, end };
}

function fmt(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function weekKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}:${url}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function classifyPost(post) {
  const title = stripHtml(post?.title?.rendered || '');
  const link = String(post?.link || '');
  const terms = (post?._embedded?.['wp:term'] || [])
    .flat()
    .flatMap(term => [term?.name, term?.slug])
    .filter(Boolean)
    .join(' ');
  const hay = `${title} ${link} ${terms}`.toLowerCase();
  if (/digames_playlist|プレイリスト|playlist/.test(hay)) return 'PLAYLIST';
  if (/切れ端|scrap|kirehashi/.test(hay)) return 'SCRAPS';
  if (/yorimichi|ヨリミチ/.test(hay)) return 'YORIMICHI';
  if (/news|ニュース/.test(hay)) return 'NEWS';
  if (/日記|diary|journal/.test(hay)) return 'DIARY';
  return 'ARTICLE';
}

function normalizeWp(post) {
  return {
    id: `wp-${post.id}`,
    type: classifyPost(post),
    title: stripHtml(post?.title?.rendered || '無題'),
    date: String(post?.date_gmt || post?.date || '')
  };
}

function withinRange(value, start, end) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

async function loadWordPressPosts(start, end) {
  const graceEnd = new Date(end.getTime() + DAY_MS);
  const params = new URLSearchParams({
    after: start.toISOString(),
    before: graceEnd.toISOString(),
    per_page: '100',
    orderby: 'date',
    order: 'desc',
    _embed: '1'
  });
  const data = await fetchJson(`https://harf-way.com/wp-json/wp/v2/posts?${params}`);
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeWp)
    .filter(item => item.type === 'SCRAPS'
      ? withinRange(item.date, start, graceEnd)
      : withinRange(item.date, start, end));
}

function targetScrapWeek(start, end) {
  const sunday = new Date(end.getTime() - 1);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(sunday);
  const get = type => parts.find(part => part.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const week = Math.ceil(day / 7);
  const monthSlug = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december'
  ][month - 1] || '';
  return {
    year,
    month,
    week,
    monthSlug,
    title: `ゲームの切れ端${year}年${month}月${week}週目`,
    slugTail: `${year}_${monthSlug}${week}week`
  };
}

function isRepresentedScrap(post, target) {
  const title = stripHtml(post?.title?.rendered || '').replace(/\s+/g, '');
  const slug = String(post?.slug || '').toLowerCase();
  const link = String(post?.link || '');
  if (!/\/weekly\/scraps\//i.test(link)) return false;
  if (title === target.title.replace(/\s+/g, '')) return true;
  return target.slugTail && slug.endsWith(target.slugTail.toLowerCase());
}

async function loadRepresentedScraps(start, end) {
  const target = targetScrapWeek(start, end);
  const after = new Date(start.getTime() - 14 * DAY_MS);
  const before = new Date(end.getTime() + 3 * DAY_MS);
  const params = new URLSearchParams({
    after: after.toISOString(),
    before: before.toISOString(),
    per_page: '100',
    orderby: 'date',
    order: 'desc',
    _embed: '1'
  });
  const data = await fetchJson(`https://harf-way.com/wp-json/wp/v2/posts?${params}`);
  return Array.isArray(data)
    ? data.filter(post => isRepresentedScrap(post, target)).map(normalizeWp)
    : [];
}

async function loadYorimichi(start, end) {
  const data = await fetchJson('https://weekly-yorimichi-editor.vercel.app/api/issues');
  const issues = Array.isArray(data?.items) ? data.items : [];
  return issues
    .filter(issue => issue?.status === 'published' && withinRange(issue?.updated_at || issue?.created_at, start, end))
    .map(issue => ({
      id: `yorimichi-${issue.id}`,
      type: 'YORIMICHI',
      title: `${issue.issue_label || ''} ${issue.theme || 'ヨリミチ週刊'}`.trim(),
      date: String(issue.updated_at || issue.created_at || '')
    }));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.id || `${item.type}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boardPriority(type) {
  const order = { YORIMICHI: 0, PLAYLIST: 1, ARTICLE: 2, NEWS: 3, SCRAPS: 4, DIARY: 9 };
  return order[type] ?? 6;
}

function buildBoard(verified) {
  const eligible = verified.filter(item => item.type !== 'DIARY');
  const scraps = eligible
    .filter(item => item.type === 'SCRAPS')
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  const scrapIds = new Set(scraps.map(item => item.id));
  const others = eligible
    .filter(item => !scrapIds.has(item.id))
    .sort((a, b) => boardPriority(a.type) - boardPriority(b.type) || Date.parse(b.date || 0) - Date.parse(a.date || 0));

  const targetCount = Math.max(5, scraps.length);
  return {
    items: [...scraps, ...others].slice(0, targetCount),
    scraps
  };
}

function storageConfig() {
  const environment = String(process.env.VERCEL_ENV || 'development');
  if (environment === 'preview') return { environment, prefix: PREVIEW_WORKING_PREFIX, authRequired: false };
  if (environment === 'production') return { environment, prefix: PRODUCTION_WORKING_PREFIX, authRequired: true };
  const error = new Error('weekly_storage_environment_not_supported');
  error.status = 403;
  throw error;
}

async function ensureMutation(req, config) {
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
  if (config.authRequired) {
    const auth = await authorizeArchiveRequest(req);
    if (!auth.ok) {
      const error = new Error(auth.error || 'unauthorized');
      error.status = auth.status || 401;
      throw error;
    }
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

async function persistDraft(config, week, draft) {
  const record = {
    schema: 'weekly-harfway-draft-v1',
    environment: config.environment,
    scope: 'working-draft',
    week,
    savedAt: new Date().toISOString(),
    draft
  };
  await r2Client().send(new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: `${config.prefix}${week}.json`,
    Body: JSON.stringify(record),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store',
    Metadata: { scope: 'weekly-harfway-working', environment: config.environment, week }
  }));
  return record;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { ok: false, error: 'method_not_allowed' });

  try {
    const config = storageConfig();
    if (req.method === 'POST') await ensureMutation(req, config);

    const { start, end } = mondayRange();
    const warnings = [];
    let wordpressPosts = [];
    let representedScraps = [];
    let yorimichi = [];

    const settled = await Promise.allSettled([
      loadWordPressPosts(start, end),
      loadRepresentedScraps(start, end),
      loadYorimichi(start, end)
    ]);

    if (settled[0].status === 'fulfilled') wordpressPosts = settled[0].value;
    else warnings.push(`WordPress投稿取得失敗: ${settled[0].reason?.message || 'unknown'}`);

    if (settled[1].status === 'fulfilled') representedScraps = settled[1].value;
    else warnings.push(`切れ端represented week取得失敗: ${settled[1].reason?.message || 'unknown'}`);

    if (settled[2].status === 'fulfilled') yorimichi = settled[2].value;
    else warnings.push(`ヨリミチ週刊取得失敗: ${settled[2].reason?.message || 'unknown'}`);

    const verified = dedupe([...wordpressPosts, ...representedScraps, ...yorimichi]);
    const boardSelection = buildBoard(verified);
    const board = boardSelection.items;
    const scraps = boardSelection.scraps;

    const generatedAt = new Date().toISOString();
    const week = weekKey(start);
    const draft = {
      gameIds: [],
      updateIds: board.map(item => item.id),
      gameEdit: {},
      updateEdit: {},
      fields: {},
      custom: [],
      savedAt: generatedAt,
      autosave: true,
      serverGenerated: true,
      verifiedIds: verified.map(item => item.id),
      requiredScrapIds: scraps.map(item => item.id),
      note: 'WEEKLY BOARDは対象期間内の切れ端に加え、represented weekが前週の切れ端も含めます。GAME LOGのX / WAYSは自動選択しません。'
    };

    let persisted = false;
    let storedAt = '';
    if (req.method === 'POST') {
      const record = await persistDraft(config, week, draft);
      persisted = true;
      storedAt = record.savedAt;
    }

    return send(res, 200, {
      ok: true,
      mode: req.method === 'POST' ? `${config.environment}-server-persist` : `${config.environment}-readonly`,
      environment: config.environment,
      persisted,
      storage: persisted ? 'r2-working-draft' : null,
      prefix: persisted ? config.prefix : null,
      week,
      storedAt,
      cronReady: true,
      generatedAt,
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${fmt(start)} → ${fmt(new Date(end.getTime() - 1))}`
      },
      draft,
      boardMeta: {
        count: board.length,
        scrapsCount: scraps.length,
        scrapsIds: scraps.map(item => item.id),
        mondayGrace: true,
        representedWeekMatch: true
      },
      sources: {
        wordpress: { ok: settled[0].status === 'fulfilled', count: wordpressPosts.length, scrapsCount: wordpressPosts.filter(item => item.type === 'SCRAPS').length },
        representedScraps: { ok: settled[1].status === 'fulfilled', count: representedScraps.length },
        yorimichi: { ok: settled[2].status === 'fulfilled', count: yorimichi.length }
      },
      warnings
    });
  } catch (error) {
    console.error('[weekly-harfway-draft]', error?.message || error);
    return send(res, error?.status || 500, {
      ok: false,
      error: error?.message || 'weekly_harfway_draft_failed',
      environment: process.env.VERCEL_ENV || 'development'
    });
  }
}
