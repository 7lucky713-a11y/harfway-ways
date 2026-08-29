import { neon } from '@neondatabase/serverless';
import { authorizeArchiveRequest, archiveCors } from './archive-core.js';
import { deleteMemoryAcknowledgement, memoryGithubMirrorStatus, readMemoryAcknowledgements, syncMemoryInboxSnapshot } from './memory-github-mirror.js';

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
  const archived = text(row.record_status, 32).toLowerCase() === 'archived';
  return {
    id: text(row.id, 180),
    project: text(meta.project || 'GLOBAL', 80).toUpperCase(),
    body: text(row.body_text || row.excerpt, 8000),
    status: archived ? 'ARCHIVED' : text(meta.status || 'INBOX', 32).toUpperCase(),
    archived,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}
function containsSecretLikeContent(value) {
  const s = String(value || '');
  return /(?:api[_-]?key|password|passwd|secret|bearer\s+[a-z0-9._-]{12,}|token\s*[:=]\s*[a-z0-9._-]{12,})/i.test(s);
}
function confirmationStatus(result = {}) {
  return {
    ok: result.ok !== false,
    configured: Boolean(result.configured),
    skipped: Boolean(result.skipped),
    reason: result.reason || null,
    error: result.error || null,
    count: Number(result.count || 0),
    updatedAt: result.updatedAt || null,
    targetPath: result.targetPath || 'knowledge/MEMORY_ACKS.json',
    meaning: 'ChatGPTが本文を読んだ印。VERIFIED・対応完了・集合知化を意味しない。'
  };
}
function applyConfirmations(items = [], acknowledgementResult = {}) {
  const acks = acknowledgementResult?.acks && typeof acknowledgementResult.acks === 'object'
    ? acknowledgementResult.acks
    : {};
  return items.map(item => {
    const ack = acks[item.id];
    return {
      ...item,
      confirmed: Boolean(ack?.confirmedAt),
      confirmedAt: ack?.confirmedAt || null,
      confirmationSource: ack?.source || null
    };
  });
}
async function readMemoRows(sql, recordStatus = 'active') {
  return sql`
    SELECT id, body_text, excerpt, metadata, status AS record_status, created_at, updated_at
    FROM core.contents
    WHERE content_type='memory_memo' AND source='memory-inbox' AND status=${recordStatus}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 300
  `;
}
async function readActiveMemoRows(sql) {
  return readMemoRows(sql, 'active');
}
async function readArchivedMemoRows(sql) {
  return readMemoRows(sql, 'archived');
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
async function setMemoArchived(sql, id, archived) {
  const status = archived ? 'archived' : 'active';
  const metadataStatus = archived ? 'ARCHIVED' : 'INBOX';
  const rows = await sql`
    UPDATE core.contents
    SET status=${status},
        metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', to_jsonb(${metadataStatus}::text), true),
        updated_at=now()
    WHERE id=${id} AND content_type='memory_memo' AND source='memory-inbox'
    RETURNING id, body_text, excerpt, metadata, status AS record_status, created_at, updated_at
  `;
  return rows[0] ? normalize(rows[0]) : null;
}
async function purgeMemo(sql, id) {
  const rows = await sql`
    DELETE FROM core.contents
    WHERE id=${id} AND content_type='memory_memo' AND source='memory-inbox'
    RETURNING id, body_text, excerpt, metadata, status AS record_status, created_at, updated_at
  `;
  return rows[0] ? normalize(rows[0]) : null;
}
async function archiveMemoIds(sql, ids = []) {
  const safeIds = [...new Set(ids.map(id => text(id, 180)).filter(Boolean))].slice(0, 300);
  if (!safeIds.length) return [];
  const idJson = JSON.stringify(safeIds);
  const rows = await sql`
    UPDATE core.contents
    SET status='archived',
        metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', to_jsonb('ARCHIVED'::text), true),
        updated_at=now()
    WHERE content_type='memory_memo'
      AND source='memory-inbox'
      AND status='active'
      AND id IN (SELECT jsonb_array_elements_text(${idJson}::jsonb))
    RETURNING id, body_text, excerpt, metadata, status AS record_status, created_at, updated_at
  `;
  return rows.map(normalize);
}
async function readConfirmationsForEnvironment(config) {
  if (!config?.production) {
    return {
      ok:true,
      skipped:true,
      reason:'preview_no_github_read',
      configured:false,
      acks:{},
      count:0,
      targetPath:'knowledge/MEMORY_ACKS.json'
    };
  }
  try {
    return await readMemoryAcknowledgements();
  } catch (error) {
    console.error('[memory-confirmations-read]', error?.message || error);
    return {
      ok:false,
      error:'memory_confirmations_read_failed',
      configured:Boolean(memoryGithubMirrorStatus().configured),
      acks:{},
      count:0,
      targetPath:'knowledge/MEMORY_ACKS.json'
    };
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
        archivedItems:[],
        confirmations:confirmationStatus({ ok:true, skipped:true, reason:'preview_no_github_read', configured:false }),
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
      archivedItems:[],
      confirmations:confirmationStatus({ ok:true, skipped:true, reason:'database_not_configured', configured:false }),
      mirror:memoryGithubMirrorStatus(),
      error:req.method === 'GET' ? null : (config?.production ? 'memory_database_not_configured' : 'preview_database_not_configured')
    });
  }

  const sql = neon(config.url);

  if (req.method === 'GET') {
    try {
      const [activeRows, archivedRows, acknowledgementResult] = await Promise.all([
        readActiveMemoRows(sql),
        readArchivedMemoRows(sql),
        readConfirmationsForEnvironment(config)
      ]);
      return res.status(200).json({
        ok:true,
        environment:process.env.VERCEL_ENV || 'development',
        storage:config.production ? 'shared-content-core' : 'preview-core',
        items:applyConfirmations(activeRows.map(normalize), acknowledgementResult),
        archivedItems:applyConfirmations(archivedRows.map(normalize), acknowledgementResult),
        confirmations:confirmationStatus(acknowledgementResult),
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
        RETURNING id,body_text,excerpt,metadata,status AS record_status,created_at,updated_at
      `;
      const item = { ...normalize(rows[0]), confirmed:false, confirmedAt:null, confirmationSource:null };
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
      let item = await setMemoArchived(sql, id, true);
      const acknowledgementResult = await readConfirmationsForEnvironment(config);
      if (item) item = applyConfirmations([item], acknowledgementResult)[0];
      const mirror = config.production
        ? await syncMirror(sql)
        : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
      return res.status(200).json({ ok:true, id, item, archived:true, legacyDelete:true, confirmations:confirmationStatus(acknowledgementResult), mirror });
    } catch (error) {
      console.error('[memory-memos-archive-legacy]', error);
      return res.status(500).json({ ok:false, error:'memory_memo_archive_failed', code:error?.code || null });
    }
  }

  if (req.method === 'PATCH') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { body = {}; }
    }
    const action = text(body.action || 'sync_all', 80);

    if (action === 'sync_all') {
      const mirror = config.production
        ? await syncMirror(sql)
        : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
      return res.status(200).json({ ok:true, action, mirror });
    }

    if (action === 'purge') {
      const id = text(body.id, 180);
      if (!id) return res.status(400).json({ ok:false, error:'id_required' });
      try {
        const item = await purgeMemo(sql, id);
        if (!item) return res.status(404).json({ ok:false, error:'memory_memo_not_found' });
        const mirror = config.production
          ? await syncMirror(sql)
          : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
        let acknowledgementCleanup = { ok:true, skipped:true, reason:'preview_no_github_write', removed:false };
        if (config.production) {
          try {
            acknowledgementCleanup = await deleteMemoryAcknowledgement(id);
          } catch (error) {
            console.error('[memory-memos-purge-ack]', error?.message || error);
            acknowledgementCleanup = { ok:false, error:'memory_ack_cleanup_failed', removed:false };
          }
        }
        return res.status(200).json({
          ok:true,
          action,
          id,
          item,
          purged:true,
          mirror,
          acknowledgementCleanup
        });
      } catch (error) {
        console.error('[memory-memos-purge]', error);
        return res.status(500).json({ ok:false, error:'memory_memo_purge_failed', code:error?.code || null });
      }
    }

    if (action === 'archive_confirmed') {
      try {
        const [activeRows, acknowledgementResult] = await Promise.all([
          readActiveMemoRows(sql),
          readConfirmationsForEnvironment(config)
        ]);
        if (config.production && !acknowledgementResult.ok) {
          return res.status(503).json({ ok:false, error:'memory_confirmations_unavailable', confirmations:confirmationStatus(acknowledgementResult) });
        }
        const activeItems = applyConfirmations(activeRows.map(normalize), acknowledgementResult);
        const confirmedIds = activeItems.filter(item => item.confirmed).map(item => item.id);
        const archivedItems = await archiveMemoIds(sql, confirmedIds);
        const items = applyConfirmations(archivedItems, acknowledgementResult);
        const mirror = config.production
          ? await syncMirror(sql)
          : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
        return res.status(200).json({
          ok:true,
          action,
          archivedCount:items.length,
          items,
          confirmations:confirmationStatus(acknowledgementResult),
          mirror
        });
      } catch (error) {
        console.error('[memory-memos-archive-confirmed]', error);
        return res.status(500).json({ ok:false, error:'memory_memo_archive_confirmed_failed', code:error?.code || null });
      }
    }

    if (action === 'archive' || action === 'restore') {
      const id = text(body.id, 180);
      if (!id) return res.status(400).json({ ok:false, error:'id_required' });
      try {
        const archived = action === 'archive';
        let item = await setMemoArchived(sql, id, archived);
        if (!item) return res.status(404).json({ ok:false, error:'memory_memo_not_found' });
        const acknowledgementResult = await readConfirmationsForEnvironment(config);
        item = applyConfirmations([item], acknowledgementResult)[0];
        const mirror = config.production
          ? await syncMirror(sql)
          : { ok:true, skipped:true, reason:'preview_no_github_write', ...memoryGithubMirrorStatus() };
        return res.status(200).json({ ok:true, action, item, confirmations:confirmationStatus(acknowledgementResult), mirror });
      } catch (error) {
        console.error(`[memory-memos-${action}]`, error);
        return res.status(500).json({ ok:false, error:`memory_memo_${action}_failed`, code:error?.code || null });
      }
    }

    return res.status(400).json({ ok:false, error:'unsupported_action' });
  }

  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}
