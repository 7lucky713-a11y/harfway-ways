import { neon } from '@neondatabase/serverless';
import { authorizeArchiveRequest } from './archive-core.js';

const CONTENT_TYPE = 'zine_project';
const SOURCE = 'zine-editor';
const MAX_BODY = 1000000;

function trimmed(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseBody(req) {
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return null; }
  }
  return body && typeof body === 'object' ? body : {};
}

function makeId() {
  return `zine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function allowedZineOrigin(origin='') {
  if (!origin) return false;
  if (origin === 'https://harfway-zine-editor.vercel.app') return true;
  if (origin === 'https://harfway-zine-editor-harf-way.vercel.app') return true;
  return /^https:\/\/harfway-zine-editor-[a-z0-9-]+-harf-way\.vercel\.app$/i.test(origin);
}

function zineCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (allowedZineOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Showcase-Admin-Key');
}

function normalizeProject(input = {}) {
  const project = input && typeof input === 'object' ? input : {};
  const pages = Array.isArray(project.pages) ? project.pages.slice(0, 300) : [];
  return {
    ...project,
    title: trimmed(project.title || 'みちすがら', 160),
    pages,
    imageOverrides: project.imageOverrides && typeof project.imageOverrides === 'object' ? project.imageOverrides : {},
    textSource: trimmed(project.textSource || 'auto', 32) || 'auto'
  };
}

function normalizeRow(row = {}, includeProject = false) {
  const meta = parseJson(row.metadata, {});
  const payload = includeProject ? parseJson(row.body_text, {}) : null;
  return {
    id: trimmed(row.id, 180),
    title: trimmed(row.title || 'みちすがら', 160),
    status: trimmed(meta.status || 'DRAFT', 32).toUpperCase(),
    pageCount: Number(meta.pageCount || payload?.pages?.length || 0) || 0,
    schemaVersion: Number(meta.schemaVersion || 1) || 1,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ...(includeProject ? { project: normalizeProject(payload) } : {})
  };
}

export default async function handler(req, res) {
  zineCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({
      ok: false,
      error: auth.error || 'unauthorized',
      authRequired: true,
      environment: process.env.VERCEL_ENV || 'development'
    });
  }

  const config = auth.config || {};
  if (!config.url) {
    return res.status(req.method === 'GET' ? 200 : 503).json({
      ok: req.method === 'GET',
      environment: process.env.VERCEL_ENV || 'development',
      storage: 'browser-local',
      authRequired: Boolean(auth.authRequired),
      items: [],
      error: req.method === 'GET' ? null : 'zine_database_not_configured'
    });
  }

  const sql = neon(config.url);

  if (req.method === 'GET') {
    const id = trimmed(req.query?.id, 180);
    try {
      if (id) {
        const rows = await sql`
          SELECT id,title,body_text,metadata,status,created_at,updated_at
          FROM core.contents
          WHERE id=${id}
            AND content_type=${CONTENT_TYPE}
            AND source=${SOURCE}
            AND status='active'
          LIMIT 1
        `;
        if (!rows[0]) return res.status(404).json({ ok: false, error: 'zine_project_not_found' });
        return res.status(200).json({
          ok: true,
          environment: process.env.VERCEL_ENV || 'development',
          storage: config.production ? 'shared-content-core' : 'preview-core',
          authRequired: Boolean(auth.authRequired),
          item: normalizeRow(rows[0], true)
        });
      }

      const rows = await sql`
        SELECT id,title,metadata,status,created_at,updated_at
        FROM core.contents
        WHERE content_type=${CONTENT_TYPE}
          AND source=${SOURCE}
          AND status='active'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 100
      `;
      return res.status(200).json({
        ok: true,
        environment: process.env.VERCEL_ENV || 'development',
        storage: config.production ? 'shared-content-core' : 'preview-core',
        authRequired: Boolean(auth.authRequired),
        items: rows.map(row => normalizeRow(row, false))
      });
    } catch (error) {
      console.error('[zine-projects-read]', error);
      return res.status(500).json({ ok: false, error: 'zine_read_failed', code: error?.code || null });
    }
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ ok: false, error: 'invalid_json' });

    const project = normalizeProject(body.project || body);
    if (!project.pages.length) return res.status(400).json({ ok: false, error: 'pages_required' });

    const id = trimmed(body.id || project.cloudId, 180) || makeId();
    project.cloudId = id;
    const title = trimmed(body.title || project.title, 160) || 'みちすがら';
    const serialized = JSON.stringify(project);
    if (serialized.length > MAX_BODY) return res.status(413).json({ ok: false, error: 'zine_project_too_large' });

    const metadata = JSON.stringify({
      status: 'DRAFT',
      schemaVersion: 1,
      pageCount: project.pages.length,
      source: SOURCE,
      clientUpdatedAt: trimmed(body.clientUpdatedAt, 80) || null
    });

    try {
      const rows = await sql`
        INSERT INTO core.contents (
          id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at
        ) VALUES (
          ${id},${CONTENT_TYPE},${title},${`zine://${id}`},'',${serialized},'active',${SOURCE},${metadata}::jsonb,now(),now()
        )
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          body_text=EXCLUDED.body_text,
          status='active',
          source=${SOURCE},
          content_type=${CONTENT_TYPE},
          metadata=EXCLUDED.metadata,
          updated_at=now()
        WHERE core.contents.content_type=${CONTENT_TYPE}
          AND core.contents.source=${SOURCE}
        RETURNING id,title,body_text,metadata,status,created_at,updated_at
      `;
      if (!rows[0]) return res.status(409).json({ ok: false, error: 'zine_id_conflict' });
      return res.status(200).json({
        ok: true,
        storage: config.production ? 'shared-content-core' : 'preview-core',
        item: normalizeRow(rows[0], true)
      });
    } catch (error) {
      console.error('[zine-projects-save]', error);
      return res.status(500).json({ ok: false, error: 'zine_save_failed', code: error?.code || null });
    }
  }

  if (req.method === 'DELETE') {
    const body = parseBody(req) || {};
    const id = trimmed(body.id || req.query?.id, 180);
    if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
    try {
      const rows = await sql`
        UPDATE core.contents
        SET status='archived', updated_at=now(),
            metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{status}',to_jsonb('ARCHIVED'::text),true)
        WHERE id=${id}
          AND content_type=${CONTENT_TYPE}
          AND source=${SOURCE}
          AND status='active'
        RETURNING id
      `;
      if (!rows[0]) return res.status(404).json({ ok: false, error: 'zine_project_not_found' });
      return res.status(200).json({ ok: true, id, archived: true });
    } catch (error) {
      console.error('[zine-projects-archive]', error);
      return res.status(500).json({ ok: false, error: 'zine_archive_failed', code: error?.code || null });
    }
  }

  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
