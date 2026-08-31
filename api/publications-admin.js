import {
  bootstrapPublication,
  ensurePublicationsSchema,
  fixturePublication,
  publicationsDatabaseConfig,
  publicationsSql,
  readPublicationById
} from './publications-core.js';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';

function bodyObject(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
}

async function authorizeAdmin(req) {
  const key = String(req.headers['x-admin-key'] || req.headers['x-showcase-admin-key'] || '').trim();
  if (!key) return { ok:false, status:401, error:'admin_key_required' };
  try {
    const response = await fetch(`${EDITOR_URL}/api/proxy?target=state`, {
      cache:'no-store',
      headers:{ accept:'application/json', 'x-showcase-admin-key':key }
    });
    if (!response.ok) return { ok:false, status:401, error:'invalid_admin_key' };
    return { ok:true };
  } catch (error) {
    console.error('[publications-admin-auth]', error);
    return { ok:false, status:502, error:'admin_auth_unavailable' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  const auth = await authorizeAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok:false, error:auth.error });
  const config = publicationsDatabaseConfig();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok:true,
      environment:config.environment,
      storage:config.storage,
      databaseConfigured:Boolean(config.url),
      writesAllowed:Boolean(config.writesAllowed),
      previewFixture:config.fixture,
      fixturePublication:config.fixture ? { id:fixturePublication.id,slug:fixturePublication.slug,title:fixturePublication.title } : null
    });
  }

  if (req.method === 'POST') {
    const body = bodyObject(req);
    const action = String(body.action || '').trim();
    if (!config.url) return res.status(503).json({ ok:false, error:'publications_database_not_configured' });
    if (!config.writesAllowed) return res.status(503).json({ ok:false, error:'publications_writes_disabled' });
    const sql = publicationsSql(config);
    try {
      if (action === 'bootstrap_schema') {
        await ensurePublicationsSchema(sql, config);
        return res.status(200).json({ ok:true, action, storage:config.storage });
      }
      if (action === 'create_publication') {
        const publication = await bootstrapPublication(sql, config, body);
        return res.status(200).json({ ok:true, action, storage:config.storage, publication });
      }
      if (action === 'read_publication') {
        const publicationId = String(body.publicationId || '').trim();
        if (!publicationId) return res.status(400).json({ ok:false, error:'publication_id_required' });
        const publication = await readPublicationById(sql, publicationId);
        return res.status(publication ? 200 : 404).json({ ok:Boolean(publication), publication, error:publication ? null : 'publication_not_found' });
      }
      return res.status(400).json({ ok:false, error:'unknown_action' });
    } catch (error) {
      console.error('[publications-admin]', error);
      return res.status(500).json({ ok:false, error:'publications_admin_action_failed', detail:String(error?.message || '').slice(0,180) });
    }
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Allow','GET, POST, OPTIONS');
  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}
