import {
  fixturePublication,
  getPublicationSession,
  publicationsDatabaseConfig,
  publicationsSql,
  readPublicationById,
  readPublicationBySlug,
  sanitizePublicationInput,
  saveOwnPublication
} from './publications-core.js';

function bodyObject(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const config = publicationsDatabaseConfig();

  if (req.method === 'GET' && String(req.query?.public || '') === '1') {
    const slug = String(req.query?.slug || '').trim();
    if (!slug) return res.status(400).json({ ok:false, error:'slug_required' });
    try {
      if (config.fixture) {
        if (slug !== fixturePublication.slug) return res.status(404).json({ ok:false, error:'publication_not_found' });
        return res.status(200).json({ ok:true, storage:config.storage, publication:fixturePublication });
      }
      const sql = publicationsSql(config);
      if (!sql) return res.status(503).json({ ok:false, error:'publications_database_not_configured' });
      const publication = await readPublicationBySlug(sql, slug);
      if (!publication) return res.status(404).json({ ok:false, error:'publication_not_found' });
      return res.status(200).json({ ok:true, storage:config.storage, publication });
    } catch (error) {
      console.error('[publications-content-public]', error);
      return res.status(500).json({ ok:false, error:'publication_read_failed' });
    }
  }

  let session;
  try {
    session = await getPublicationSession(req, config);
  } catch (error) {
    console.error('[publications-content-session]', error);
    return res.status(500).json({ ok:false, error:'session_read_failed' });
  }
  if (!session) return res.status(401).json({ ok:false, error:'login_required' });

  if (req.method === 'GET') {
    try {
      const publication = config.fixture
        ? fixturePublication
        : await readPublicationById(publicationsSql(config), session.publicationId);
      if (!publication) return res.status(404).json({ ok:false, error:'publication_not_found' });
      return res.status(200).json({
        ok:true,
        storage:config.storage,
        writesAllowed:Boolean(config.writesAllowed),
        user:{ email:session.email, role:session.role, publicationId:session.publicationId, slug:session.slug },
        publication
      });
    } catch (error) {
      console.error('[publications-content-read]', error);
      return res.status(500).json({ ok:false, error:'publication_read_failed' });
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const input = bodyObject(req);
    try {
      if (config.fixture) {
        const publication = {
          ...fixturePublication,
          ...sanitizePublicationInput(input, session.publicationId),
          id:session.publicationId,
          slug:session.slug
        };
        return res.status(200).json({
          ok:true,
          storage:'browser-local-after-server-auth',
          persisted:false,
          writesAllowed:false,
          publication
        });
      }
      const sql = publicationsSql(config);
      if (!sql) return res.status(503).json({ ok:false, error:'publications_database_not_configured' });
      if (!config.writesAllowed) return res.status(503).json({ ok:false, error:'publications_writes_disabled' });
      const publication = await saveOwnPublication(sql, session, input, config);
      return res.status(200).json({ ok:true, storage:config.storage, persisted:true, writesAllowed:true, publication });
    } catch (error) {
      console.error('[publications-content-write]', error);
      const message = String(error?.message || '');
      if (message === 'publications_writes_disabled') return res.status(503).json({ ok:false, error:message });
      return res.status(500).json({ ok:false, error:'publication_write_failed' });
    }
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Allow', 'GET, PUT, PATCH, OPTIONS');
  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}
