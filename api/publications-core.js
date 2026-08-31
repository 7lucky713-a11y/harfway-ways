import { neon } from '@neondatabase/serverless';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export const PUBLICATIONS_COOKIE = 'hw_publications_session';
export const FIXTURE_EMAIL = 'editor-preview@harf-way.local';
export const FIXTURE_PASSWORD = 'harfway-preview';
const FIXTURE_SIGNING_KEY = 'harf-way-publications-preview-fixture-v1';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export const fixturePublication = {
  id: 'publication-doujin-yawa',
  slug: 'doujin-yawa',
  title: '同人ゲーム夜話',
  tagline: '同人ゲームの面白さを、深く、ゆっくり、味わう夜話を。',
  editor: '編集長：サンプル',
  theme: 'editorial',
  accent: '#8f3131',
  bg: '#f5efe4',
  description: 'その人の頭の中にある「同人ゲーム売り場」を、そのままWebにする専門媒体。',
  shelves: ['500円以下', '短編ADV', '作者から辿る', '体験版あり', '昔の一本', '今月の新着'],
  articles: [
    { id: 'publication-doujin-yawa-entry-1', title: '500円以下で拾った3本', type: 'pick', note: '今月の発掘から3本。' },
    { id: 'publication-doujin-yawa-entry-2', title: '作者を追う：小さなサークルの過去作', type: 'feature', note: '作品ではなく作者から辿る。' },
    { id: 'publication-doujin-yawa-entry-3', title: 'パッケージだけで惹かれた一本', type: 'memo', note: '短い発掘メモ。' }
  ]
};

function text(value, max = 8000) {
  return String(value ?? '').trim().slice(0, max);
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function parseCookies(req) {
  const raw = String(req.headers?.cookie || '');
  const out = {};
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signFixturePayload(payload) {
  const body = base64urlJson(payload);
  const sig = createHmac('sha256', FIXTURE_SIGNING_KEY).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyFixturePayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', FIXTURE_SIGNING_KEY).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, digest] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const actual = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function publicationsDatabaseConfig() {
  const production = process.env.VERCEL_ENV === 'production';
  const url = production
    ? text(process.env.PUBLICATIONS_DATABASE_URL, 4000)
    : text(process.env.PUBLICATIONS_PREVIEW_DATABASE_URL, 4000);
  const writesAllowed = production
    ? process.env.PUBLICATIONS_PRODUCTION_WRITES === '1'
    : process.env.PUBLICATIONS_PREVIEW_WRITES === '1';
  return {
    production,
    environment: process.env.VERCEL_ENV || 'development',
    url,
    writesAllowed,
    fixture: !production && !url,
    storage: url ? (production ? 'neon-production' : 'neon-preview') : (production ? 'not-configured' : 'preview-fixture')
  };
}

export function publicationsSql(config = publicationsDatabaseConfig()) {
  return config.url ? neon(config.url) : null;
}

export function setSessionCookie(res, token, maxAge = SESSION_SECONDS) {
  const secure = process.env.VERCEL_ENV !== 'development' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${PUBLICATIONS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Number(maxAge) || 0)}${secure}`);
}

export function clearSessionCookie(res) {
  setSessionCookie(res, '', 0);
}

export function fixtureLogin(slug, email, password) {
  if (process.env.VERCEL_ENV === 'production') return null;
  if (text(slug, 120) !== fixturePublication.slug) return null;
  if (text(email, 240).toLowerCase() !== FIXTURE_EMAIL) return null;
  if (String(password || '') !== FIXTURE_PASSWORD) return null;
  const payload = {
    fixture: true,
    memberId: 'fixture-editor',
    publicationId: fixturePublication.id,
    slug: fixturePublication.slug,
    email: FIXTURE_EMAIL,
    role: 'editor_in_chief',
    exp: Date.now() + SESSION_SECONDS * 1000
  };
  return { token: signFixturePayload(payload), session: payload };
}

export async function ensurePublicationsSchema(sql, config = publicationsDatabaseConfig()) {
  if (!sql || !config.url) throw new Error('publications_database_not_configured');
  if (!config.writesAllowed) throw new Error('publications_writes_disabled');
  await sql`CREATE SCHEMA IF NOT EXISTS publications`;
  await sql`
    CREATE TABLE IF NOT EXISTS publications.members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      publication_id text NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'editor',
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (publication_id, email),
      CONSTRAINT publications_members_role_check CHECK (role IN ('editor_in_chief','editor','writer')),
      CONSTRAINT publications_members_status_check CHECK (status IN ('active','disabled'))
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS publications.sessions (
      token_hash text PRIMARY KEY,
      member_id uuid NOT NULL REFERENCES publications.members(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS publications_sessions_member_idx ON publications.sessions(member_id)`;
  await sql`CREATE INDEX IF NOT EXISTS publications_sessions_expires_idx ON publications.sessions(expires_at)`;
}

function normalizePublicationRow(row, articles = []) {
  if (!row) return null;
  const meta = parseMetadata(row.metadata);
  return {
    id: text(row.id, 180),
    slug: text(meta.slug, 120),
    title: text(row.title, 240),
    tagline: text(meta.tagline, 500),
    editor: text(meta.editor, 240),
    theme: text(meta.theme || 'editorial', 40),
    accent: text(meta.accent || '#8f3131', 32),
    bg: text(meta.bg || '#f5efe4', 32),
    description: text(row.body_text || row.excerpt, 8000),
    shelves: Array.isArray(meta.shelves) ? meta.shelves.map(v => text(v, 120)).filter(Boolean).slice(0, 100) : [],
    articles
  };
}

function normalizeEntryRow(row) {
  const meta = parseMetadata(row.metadata);
  return {
    id: text(row.id, 180),
    title: text(row.title, 240),
    type: text(meta.entry_type || 'memo', 40),
    note: text(row.body_text || row.excerpt, 8000)
  };
}

async function readEntries(sql, publicationId) {
  const rows = await sql`
    SELECT id,title,excerpt,body_text,metadata,created_at,updated_at
    FROM core.contents
    WHERE content_type='publication_entry'
      AND source='publications'
      AND status='active'
      AND metadata->>'publication_id'=${publicationId}
    ORDER BY created_at ASC, id ASC
    LIMIT 1000
  `;
  return rows.map(normalizeEntryRow);
}

export async function readPublicationById(sql, publicationId) {
  const rows = await sql`
    SELECT id,title,excerpt,body_text,metadata,status,created_at,updated_at
    FROM core.contents
    WHERE id=${publicationId} AND content_type='publication' AND source='publications' AND status='active'
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return normalizePublicationRow(rows[0], await readEntries(sql, publicationId));
}

export async function readPublicationBySlug(sql, slug) {
  const rows = await sql`
    SELECT id,title,excerpt,body_text,metadata,status,created_at,updated_at
    FROM core.contents
    WHERE content_type='publication'
      AND source='publications'
      AND status='active'
      AND metadata->>'slug'=${text(slug, 120)}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return normalizePublicationRow(rows[0], await readEntries(sql, rows[0].id));
}

export async function getPublicationSession(req, config = publicationsDatabaseConfig()) {
  const token = parseCookies(req)[PUBLICATIONS_COOKIE] || '';
  if (!token) return null;
  if (config.fixture) {
    const payload = verifyFixturePayload(token);
    if (!payload?.fixture || payload.publicationId !== fixturePublication.id) return null;
    return {
      memberId: payload.memberId,
      publicationId: payload.publicationId,
      slug: payload.slug,
      email: payload.email,
      role: payload.role,
      fixture: true
    };
  }
  const sql = publicationsSql(config);
  if (!sql) return null;
  const rows = await sql`
    SELECT m.id AS member_id,m.publication_id,m.email,m.role
    FROM publications.sessions s
    JOIN publications.members m ON m.id=s.member_id
    WHERE s.token_hash=${hashToken(token)}
      AND s.expires_at > now()
      AND m.status='active'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const publication = await readPublicationById(sql, row.publication_id);
  if (!publication) return null;
  return {
    memberId: row.member_id,
    publicationId: row.publication_id,
    slug: publication.slug,
    email: row.email,
    role: row.role,
    fixture: false
  };
}

export async function databaseLogin(config, slug, email, password) {
  const sql = publicationsSql(config);
  if (!sql) return null;
  const publication = await readPublicationBySlug(sql, slug);
  if (!publication) return null;
  const rows = await sql`
    SELECT id,publication_id,email,password_hash,role
    FROM publications.members
    WHERE publication_id=${publication.id}
      AND email=${text(email, 240).toLowerCase()}
      AND status='active'
    LIMIT 1
  `;
  const member = rows[0];
  if (!member || !verifyPassword(password, member.password_hash)) return null;
  const token = randomBytes(32).toString('base64url');
  await sql`
    INSERT INTO publications.sessions (token_hash,member_id,expires_at,created_at)
    VALUES (${hashToken(token)},${member.id},now() + interval '30 days',now())
  `;
  return {
    token,
    session: {
      memberId: member.id,
      publicationId: member.publication_id,
      slug: publication.slug,
      email: member.email,
      role: member.role,
      fixture: false
    }
  };
}

export async function databaseLogout(req, config) {
  if (!config?.url) return;
  const token = parseCookies(req)[PUBLICATIONS_COOKIE] || '';
  if (!token) return;
  const sql = publicationsSql(config);
  await sql`DELETE FROM publications.sessions WHERE token_hash=${hashToken(token)}`;
}

export function sanitizePublicationInput(input = {}, publicationId = '') {
  const shelves = Array.isArray(input.shelves) ? input.shelves.map(v => text(v, 120)).filter(Boolean).slice(0, 100) : [];
  const articles = Array.isArray(input.articles) ? input.articles.slice(0, 1000).map((a, index) => ({
    id: text(a?.id, 180) || `${publicationId}-entry-${randomUUID()}`,
    title: text(a?.title, 240),
    type: ['pick','feature','memo','article'].includes(text(a?.type, 40)) ? text(a.type, 40) : 'memo',
    note: text(a?.note, 8000),
    order: index
  })).filter(a => a.title) : [];
  return {
    title: text(input.title, 240),
    editor: text(input.editor, 240),
    tagline: text(input.tagline, 500),
    theme: ['editorial','shelf','archive'].includes(text(input.theme, 40)) ? text(input.theme, 40) : 'editorial',
    accent: text(input.accent, 32) || '#8f3131',
    bg: text(input.bg, 32) || '#f5efe4',
    description: text(input.description, 8000),
    shelves,
    articles
  };
}

export async function saveOwnPublication(sql, session, input, config) {
  if (!config.writesAllowed) throw new Error('publications_writes_disabled');
  const current = await readPublicationById(sql, session.publicationId);
  if (!current) throw new Error('publication_not_found');
  const next = sanitizePublicationInput(input, session.publicationId);
  const metadata = JSON.stringify({
    slug: current.slug,
    editor: next.editor,
    tagline: next.tagline,
    theme: next.theme,
    accent: next.accent,
    bg: next.bg,
    shelves: next.shelves
  });
  await sql`
    UPDATE core.contents
    SET title=${next.title || current.title},
        excerpt=${next.description.slice(0,320)},
        body_text=${next.description},
        metadata=${metadata}::jsonb,
        updated_at=now()
    WHERE id=${session.publicationId} AND content_type='publication' AND source='publications'
  `;
  await sql`
    UPDATE core.contents
    SET status='archived',updated_at=now()
    WHERE content_type='publication_entry'
      AND source='publications'
      AND metadata->>'publication_id'=${session.publicationId}
      AND status='active'
  `;
  for (const article of next.articles) {
    const entryMeta = JSON.stringify({ publication_id: session.publicationId, entry_type: article.type, order: article.order });
    await sql`
      INSERT INTO core.contents (id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
      VALUES (${article.id},'publication_entry',${article.title},${`publication-entry://${article.id}`},${article.note.slice(0,320)},${article.note},'active','publications',${entryMeta}::jsonb,now(),now())
      ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        excerpt=EXCLUDED.excerpt,
        body_text=EXCLUDED.body_text,
        status='active',
        metadata=EXCLUDED.metadata,
        updated_at=now()
    `;
  }
  return readPublicationById(sql, session.publicationId);
}

export async function bootstrapPublication(sql, config, input = {}) {
  if (!config.writesAllowed) throw new Error('publications_writes_disabled');
  await ensurePublicationsSchema(sql, config);
  const slug = text(input.slug, 120).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const title = text(input.title, 240);
  const email = text(input.email, 240).toLowerCase();
  const password = String(input.password || '');
  if (!slug || !title || !email || password.length < 8) throw new Error('slug_title_email_password_required');
  const publicationId = `publication-${slug}`;
  const metadata = JSON.stringify({
    slug,
    editor: text(input.editor || '編集長', 240),
    tagline: text(input.tagline, 500),
    theme: 'editorial',
    accent: '#8f3131',
    bg: '#f5efe4',
    shelves: []
  });
  await sql`
    INSERT INTO core.contents (id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
    VALUES (${publicationId},'publication',${title},${`publication://${slug}`},'', '', 'active','publications',${metadata}::jsonb,now(),now())
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,metadata=EXCLUDED.metadata,status='active',updated_at=now()
  `;
  const passwordHash = hashPassword(password);
  await sql`
    INSERT INTO publications.members (publication_id,email,password_hash,role,status,created_at,updated_at)
    VALUES (${publicationId},${email},${passwordHash},'editor_in_chief','active',now(),now())
    ON CONFLICT (publication_id,email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='editor_in_chief',status='active',updated_at=now()
  `;
  return readPublicationById(sql, publicationId);
}
