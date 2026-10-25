import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';
import { nextReviewAt, scheduleReview } from '../lib/english-review.js';

// English practice stays in private contents only. Public note snapshots never read this type.
const SOURCE = 'private-game-notes';
const CARD_TYPE = 'private_game_note_english_card';
const GAME_TYPE = 'private_game_note_game';
const PREFIX = 'game-notes:english:';
const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const parseBody = req => {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
};

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function dbCardId(id) {
  const raw = clean(id, 100).replace(/^game-notes:english:/, '');
  if (!/^[a-f0-9-]{36}$/i.test(raw)) throw httpError('invalid_card_id');
  return `${PREFIX}${raw}`;
}

function toCard(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: String(row.id || '').replace(PREFIX, ''),
    gameId: meta.gameId || '',
    english: row.body_text || '',
    guess: meta.guess || '',
    meaning: meta.meaning || '',
    context: meta.context || '',
    streak: Math.max(0, Number(meta.streak || 0)),
    reviewCount: Math.max(0, Number(meta.reviewCount || 0)),
    nextReviewAt: meta.nextReviewAt || '',
    lastReviewedAt: meta.lastReviewedAt || '',
    history: Array.isArray(meta.history) ? meta.history : [],
    createdAt: meta.createdAt || row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function databaseContext() {
  const production = process.env.VERCEL_ENV === 'production';
  const url = production ? archiveDatabaseConfig().url : process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL;
  if (!url) throw httpError(production ? 'production_database_not_configured' : 'preview_database_not_configured', 503);
  const sql = neon(url);
  const rows = await sql`
    SELECT current_setting('neon.project_id', true)::text AS project_id,
      current_setting('neon.branch_id', true)::text AS branch_id,
      to_regclass('core.contents')::text AS contents_table
  `;
  const info = rows[0] || {};
  if (info.project_id !== PROJECT_ID || info.branch_id !== (production ? PRODUCTION_BRANCH_ID : PREVIEW_BRANCH_ID) || info.contents_table !== 'core.contents') {
    throw httpError('database_identity_mismatch', 409);
  }
  return { sql, production };
}

async function authorize(req, production) {
  if (!production) return;
  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) throw httpError(auth.error || 'unauthorized', auth.status || 401);
}

async function assertGame(sql, gameId) {
  if (!gameId) throw httpError('game_required');
  const id = `game-notes:game:${gameId}`;
  const rows = await sql`
    SELECT id FROM core.contents
    WHERE id=${id} AND source=${SOURCE} AND content_type=${GAME_TYPE} AND status='active'
    LIMIT 1
  `;
  if (!rows.length) throw httpError('game_not_found');
}

function fields(body) {
  const result = {
    gameId: clean(body.gameId, 160),
    english: clean(body.english, 1200),
    guess: clean(body.guess, 2000),
    meaning: clean(body.meaning, 2000),
    context: clean(body.context, 1200)
  };
  if (!result.english || !result.meaning) throw httpError('english_and_meaning_required');
  return result;
}

async function list(sql) {
  const [cards, games] = await Promise.all([
    sql`SELECT id, body_text, metadata, created_at, updated_at FROM core.contents
        WHERE source=${SOURCE} AND content_type=${CARD_TYPE} AND status='active'
        ORDER BY created_at DESC LIMIT 3000`,
    sql`SELECT id, title FROM core.contents
        WHERE source=${SOURCE} AND content_type=${GAME_TYPE} AND status='active'
        ORDER BY title ASC`
  ]);
  return {
    cards: cards.map(toCard),
    games: games.map(row => ({ id: String(row.id).replace(/^game-notes:game:/, ''), name: row.title || '' }))
  };
}

async function createCard(sql, body) {
  const value = fields(body);
  await assertGame(sql, value.gameId);
  const now = new Date().toISOString();
  const id = `${PREFIX}${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    gameId: value.gameId, guess: value.guess, meaning: value.meaning, context: value.context,
    streak: 0, reviewCount: 0, nextReviewAt: nextReviewAt(1, now),
    lastReviewedAt: '', history: [now], createdAt: now
  });
  const rows = await sql`
    INSERT INTO core.contents (id, content_type, title, url, excerpt, body_text, status, source, metadata, created_at, updated_at)
    VALUES (${id}, ${CARD_TYPE}, ${value.english.slice(0, 180)}, ${`/game-notes/_private/english/${id.slice(PREFIX.length)}`},
      ${value.meaning.slice(0, 280)}, ${value.english}, 'active', ${SOURCE}, CAST(${metadata} AS jsonb), now(), now())
    RETURNING id, body_text, metadata, created_at, updated_at
  `;
  return toCard(rows[0]);
}

async function updateCard(sql, body) {
  const id = dbCardId(body.id);
  const rows = await sql`
    SELECT id, body_text, metadata, created_at, updated_at FROM core.contents
    WHERE id=${id} AND source=${SOURCE} AND content_type=${CARD_TYPE} AND status='active' LIMIT 1
  `;
  if (!rows.length) throw httpError('card_not_found', 404);
  const current = rows[0];
  const metadata = { ...(current.metadata || {}) };
  let english = current.body_text || '';
  let meaning = clean(metadata.meaning, 2000);
  const action = clean(body.action, 20);
  if (action === 'edit') {
    const value = fields(body);
    await assertGame(sql, value.gameId);
    Object.assign(metadata, { gameId: value.gameId, guess: value.guess, meaning: value.meaning, context: value.context });
    english = value.english;
    meaning = value.meaning;
  } else if (action === 'review') {
    if (typeof body.remembered !== 'boolean') throw httpError('remembered_boolean_required');
    const now = new Date().toISOString();
    const schedule = scheduleReview(metadata.streak, body.remembered, now);
    Object.assign(metadata, {
      streak: schedule.streak, nextReviewAt: schedule.nextReviewAt,
      reviewCount: Math.max(0, Number(metadata.reviewCount || 0)) + 1,
      lastReviewedAt: now,
      history: [...(Array.isArray(metadata.history) ? metadata.history : []), now].slice(-365)
    });
  } else {
    throw httpError('invalid_action');
  }
  const json = JSON.stringify(metadata);
  const updated = await sql`
    UPDATE core.contents SET body_text=${english}, title=${english.slice(0, 180)},
      excerpt=${meaning.slice(0, 280)}, metadata=CAST(${json} AS jsonb), updated_at=now()
    WHERE id=${id} AND source=${SOURCE} AND content_type=${CARD_TYPE} AND status='active'
    RETURNING id, body_text, metadata, created_at, updated_at
  `;
  return toCard(updated[0]);
}

async function archiveCard(sql, body) {
  const id = dbCardId(body.id);
  const rows = await sql`
    UPDATE core.contents SET status='archived', updated_at=now()
    WHERE id=${id} AND source=${SOURCE} AND content_type=${CARD_TYPE} AND status='active'
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const { sql, production } = await databaseContext();
    await authorize(req, production);
    if (req.method === 'GET') return res.status(200).json({ ok: true, ...(await list(sql)) });
    const body = parseBody(req);
    if (req.method === 'POST') return res.status(201).json({ ok: true, card: await createCard(sql, body) });
    if (req.method === 'PATCH') return res.status(200).json({ ok: true, card: await updateCard(sql, body) });
    if (req.method === 'DELETE') {
      const deleted = await archiveCard(sql, body);
      return res.status(deleted ? 200 : 404).json({ ok: deleted, deleted });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[game-notes-english]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'english_cards_failed' });
  }
}
