import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig } from '../api/archive-core.js';

export const PROD_ORIGIN='https://ways.harf-way.com';
const PROJECT_ID='wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID='br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID='br-bold-butterfly-aw2ztgbd';
const NOTE_PUBLIC_SOURCE='game-note-publications';
const NOTE_PUBLIC_TYPE='game_note_public_snapshot';
const WORD_PUBLIC_SOURCE='glossary-publications';
const WORD_PUBLIC_TYPE='glossary_public_snapshot';

export const clean=(value,max=280)=>String(value??'').trim().slice(0,max);
export const list=(value,max=60,len=220)=>{if(!Array.isArray(value))return[];const out=[],seen=new Set();for(const item of value){const s=clean(item,len);if(!s||seen.has(s))continue;seen.add(s);out.push(s);if(out.length>=max)break}return out};
export const publicNoteId=(id='')=>clean(id,180).replace(/^game-notes:note:/,'').replace(/^game-notes:public-note:/,'');
export const publicWordId=(id='')=>clean(id,180).replace(/^game-notes:glossary:/,'').replace(/^game-notes:public-glossary:/,'');

export function slugifyPublic(value,fallback='item'){
  let slug='';
  try{slug=String(value??'').normalize('NFKC').toLowerCase().trim()}catch{slug=String(value??'').toLowerCase().trim()}
  slug=slug.replace(/[\/?#%]+/g,'-').replace(/\s+/g,'-').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/-+/g,'-').replace(/^[-_]+|[-_]+$/g,'');
  return (slug||fallback).slice(0,110);
}
export function notePublicSlug(item={}){const fixed=clean(item.publicSlug,150);return fixed?slugifyPublic(fixed,'play-note').slice(0,150):`${slugifyPublic(item.gameName,'game')}-${slugifyPublic(item.title,'play-note')}`.slice(0,150)}
export function wordPublicSlug(item={}){return `${slugifyPublic(item.gameName,'game')}-${slugifyPublic(item.term||item.title,'word')}`.slice(0,150)}
export function notePublicPath(item={}){const id=publicNoteId(item.id||item.sourceNoteId||'');return id?`/notes/${encodeURIComponent(id)}/${encodeURIComponent(notePublicSlug(item))}/`:'/notes/'}
export function wordPublicPath(item={}){const id=publicWordId(item.id||item.sourceGlossaryId||'');return id?`/words/${encodeURIComponent(id)}/${encodeURIComponent(wordPublicSlug(item))}/`:'/words/'}

function databaseConfig(){
  const production=process.env.VERCEL_ENV==='production';
  return production
    ? {production,expectedBranchId:PRODUCTION_BRANCH_ID,url:archiveDatabaseConfig().url||''}
    : {production,expectedBranchId:PREVIEW_BRANCH_ID,url:process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL||''};
}
export async function publicDatabaseContext(){
  const config=databaseConfig();
  if(!config.url){const e=new Error(config.production?'production_database_not_configured':'preview_database_not_configured');e.status=503;throw e}
  const sql=neon(config.url);
  const rows=await sql`SELECT current_setting('neon.project_id',true)::text AS project_id,current_setting('neon.branch_id',true)::text AS branch_id,to_regclass('core.contents')::text AS contents_table`;
  const info=rows[0]||{},projectId=clean(info.project_id,80),branchId=clean(info.branch_id,80),tableReady=clean(info.contents_table,120)==='core.contents';
  if(projectId!==PROJECT_ID||branchId!==config.expectedBranchId||!tableReady){const e=new Error('database_identity_mismatch');e.status=409;e.details={projectId:projectId||null,branchId:branchId||null,expectedBranchId:config.expectedBranchId,tableReady};throw e}
  return{sql,production:config.production,branchId};
}
function noteFromRow(row){
  const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  const item={id:publicNoteId(row.id),title:row.title||'',body:row.body_text||'',excerpt:row.excerpt||'',gameName:clean(m.gameName,220),typeName:clean(m.typeName,160),sourceNoteId:clean(m.sourceNoteId,180),relatedWaysIds:list(m.relatedWaysIds),sourceCreatedAt:m.sourceCreatedAt||null,publishedAt:m.publishedAt||row.created_at||null,snapshotUpdatedAt:m.snapshotUpdatedAt||row.updated_at||null,publicSlug:clean(m.publicSlug,150),seoTitle:clean(m.seoTitle,90)};
  item.url=notePublicPath(item);return item;
}
function wordFromRow(row){
  const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  const item={id:publicWordId(row.id),term:row.title||'',description:row.body_text||'',excerpt:row.excerpt||'',gameName:clean(m.gameName,220),sourceGlossaryId:clean(m.sourceGlossaryId,180),relatedWaysIds:list(m.relatedWaysIds),relatedPublicNoteIds:list(m.relatedPublicNoteIds,40,180),relatedPublicGlossaryIds:list(m.relatedPublicGlossaryIds,40,180),sourceCreatedAt:m.sourceCreatedAt||null,publishedAt:m.publishedAt||row.created_at||null,snapshotUpdatedAt:m.snapshotUpdatedAt||row.updated_at||null};
  item.url=wordPublicPath(item);return item;
}
export async function listPublicNotes(sql){const rows=await sql`SELECT id,title,excerpt,body_text,metadata,created_at,updated_at FROM core.contents WHERE source=${NOTE_PUBLIC_SOURCE} AND content_type=${NOTE_PUBLIC_TYPE} AND status='active' ORDER BY COALESCE((metadata->>'publishedAt')::timestamptz,created_at) DESC`;return rows.map(noteFromRow)}
export async function listPublicWords(sql){const rows=await sql`SELECT id,title,excerpt,body_text,metadata,created_at,updated_at FROM core.contents WHERE source=${WORD_PUBLIC_SOURCE} AND content_type=${WORD_PUBLIC_TYPE} AND status='active' ORDER BY COALESCE((metadata->>'publishedAt')::timestamptz,created_at) DESC`;return rows.map(wordFromRow)}

export function requestOrigin(req){
  if(process.env.VERCEL_ENV==='production')return PROD_ORIGIN;
  const forwarded=Array.isArray(req?.headers?.['x-forwarded-host'])?req.headers['x-forwarded-host'][0]:req?.headers?.['x-forwarded-host'];
  const host=String(forwarded||req?.headers?.host||'').split(',')[0].trim();
  const proto=String(req?.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()||'https';
  return host?`${proto}://${host}`:PROD_ORIGIN;
}
export function absoluteUrl(req,path='/'){try{return new URL(path,requestOrigin(req)).toString()}catch{return`${PROD_ORIGIN}${path}`}}
export function escapeHtml(value=''){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
export function escapeXml(value=''){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]))}
export function excerpt(value='',max=160){const text=String(value??'').replace(/\s+/g,' ').trim();return text.length<=max?text:`${text.slice(0,Math.max(0,max-1)).trimEnd()}…`}
export function safeUrl(value=''){try{const url=new URL(String(value||''));return['http:','https:'].includes(url.protocol)?url.toString():''}catch{return''}}
export function formatJapaneseDate(value){if(!value)return'';try{return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',day:'numeric'}).format(new Date(value))}catch{return''}}
export function isoDate(value){if(!value)return'';try{return new Date(value).toISOString()}catch{return''}}
export function jsonLd(data){return JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')}
export function seoHead(req,{title,description,path,type='article',schema=null}={}){
  const canonical=absoluteUrl(req,path||'/');
  const robots=process.env.VERCEL_ENV==='production'?'index,follow':'noindex,nofollow,noarchive';
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${robots}"><meta name="description" content="${escapeHtml(description||'')}"><meta name="theme-color" content="#171815"><title>${escapeHtml(title||'HARF-WAY')}</title><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="${escapeHtml(type)}"><meta property="og:site_name" content="HARF-WAY"><meta property="og:title" content="${escapeHtml(title||'HARF-WAY')}"><meta property="og:description" content="${escapeHtml(description||'')}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta name="twitter:card" content="summary"><meta name="twitter:site" content="@harf_way"><meta name="twitter:title" content="${escapeHtml(title||'HARF-WAY')}"><meta name="twitter:description" content="${escapeHtml(description||'')}">${schema?`<script type="application/ld+json">${jsonLd(schema)}</script>`:''}`;
}

export const PUBLIC_READER_CSS=`
:root{--bg:#171815;--paper:#f3efe4;--ink:#252720;--muted:#74776e;--line:#cbc5b7;--accent:#dff238}*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:#f4f1e8;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif}a{color:inherit}.shell{width:min(860px,calc(100% - 22px));margin:auto;padding:24px 0 64px}.back{display:inline-block;margin:0 0 12px;text-decoration:none;color:#b8beb3;font-size:12px;font-weight:800}.paper{background:var(--paper);color:var(--ink);border:1px solid #d7d1c3;box-shadow:0 22px 70px #0006}.head{padding:28px 30px 24px;border-bottom:1px solid var(--ink)}.head-top{display:flex;justify-content:space-between;gap:20px;align-items:baseline;margin-bottom:9px;color:#6b6f67;font-size:10px;font-weight:800}.head h1{margin:0;font-family:"Hiragino Mincho ProN","Yu Mincho",YuMincho,serif;font-size:clamp(40px,7vw,68px);line-height:1;letter-spacing:-.06em}.head p{margin:14px 0 0;max-width:560px;color:#6d7169;font-size:12px;line-height:1.8}.navline{display:flex;gap:16px;flex-wrap:wrap;margin-top:15px;font-size:10px;font-weight:850}.navline a{text-decoration:none;border-bottom:1px solid #767a70;padding-bottom:2px}.feed{padding:0 30px}.item{display:block;padding:24px 0 26px;border-bottom:1px solid var(--line);text-decoration:none}.item:last-child{border-bottom:0}.item-meta{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:10px;color:#6f736b;font-size:10px;font-weight:800}.item-game{color:var(--ink);font-size:12px}.item-state{margin-left:auto;background:var(--accent);color:#303620;padding:4px 7px;font-size:9px;font-weight:900}.item h2{margin:0 0 8px;font-size:14px;color:#62665e;font-weight:900}.item.word h2{font-family:"Hiragino Mincho ProN","Yu Mincho",YuMincho,serif;font-size:25px;line-height:1.35;color:var(--ink)}.item p{margin:0;font-family:"Hiragino Mincho ProN","Yu Mincho",YuMincho,serif;font-size:18px;line-height:1.9}.item-foot{display:flex;gap:12px;flex-wrap:wrap;margin-top:13px;color:#7b7e76;font-size:9px;font-weight:800}.item:hover h2{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}.single{padding:0 30px 34px}.single-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:18px 0;border-bottom:1px solid var(--line);color:#6e726a;font-size:10px;font-weight:800}.single-meta strong{color:var(--ink);font-size:12px}.single-meta .state{margin-left:auto;background:var(--accent);color:#303620;padding:5px 8px}.single-body{padding:34px 0 38px;border-bottom:1px solid var(--line)}.single-body h2{margin:0 0 18px;font-size:14px;color:#696d65}.single-copy{margin:0;font-family:"Hiragino Mincho ProN","Yu Mincho",YuMincho,serif;font-size:clamp(18px,2.2vw,21px);line-height:1.9;white-space:pre-wrap;max-width:34em}.term-tags{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:12px 0 0}.term-tags-label{color:#777b73;font-size:9px;font-weight:900}.term-tag{display:inline-flex;align-items:center;padding:5px 8px;border:1px solid #bbb5a7;border-radius:999px;background:#ebe5d8;color:#3f433b;font-size:10px;font-weight:850;line-height:1;text-decoration:none}.term-tag:hover{border-color:#4b5046;background:#e3ddcf}.section{padding:28px 0 0}.section h3{margin:0 0 6px;font-size:14px}.section>p{margin:0 0 15px;color:#74786f;font-size:10px}.related-list{display:grid;border-top:1px solid var(--line)}.related-link{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line);text-decoration:none}.related-link small{color:#797d74;font-size:9px}.related-link strong{font-size:13px;line-height:1.5}.related-link span{font-size:12px}.media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.media{border:1px solid var(--line);background:#ebe5d8}.media video{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#050505}.caption{padding:10px 11px 12px}.caption strong{display:block;font-size:12px;margin-bottom:7px}.caption a{font-size:10px;font-weight:900;text-decoration:none;border-bottom:1px solid #44483f}.foot{margin-top:16px;text-align:center;color:#777d73;font-size:9px}.empty{padding:44px 20px;text-align:center;color:#7f847a}@media(max-width:700px){.shell{width:min(100% - 12px,860px);padding-top:10px}.head,.feed,.single{padding-left:17px;padding-right:17px}.head{padding-top:22px;padding-bottom:18px}.item{padding:21px 0}.item-state{margin-left:0}.item p{font-size:17px}.item.word h2{font-size:22px}.single-copy{font-size:18px;line-height:1.85}.single-meta .state{margin-left:0}.media-grid{grid-template-columns:1fr}.related-link{grid-template-columns:1fr auto}.related-link small{grid-column:1/-1}}
`;
