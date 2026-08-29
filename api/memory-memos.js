import { neon } from '@neondatabase/serverless';
import { authorizeArchiveRequest, archiveCors } from './archive-core.js';
import { memoryGithubMirrorStatus, syncMemoryInboxSnapshot } from './memory-github-mirror.js';

function text(value, max = 8000) {
  return String(value ?? '').trim().slice(0, max);
}
function makeId() {
  return `memory-memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}
function normalize(row = {}) {
  const meta = parseMetadata(row.metadata);
  return {
    id: text(row.id, 180),
    project: text(meta.project || 'GLOBAL', 80).toUpperCase(),
    body: text(row.body_text || row.excerpt, 8000),
    status: text(meta.status || 'INBOX', 32).toUpperCase(),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}
function containsSecretLikeContent(value) {
  const s = String(value || '');
  return /(?:api[_-]?key|password|passwd|secret|bearer\s+[a-z0-9._-]{12,}|token\s*[:=]\s*[a-z0-9._-]{12,})/i.test(s);
}
async function readActiveMemoRows(sql) {
  return sql`
    SELECT id, body_text, excerpt, metadata, created_at, updated_at
    FROM core.contents
    WHERE content_type='memory_memo' AND source='memory-inbox' AND status='active'
    ORDER BY created_at DESC
    LIMIT 300
  `;
}
async function syncMirror(sql) {
  try {
    const rows = await readActiveMemoRows(sql);
    return await syncMemoryInboxSnapshot(rows.map(normalize));
  } catch (error) {
    console.error('[memory-github-mirror]', error?.message || error);
    return { ok:false, error:'github_mirror_failed', ...memoryGithubMirrorStatus() };
  }
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await authorizeArchiveRequest(req);
  if (!auth.ok) {
    if (process.env.VERCEL_ENV !== 'production' && req.method === 'GET') {
      return res.status(200).json({
        ok:true,
        environment:process.env.VERCEL_ENV || 'development',
        storage:'browser-local',
        items:[],
        mirror:{ ...memoryGithubMirrorStatus(), ok:true, skipped:true, reason:'preview_no_github_write' }
      });
    }
    return res.status(auth.status || 401).json({ ok:false, error:auth.error || 'unauthorized' });
  }
  const config = auth.config;
  if (!config?.url) {
    return res.status(req.method === 'GET' ? 200 : 503).json({
      ok: req.method === 'GET',
      environment: process.env.VERCEL_ENV || 'development',
      storage:'browser-local',
      items:[],
      mirror:memoryGithubMirrorStatus(),
      error:req.method === 'GET' ? null : (config?.production ? 'memory_database_not_configured' : 'preview_database_not_configured')
    });
  }

  const sql = neon(config.url);

  if (req.method === 'GET') {
    try {
      const rows = await readActiveMemoRows(sql);
      return res.status(200).json({
        ok:true,
        environment:process.env.VERCEL_ENV || 'development',
        storage:config.production ? 'shared-content-core' : 'preview-core',
        items:rows.map(normalize),
        mirror:memoryGithubMirrorStatus()
      });
    } catch (error) {
      console.error('[memory-memos-read]', error);
      return res.status(500).json({ ok:false, error:'memory_memos_read_failed', code:error?.code || null });
    }
  }

  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { return res.status(400).json({ ok:false, error:'invalid_json' }); }
    }
    const content = text(body.body || body.content, 8000);
    const project = text(body.project || 'GLOBAL', 80).toUpperCase();
    if (!content) return res.status(400).json({ ok:false, error:'body_required' });
    if (containsSecretLikeContent(content)) return res.status(400).json({ ok:false, error:'secret_like_content_rejected' });
    const id = text(body.id, 180) || makeId();
    const metadata = JSON.stringify({ project, status:'INBOX', source:'user-memory' });
    try {
      const rows = await sql`
        INSERT INTO core.contents (id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
        VALUES (${id},'memory_memo','MEMORY MEMO',${`memory://${id}`},${content.slice(0,320)},${content},'active','memory-inbox',${metadata}::jsonb,now(),now())
        RETURNING id,body_text,excerpt,metadata,created_at,updated_at
      `;
      const item = normalize(rows[0]);
      const mirror = config.production
        ? await syncMirror(sql)
        : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
      return res.status(200).json({ ok:true, storage:config.production?'shared-content-core':'preview-core', item, mirror });
    } catch (error) {
      console.error('[memory-memos-write]', error);
      return res.status(500).json({ ok:false, error:'memory_memo_write_failed', code:error?.code || null });
    }
  }

  if (req.method === 'DELETE') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { body = {}; }
    }
    const id = text(body.id || req.query?.id, 180);
    if (!id) return res.status(400).json({ ok:false, error:'id_required' });
    try {
      await sql`
        UPDATE core.contents
        SET status='archived', updated_at=now()
        WHERE id=${id} AND content_type='memory_memo' AND source='memory-inbox'
      `;
      const mirror = config.production
        ? await syncMirror(sql)
        : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
      return res.status(200).json({ ok:true, id, mirror });
    } catch (error) {
      console.error('[memory-memos-delete]', error);
      return res.status(500).json({ ok:false, error:'memory_memo_delete_failed', code:error?.code || null });
    }
  }

  if (req.method === 'PATCH') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { body = {}; }
    }
    const action = text(body.action || 'sync_all', 80);
    if (action !== 'sync_all') return res.status(400).json({ ok:false, error:'unsupported_action' });
    const mirror = config.production
      ? await syncMirror(sql)
      : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
    return res.status(200).json({ ok:true, action, mirror });
  }

  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}
