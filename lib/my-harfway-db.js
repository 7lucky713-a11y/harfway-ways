import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes } from 'node:crypto';

let schemaReadyPromise = null;

function readerDatabaseUrl() {
  const env = String(process.env.VERCEL_ENV || '');
  if (env === 'production') {
    return String(
      process.env.WAYS_DATABASE_URL ||
      process.env.DATABASE_URL ||
      process.env.NEON_DATABASE_URL ||
      process.env.POSTGRES_URL ||
      ''
    ).trim();
  }

  const ref = String(process.env.VERCEL_GIT_COMMIT_REF || '');
  if (env === 'preview' && ref === 'preview/my-harfway-sync-20260902') {
    return String(process.env.MY_HARFWAY_MIGRATION_DATABASE_URL || '').trim();
  }

  const error = new Error('production_only');
  error.statusCode = 403;
  throw error;
}

export function getSql() {
  const url = readerDatabaseUrl();
  if (!url) {
    const error = new Error(
      process.env.VERCEL_ENV === 'production'
        ? 'reader_database_not_configured'
        : 'preview_reader_database_not_configured'
    );
    error.statusCode = 503;
    throw error;
  }
  return neon(url);
}

export async function readerSchemaStatus(sql) {
  const rows = await sql`
    SELECT
      to_regclass('reader.workspaces') IS NOT NULL AS workspaces,
      to_regclass('reader.devices') IS NOT NULL AS devices,
      to_regclass('reader.saved_games') IS NOT NULL AS saved_games,
      to_regclass('reader.pairing_tokens') IS NOT NULL AS pairing_tokens,
      to_regclass('reader.save_capabilities') IS NOT NULL AS save_capabilities
  `;
  return rows?.[0] || {};
}

export async function ensureReaderSchema(sql) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await sql`CREATE SCHEMA IF NOT EXISTS reader`;
      await sql`
        CREATE TABLE IF NOT EXISTS reader.workspaces (
          id text PRIMARY KEY,
          recovery_hash text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS reader.devices (
          id text PRIMARY KEY,
          workspace_id text NOT NULL REFERENCES reader.workspaces(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          label text NOT NULL DEFAULT 'Device',
          created_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now(),
          revoked_at timestamptz
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS reader.saved_games (
          workspace_id text NOT NULL REFERENCES reader.workspaces(id) ON DELETE CASCADE,
          game_id text NOT NULL,
          steam_appid text,
          source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
          saved_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (workspace_id, game_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS reader.pairing_tokens (
          id text PRIMARY KEY,
          workspace_id text NOT NULL REFERENCES reader.workspaces(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          created_by_device_id text REFERENCES reader.devices(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          used_at timestamptz
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS reader.save_capabilities (
          id text PRIMARY KEY,
          workspace_id text NOT NULL REFERENCES reader.workspaces(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          source text NOT NULL,
          source_origin text NOT NULL,
          created_by_device_id text REFERENCES reader.devices(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          last_used_at timestamptz,
          revoked_at timestamptz,
          use_count bigint NOT NULL DEFAULT 0
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS reader_devices_workspace_idx ON reader.devices(workspace_id)`;
      await sql`CREATE INDEX IF NOT EXISTS reader_saved_games_workspace_idx ON reader.saved_games(workspace_id, saved_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS reader_saved_games_steam_idx ON reader.saved_games(workspace_id, steam_appid)`;
      await sql`CREATE INDEX IF NOT EXISTS reader_pairing_tokens_workspace_idx ON reader.pairing_tokens(workspace_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS reader_pairing_tokens_expiry_idx ON reader.pairing_tokens(expires_at) WHERE used_at IS NULL`;
      await sql`CREATE INDEX IF NOT EXISTS reader_save_capabilities_workspace_idx ON reader.save_capabilities(workspace_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS reader_save_capabilities_expiry_idx ON reader.save_capabilities(expires_at) WHERE revoked_at IS NULL`;
      return true;
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

export function hashSecret(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function randomSecret(prefix = '', bytes = 24) {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}

export function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

export function bearer(req) {
  const raw = String(req?.headers?.authorization || '');
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
}

export async function authenticateDevice(sql, token) {
  if (!token) return null;
  const tokenHash = hashSecret(token);
  const rows = await sql`
    SELECT d.id, d.workspace_id, d.label, d.created_at, d.last_seen_at
    FROM reader.devices d
    WHERE d.token_hash = ${tokenHash}
      AND d.revoked_at IS NULL
    LIMIT 1
  `;
  const device = rows?.[0] || null;
  if (device) {
    await sql`UPDATE reader.devices SET last_seen_at = now() WHERE id = ${device.id}`;
  }
  return device;
}

export function sendError(res, error) {
  const status = Number(error?.statusCode || 500);
  if (status >= 500) console.error('[my-harfway]', error);
  return res.status(status).json({
    ok: false,
    error: String(error?.message || 'internal_error'),
    details: error?.details || undefined
  });
}
