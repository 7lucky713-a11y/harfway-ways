const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

export function archiveDatabaseConfig() {
  const production = process.env.VERCEL_ENV === 'production';
  if (production) {
    return {
      production,
      mode: 'shared-content-core',
      url:
        process.env.WAYS_DATABASE_URL ||
        process.env.DATABASE_URL ||
        process.env.NEON_DATABASE_URL ||
        process.env.POSTGRES_URL ||
        ''
    };
  }
  return {
    production,
    mode: 'preview-core',
    url: process.env.SALVAGER_PREVIEW_DATABASE_URL || ''
  };
}

export function requestAdminKey(req) {
  return String(req.headers['x-admin-key'] || req.headers['x-showcase-admin-key'] || '').trim();
}

export async function authorizeArchiveRequest(req) {
  const config = archiveDatabaseConfig();
  if (!config.production) return { ok: true, config, authRequired: false };

  const key = requestAdminKey(req);
  if (!key) {
    return { ok: false, status: 401, error: 'admin_key_required', config, authRequired: true };
  }

  try {
    const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'x-showcase-admin-key': key
      }
    });
    if (!response.ok) {
      return { ok: false, status: 401, error: 'invalid_admin_key', config, authRequired: true };
    }
    return { ok: true, config, authRequired: true };
  } catch (error) {
    console.error('[archive-auth]', error);
    return { ok: false, status: 502, error: 'admin_auth_unavailable', config, authRequired: true };
  }
}

export function archiveCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Showcase-Admin-Key');
}
