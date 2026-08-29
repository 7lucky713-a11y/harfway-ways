import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

const KINDS = new Set(['FACT','DECISION','PATTERN','FAILURE','TODO','ARCHITECTURE','OPERATION']);
const CONFIDENCE = new Set(['VERIFIED','KNOWN','VERIFY','DEPRECATED']);

const SEED = [
  {
    id:'knowledge-preview-production-rule', title:'Preview → 本番の昇格ルール',
    body:'通常の変更はPreviewで確認し、ユーザーの「本番OK」後にProductionへ反映する。Productionへ直接変更しない。',
    project:'GLOBAL', kind:'DECISION', confidence:'VERIFIED', tags:['preview','production','safety'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  },
  {
    id:'knowledge-external-memory', title:'集合知は外部共有メモリとして持つ',
    body:'ChatGPT本体を会話ごとに再学習させるのではなく、全Chatが読み書きする共通ナレッジ層をGitHub / Shared Content Coreに持つ。',
    project:'GLOBAL', kind:'ARCHITECTURE', confidence:'VERIFIED', tags:['knowledge','chat','memory'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  },
  {
    id:'knowledge-chat-start-order', title:'Chat開始時の確認順',
    body:'MASTER_STATE → PROJECT_INDEX → 対象projects/*.md → GitHub実コード → Preview / Production → DB / APIの順で照合し、台帳と実環境が違う場合は実環境を優先する。',
    project:'GLOBAL', kind:'PATTERN', confidence:'VERIFIED', tags:['handoff','chat','workflow'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  },
  {
    id:'knowledge-lifecycle', title:'知識のライフサイクル',
    body:'会話から得た知識はLEARN → VERIFY → PROMOTE → DEPRECATEの順で扱う。未確認情報を正本へ直接昇格させない。',
    project:'GLOBAL', kind:'PATTERN', confidence:'KNOWN', tags:['knowledge','verification'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  },
  {
    id:'knowledge-control-center', title:'Control Centerは運営側の共通入口',
    body:'HARF-WAYの現役ツール、稼働状態、Analytics、OPSを1箇所で追う管理入口。新規Productionツールは自動同期する方向を標準とする。',
    project:'CONTROL_CENTER', kind:'FACT', confidence:'VERIFIED', tags:['control-center','hub','ops'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  },
  {
    id:'knowledge-two-layer', title:'WordPressとVercelの二層構造',
    body:'WordPressは記事・文脈・SEO・完成した編集物、VercelはDB・フィード・棚・ショーケース・管理ツール・体験UIを主に担当する。',
    project:'GLOBAL', kind:'ARCHITECTURE', confidence:'KNOWN', tags:['wordpress','vercel','architecture'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  },
  {
    id:'knowledge-context-alert', title:'チャット切断前にセーブ期間を確保する',
    body:'会話が長くなりコンテキスト切れのリスクが高まる前に「セーブ推奨」、さらに進んだら「チャット切替推奨」を通知し、現在地と次の一手を台帳へ保存する。',
    project:'GLOBAL', kind:'OPERATION', confidence:'KNOWN', tags:['handoff','context','alert'], visibility:'shared',
    updatedAt:'2026-08-29T00:00:00+09:00'
  }
];

function string(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}
function list(value, max = 20) {
  const arr = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(arr.map(x => string(x, 64)).filter(Boolean))].slice(0, max);
}
function safeKind(value) {
  const v = string(value, 32).toUpperCase();
  return KINDS.has(v) ? v : 'FACT';
}
function safeConfidence(value) {
  const v = string(value, 32).toUpperCase();
  return CONFIDENCE.has(v) ? v : 'VERIFY';
}
function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}
function normalize(row = {}) {
  const meta = parseMetadata(row.metadata);
  return {
    id: string(row.id, 160),
    title: string(row.title, 240),
    body: string(row.body ?? row.body_text ?? row.excerpt, 8000),
    project: string(meta.project || row.project || 'GLOBAL', 80).toUpperCase(),
    kind: safeKind(meta.kind || row.kind),
    confidence: safeConfidence(meta.confidence || row.confidence),
    tags: list(meta.tags || row.tags),
    visibility: string(meta.visibility || row.visibility || 'shared', 24),
    sourceChat: string(meta.sourceChat || meta.source_chat || '', 240),
    evidence: list(meta.evidence || [], 10),
    source: string(row.source || 'collective-knowledge', 80),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null
  };
}
function seedItems() { return SEED.map(x => normalize({ ...x, source:'seed' })); }
function filterItems(items, query = {}) {
  const project = string(query.project, 80).toUpperCase();
  const kind = string(query.kind, 32).toUpperCase();
  const confidence = string(query.confidence, 32).toUpperCase();
  const q = string(query.q, 160).toLowerCase();
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 500);
  return items.filter(item => {
    if (item.visibility !== 'shared') return false;
    if (project && project !== 'ALL' && item.project !== project) return false;
    if (kind && kind !== 'ALL' && item.kind !== kind) return false;
    if (confidence && confidence !== 'ALL' && item.confidence !== confidence) return false;
    if (q && ![item.title,item.body,item.project,item.kind,item.confidence,...item.tags].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).slice(0, limit);
}
async function readDatabase(config) {
  if (!config?.url) return { configured:false, items:[], error:'knowledge_database_not_configured' };
  try {
    const sql = neon(config.url);
    const rows = await sql`
      SELECT id,title,excerpt,body_text,source,metadata,created_at,updated_at
      FROM core.content_catalog
      WHERE content_type='knowledge' AND source='collective-knowledge'
      ORDER BY updated_at DESC
      LIMIT 500
    `;
    return { configured:true, items:rows.map(normalize), error:null };
  } catch (error) {
    console.warn('[knowledge-read]', error?.code || error?.message || error);
    return { configured:true, items:[], error:error?.code || 'knowledge_read_failed' };
  }
}
function summary(items) {
  const count = name => items.filter(x => x.confidence === name).length;
  return {
    total: items.length,
    verified: count('VERIFIED'), known: count('KNOWN'), verify: count('VERIFY'), deprecated: count('DEPRECATED'),
    projects: [...new Set(items.map(x => x.project))].sort(),
    kinds: [...new Set(items.map(x => x.kind))].sort()
  };
}
function hasSecretLikeKeys(body) {
  const text = JSON.stringify(body || {}).toLowerCase();
  return /(?:password|passwd|secret|api[_-]?key|token|authorization|bearer)/.test(text);
}
function makeId(title) {
  const slug = string(title, 80).normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'entry';
  return `knowledge-${Date.now()}-${slug}`;
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const config = archiveDatabaseConfig();
    const db = await readDatabase(config);
    const sourceItems = db.items.length ? db.items : seedItems();
    const items = filterItems(sourceItems, req.query || {});
    return res.status(200).json({
      ok:true,
      environment: process.env.VERCEL_ENV || 'development',
      storage: db.items.length ? (config.production ? 'shared-content-core' : 'preview-core') : 'safe-seed-fallback',
      writable: Boolean(config?.url),
      databaseConfigured: Boolean(config?.url),
      databaseError: db.error,
      summary: summary(sourceItems.filter(x => x.visibility === 'shared')),
      items
    });
  }

  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { return res.status(400).json({ ok:false, error:'invalid_json' }); }
    }
    if (hasSecretLikeKeys(body)) return res.status(400).json({ ok:false, error:'secret_like_content_rejected' });

    const auth = await authorizeArchiveRequest(req);
    if (!auth.ok) return res.status(auth.status || 401).json({ ok:false, error:auth.error || 'unauthorized' });
    const config = auth.config;
    if (!config?.url) return res.status(503).json({ ok:false, error:config?.production ? 'knowledge_database_not_configured' : 'preview_database_not_configured' });

    const title = string(body.title, 240);
    const content = string(body.body || body.content, 8000);
    if (!title || !content) return res.status(400).json({ ok:false, error:'title_and_body_required' });
    const id = string(body.id, 160) || makeId(title);
    const metadata = {
      project:string(body.project || 'GLOBAL',80).toUpperCase(),
      kind:safeKind(body.kind),
      confidence:safeConfidence(body.confidence),
      tags:list(body.tags),
      visibility:'shared',
      sourceChat:string(body.sourceChat || '',240),
      evidence:list(body.evidence || [],10)
    };
    const excerpt = content.slice(0, 320);
    try {
      const sql = neon(config.url);
      const metaJson = JSON.stringify(metadata);
      const rows = await sql`
        INSERT INTO core.contents (id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
        VALUES (${id},'knowledge',${title},${`knowledge://${id}`},${excerpt},${content},'active','collective-knowledge',${metaJson}::jsonb,now(),now())
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,body_text=EXCLUDED.body_text,status='active',source='collective-knowledge',metadata=EXCLUDED.metadata,updated_at=now()
        RETURNING id,title,excerpt,body_text,source,metadata,created_at,updated_at
      `;
      return res.status(200).json({ ok:true, environment:process.env.VERCEL_ENV || 'development', storage:config.production?'shared-content-core':'preview-core', item:normalize(rows[0] || {}) });
    } catch (error) {
      console.error('[knowledge-write]', error);
      return res.status(500).json({ ok:false, error:'knowledge_write_failed', code:error?.code || null });
    }
  }

  return res.status(405).json({ ok:false, error:'method_not_allowed' });
}
