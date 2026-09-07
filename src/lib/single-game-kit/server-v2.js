import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest } from '../../../api/archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';

export const SITE_CONTENT_TYPE = 'single_game_site';
export const SITE_SOURCE = 'single-game-kit';
export const RECORD_CONTENT_TYPE = 'single_game_record';

const DEFAULT_THEME = {
  bg: '#171b18', panel: '#202621', panel2: '#272e28', text: '#e1e8df',
  muted: '#a8b2a7', accent: '#93ad82', accent2: '#c2b58e', line: '#3c463d'
};

export function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
export function siteSlug(value) {
  const slug = clean(value, 60).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,59}$/.test(slug) ? slug : '';
}
function categoryId(value) {
  const id = clean(value, 32).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,31}$/.test(id) ? id : '';
}
function safeHex(value, fallback) {
  const color = clean(value, 16);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}
function safeCategories(value, fallback = []) {
  const input = Array.isArray(value) ? value : [];
  const out = []; const seen = new Set();
  for (const item of input) {
    const id = categoryId(item?.id); const label = clean(item?.label, 40); const short = clean(item?.short, 16).toUpperCase();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id); out.push({ id, label, short: short || id.toUpperCase() });
    if (out.length >= 4) break;
  }
  if (out.length) return out;
  return Array.isArray(fallback) && fallback.length ? fallback.slice(0, 4) : [
    { id: 'note', label: 'メモ', short: 'NOTE' }, { id: 'video', label: '動画', short: 'VIDEO' },
    { id: 'build', label: 'ビルド', short: 'BUILD' }, { id: 'memo', label: '発見', short: 'MEMO' }
  ];
}
function safeHero(value, fallback = []) {
  const out = (Array.isArray(value) ? value : []).map((x) => clean(x, 40)).filter(Boolean).slice(0, 3);
  return out.length ? out : (Array.isArray(fallback) && fallback.length ? fallback.slice(0, 3) : ['PLAY.', 'NOTE.', 'REMEMBER.']);
}
function normalizedFields(value, fallback = {}) {
  const subject = value?.subject || {}; const role = value?.role || {};
  return {
    subject: { label: clean(subject.label, 60) || fallback?.subject?.label || '対象', placeholder: clean(subject.placeholder, 120) || fallback?.subject?.placeholder || 'キャラ / 武器 / デッキなど' },
    role: { label: clean(role.label, 60) || fallback?.role?.label || '状況', placeholder: clean(role.placeholder, 120) || fallback?.role?.placeholder || 'クラス / 難易度 / ステージなど' }
  };
}
function normalizedTheme(value, fallback = {}) {
  const base = { ...DEFAULT_THEME, ...(fallback || {}) };
  return {
    bg: safeHex(value?.bg, base.bg), panel: safeHex(value?.panel, base.panel), panel2: safeHex(value?.panel2, base.panel2),
    text: safeHex(value?.text, base.text), muted: safeHex(value?.muted, base.muted), accent: safeHex(value?.accent, base.accent),
    accent2: safeHex(value?.accent2, base.accent2), line: safeHex(value?.line, base.line)
  };
}
function siteData(slug) {
  return { source: `single-game:${slug}`, idPrefix: `single-game-record:${slug}:`, r2Prefix: `single-game/${slug}/`, contentType: RECORD_CONTENT_TYPE };
}
export function siteFromRow(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const slug = siteSlug(metadata.slug || String(row.id || '').replace(/^single-game-site:/, ''));
  if (!slug) return null;
  return {
    id: slug, slug, siteName: clean(row.title, 120) || clean(metadata.siteName, 120) || slug,
    gameName: clean(metadata.gameName, 120) || slug,
    badge: clean(metadata.badge, 180) || `${clean(metadata.gameName, 120) || slug} / play archive`,
    hero: safeHero(metadata.hero), description: clean(row.excerpt, 2000), categories: safeCategories(metadata.categories),
    fields: normalizedFields(metadata.fields), theme: normalizedTheme(metadata.theme), status: clean(row.status, 30) || 'active',
    data: siteData(slug), updatedAt: row.updated_at || null
  };
}
export function normalizeSiteInput(body, existing = null) {
  const slug = siteSlug(existing?.slug || body?.slug);
  if (!slug) { const error = new Error('invalid_slug'); error.status = 400; throw error; }
  const gameName = clean(body?.gameName, 120) || existing?.gameName || '';
  const siteName = clean(body?.siteName, 120) || existing?.siteName || '';
  const description = clean(body?.description, 2000) || existing?.description || '';
  if (!gameName || !siteName || !description) { const error = new Error('game_site_description_required'); error.status = 400; throw error; }
  return {
    slug, gameName, siteName, badge: clean(body?.badge, 180) || existing?.badge || `${gameName} / play archive`,
    hero: safeHero(body?.hero, existing?.hero), description,
    categories: safeCategories(body?.categories, existing?.categories), fields: normalizedFields(body?.fields, existing?.fields),
    theme: normalizedTheme(body?.theme, existing?.theme), status: 'active', data: siteData(slug)
  };
}
function databaseUrlForEnvironment() {
  const production = process.env.VERCEL_ENV === 'production';
  if (production) return { production, storage: 'shared-content-core', expectedBranchId: PRODUCTION_BRANCH_ID, url: archiveDatabaseConfig().url || '' };
  return { production, storage: 'single-game-kit-preview', expectedBranchId: PREVIEW_BRANCH_ID, url: process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL || '' };
}
export async function databaseContext() {
  const config = databaseUrlForEnvironment();
  if (!config.url) { const error = new Error(config.production ? 'production_database_not_configured' : 'preview_database_not_configured'); error.status = 503; throw error; }
  const sql = neon(config.url);
  const rows = await sql`SELECT current_database()::text AS database_name, current_setting('neon.project_id', true)::text AS project_id, current_setting('neon.branch_id', true)::text AS branch_id, to_regclass('core.contents')::text AS contents_table`;
  const info = rows[0] || {}; const projectId = clean(info.project_id, 80); const branchId = clean(info.branch_id, 80); const tableReady = clean(info.contents_table, 120) === 'core.contents';
  if (projectId !== PROJECT_ID || branchId !== config.expectedBranchId || !tableReady) {
    const error = new Error('database_identity_mismatch'); error.status = 409;
    error.details = { projectId: projectId || null, branchId: branchId || null, expectedBranchId: config.expectedBranchId, tableReady }; throw error;
  }
  return { sql, production: config.production, storage: config.storage, branchId };
}
export async function getSite(sql, value, { includeInactive = false } = {}) {
  const slug = siteSlug(value); if (!slug) return null; const id = `single-game-site:${slug}`;
  const rows = await sql`SELECT id, title, excerpt, status, source, metadata, updated_at FROM core.contents WHERE id = ${id} AND content_type = ${SITE_CONTENT_TYPE} AND source = ${SITE_SOURCE} LIMIT 1`;
  const site = siteFromRow(rows[0]); if (!site || (!includeInactive && site.status !== 'active')) return null; return site;
}
export async function listSites(sql, { includeInactive = false } = {}) {
  const rows = await sql`SELECT id, title, excerpt, status, source, metadata, updated_at FROM core.contents WHERE content_type = ${SITE_CONTENT_TYPE} AND source = ${SITE_SOURCE} ORDER BY updated_at DESC`;
  return rows.map(siteFromRow).filter((site) => site && (includeInactive || site.status === 'active'));
}
export async function saveSite(sql, body) {
  const requestedSlug = siteSlug(body?.slug); const existing = requestedSlug ? await getSite(sql, requestedSlug, { includeInactive: true }) : null;
  const site = normalizeSiteInput(body, existing); const id = `single-game-site:${site.slug}`;
  const metadata = JSON.stringify({ slug: site.slug, gameName: site.gameName, badge: site.badge, hero: site.hero, categories: site.categories, fields: site.fields, theme: site.theme, version: 2 });
  const url = `/single-game/${site.slug}/`;
  const rows = await sql`INSERT INTO core.contents (id, content_type, title, url, published_at, excerpt, body_text, featured_image_url, status, source, metadata, created_at, updated_at) VALUES (${id}, ${SITE_CONTENT_TYPE}, ${site.siteName}, ${url}, now(), ${site.description}, '', '', 'active', ${SITE_SOURCE}, CAST(${metadata} AS jsonb), now(), now()) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, excerpt = EXCLUDED.excerpt, status = 'active', source = ${SITE_SOURCE}, metadata = EXCLUDED.metadata, updated_at = now() WHERE core.contents.content_type = ${SITE_CONTENT_TYPE} AND core.contents.source = ${SITE_SOURCE} RETURNING id, title, excerpt, status, source, metadata, updated_at`;
  if (!rows[0]) { const error = new Error('site_conflict'); error.status = 409; throw error; }
  return siteFromRow(rows[0]);
}
export async function authorizeMutation(req, production) {
  if (!production) return; const auth = await authorizeArchiveRequest(req); if (auth.ok) return;
  const error = new Error(auth.error || 'unauthorized'); error.status = auth.status || 401; throw error;
}
