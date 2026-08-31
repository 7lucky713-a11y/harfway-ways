import {
  clearSessionCookie,
  databaseLogin,
  databaseLogout,
  fixtureLogin,
  FIXTURE_EMAIL,
  FIXTURE_PASSWORD,
  getPublicationSession,
  publicationsDatabaseConfig,
  setSessionCookie
} from './publications-core.js';

function bodyObject(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const config = publicationsDatabaseConfig();

  if (req.method === 'GET') {
    try {
      const session = await getPublicationSession(req, config);
      if (!session) {
        return res.status(401).json({
          ok: false,
          error: 'login_required',
          environment: config.environment,
          storage: config.storage,
          fixtureAvailable: config.fixture
        });
      }
      return res.status(200).json({
        ok: true,
        environment: config.environment,
        storage: config.storage,
        writesAllowed: Boolean(config.writesAllowed),
        user: {
          email: session.email,
          role: session.role,
          publicationId: session.publicationId,
          slug: session.slug
        }
      });
    } catch (error) {
      console.error('[publications-auth-session]', error);
      return res.status(500).json({ ok:false, error:'session_read_failed' });
    }
  }

  if (req.method === 'POST') {
    const body = bodyObject(req);
    const slug = String(body.slug || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!slug || !email || !password) return res.status(400).json({ ok:false, error:'slug_email_password_required' });
    try {
      const login = config.fixture
        ? fixtureLogin(slug, email, password)
        : await databaseLogin(config, slug, email, password);
      if (!login) return res.status(401).json({ ok:false, error:'invalid_credentials' });
      setSessionCookie(res, login.token);
      return res.status(200).json({
        ok:true,
        environment:config.environment,
        storage:config.storage,
        writesAllowed:Boolean(config.writesAllowed),
        user:{
          email:login.session.email,
          role:login.session.role,
          publicationId:login.session.publicationId,
          slug:login.session.slug
        }
      });
    } catch (error) {
      console.error('[publications-auth-login]', error);
      const message = String(error?.message || '');
      if (/relation .*publications\.(members|sessions).* does not exist/i.test(message)) {
        return res.status(503).json({ ok:false, error:'publications_schema_not_ready' });
      }
      return res.status(500).json({ ok:false, error:'login_failed' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      if (!config.fixture) await databaseLogout(req, config);
    } catch (error) {
      console.error('[publications-auth-logout]', error);
    }
    clearSessionCookie(res);
    return res.status(200).json({ ok:true });
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}

export const previewFixture = {
  email: FIXTURE_EMAIL,
  password: FIXTURE_PASSWORD
};
