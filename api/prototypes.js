import { neon } from '@neondatabase/serverless';
import { authorizeArchiveRequest, archiveCors } from './archive-core.js';

const CONTENT_TYPE = 'prototype';
const SOURCE = 'prototype-lab';

function text(value, max = 200000) {
  return String(value ?? '').slice(0, max);
}

function trimmed(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function makeId() {
  return `prototype-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function containsSecretLikeContent(value) {
  const source = String(value || '');
  return /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'`]?[A-Za-z0-9._-]{12,}/i.test(source)
    || /bearer\s+[A-Za-z0-9._-]{16,}/i.test(source);
}

function normalizePayload(input = {}) {
  return {
    html: text(input.html, 200000),
    css: text(input.css, 200000),
    js: text(input.js, 200000),
    notes: trimmed(input.notes, 8000),
    viewport: ['desktop', 'tablet', 'mobile'].includes(input.viewport) ? input.viewport : 'desktop'
  };
}

function normalizeRow(row = {}, includeSource = false) {
  const meta = parseJson(row.metadata, {});
  const payload = includeSource ? parseJson(row.body_text, {}) : null;
  return {
    id: trimmed(row.id, 180),
    title: trimmed(row.title || 'Untitled prototype', 160),
    notes: trimmed(row.excerpt || payload?.notes || '', 8000),
    viewport: ['desktop', 'tablet', 'mobile'].includes(meta.viewport) ? meta.viewport : (payload?.viewport || 'desktop'),
    status: trimmed(meta.status || 'DRAFT', 32).toUpperCase(),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ...(includeSource ? {
      html: text(payload?.html, 200000),
      css: text(payload?.css, 200000),
      js: text(payload?.js, 200000)
    } : {})
  };
}

function parseBody(req) {
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return null; }
  }
  return body && typeof body === 'object' ? body : {};
}

export default async function handler(req, res) {
  archiveCors(res);
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
      error: req.method === 'GET' ? null : 'prototype_database_not_configured'
    });
  }

  const sql = neon(config.url);

  if (req.method === 'GET') {
    const id = trimmed(req.query?.id, 180);
    try {
      if (id) {
        const rows = await sql`
          SELECT id,title,excerpt,body_text,metadata,status,created_at,updated_at
          FROM core.contents
          WHERE id=${id}
            AND content_type=${CONTENT_TYPE}
            AND source=${SOURCE}
            AND status='active'
          LIMIT 1
        `;
        if (!rows[0]) return res.status(404).json({ ok:false, error:'prototype_not_found' });
        return res.status(200).json({
          ok:true,
          environment:process.env.VERCEL_ENV || 'development',
          storage:config.production ? 'shared-content-core' : 'preview-core',
          authRequired:Boolean(auth.authRequired),
          item:normalizeRow(rows[0], true)
        });
      }

      const rows = await sql`
        SELECT id,title,excerpt,metadata,status,created_at,updated_at
        FROM core.contents
        WHERE content_type=${CONTENT_TYPE}
          AND source=${SOURCE}
          AND status='active'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 250
      `;
      return res.status(200).json({
        ok:true,
        environment:process.env.VERCEL_ENV || 'development',
        storage:config.production ? 'shared-content-core' : 'preview-core',
        authRequired:Boolean(auth.authRequired),
        items:rows.map(row => normalizeRow(row, false))
      });
    } catch (error) {
      console.error('[prototype-lab-read]', error);
      return res.status(500).json({ ok:false, error:'prototype_read_failed', code:error?.code || null });
    }
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ ok:false, error:'invalid_json' });
    const id = trimmed(body.id, 180) || makeId();
    const title = trimmed(body.title, 160) || 'Untitled prototype';
    const payload = normalizePayload(body);
    const sourceText = `${payload.html}\n${payload.css}\n${payload.js}`;
    if (containsSecretLikeContent(sourceText)) {
      return res.status(400).json({ ok:false, error:'secret_like_content_rejected' });
    }
    const serialized = JSON.stringify(payload);
    const metadata = JSON.stringify({
      status:'DRAFT',
      viewport:payload.viewport,
      source:'prototype-lab',
      safeRuntime:'sandboxed-srcdoc-v1'
    });
    try {
      const rows = await sql`
        INSERT INTO core.contents (
          id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at
        ) VALUES (
          ${id},${CONTENT_TYPE},${title},${`prototype://${id}`},${payload.notes.slice(0,1000)},${serialized},'active',${SOURCE},${metadata}::jsonb,now(),now()
        )
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          excerpt=EXCLUDED.excerpt,
          body_text=EXCLUDED.body_text,
          status='active',
          source=${SOURCE},
          content_type=${CONTENT_TYPE},
          metadata=EXCLUDED.metadata,
          updated_at=now()
        WHERE core.contents.content_type=${CONTENT_TYPE}
          AND core.contents.source=${SOURCE}
        RETURNING id,title,excerpt,body_text,metadata,status,created_at,updated_at
      `;
      if (!rows[0]) return res.status(409).json({ ok:false, error:'prototype_id_conflict' });
      return res.status(200).json({
        ok:true,
        storage:config.production ? 'shared-content-core' : 'preview-core',
        item:normalizeRow(rows[0], true)
      });
    } catch (error) {
      console.error('[prototype-lab-save]', error);
      return res.status(500).json({ ok:false, error:'prototype_save_failed', code:error?.code || null });
    }
  }

  if (req.method === 'DELETE') {
    const body = parseBody(req) || {};
    const id = trimmed(body.id || req.query?.id, 180);
    if (!id) return res.status(400).json({ ok:false, error:'id_required' });
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
      if (!rows[0]) return res.status(404).json({ ok:false, error:'prototype_not_found' });
      return res.status(200).json({ ok:true, id, archived:true });
    } catch (error) {
      console.error('[prototype-lab-delete]', error);
      return res.status(500).json({ ok:false, error:'prototype_archive_failed', code:error?.code || null });
    }
  }

  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}
