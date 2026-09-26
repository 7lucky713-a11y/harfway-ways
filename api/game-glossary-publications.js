import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';
import { wordPublicPath, wordPublicSlug, slugifyPublic } from '../lib/game-public-seo.js';

const PROJECT_ID='wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID='br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID='br-bold-butterfly-aw2ztgbd';
const PRIVATE_SOURCE='private-game-notes';
const PUBLIC_SOURCE='glossary-publications';
const GLOSSARY_TYPE='private_game_note_glossary';
const GAME_TYPE='private_game_note_game';
const NOTE_TYPE='private_game_note';
const NOTE_PUBLIC_SOURCE='game-note-publications';
const NOTE_PUBLIC_TYPE='game_note_public_snapshot';
const PUBLIC_TYPE='glossary_public_snapshot';

const clean=(v,max=280)=>String(v??'').trim().slice(0,max);
const list=(v,max=60,len=220)=>{if(!Array.isArray(v))return[];const out=[],seen=new Set();for(const x of v){const s=clean(x,len);if(!s||seen.has(s))continue;seen.add(s);out.push(s);if(out.length>=max)break}return out};
const parseBody=req=>{if(!req.body)return{};if(typeof req.body==='object')return req.body;try{return JSON.parse(req.body)}catch{return{}}};
const wordId=id=>clean(id,180).replace(/^game-notes:glossary:/,'').replace(/^game-notes:public-glossary:/,'');
const noteId=id=>clean(id,180).replace(/^game-notes:note:/,'').replace(/^game-notes:public-note:/,'');
const sourceDbId=id=>`game-notes:glossary:${wordId(id)}`;
const snapshotDbId=id=>`game-notes:public-glossary:${wordId(id)}`;

function databaseConfig(){
  const production=process.env.VERCEL_ENV==='production';
  return production
    ? {production,expectedBranchId:PRODUCTION_BRANCH_ID,url:archiveDatabaseConfig().url||''}
    : {production,expectedBranchId:PREVIEW_BRANCH_ID,url:process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL||''};
}
async function databaseContext(){
  const config=databaseConfig();
  if(!config.url){const e=new Error(config.production?'production_database_not_configured':'preview_database_not_configured');e.status=503;throw e}
  const sql=neon(config.url);
  const rows=await sql`SELECT current_setting('neon.project_id',true)::text AS project_id,current_setting('neon.branch_id',true)::text AS branch_id,to_regclass('core.contents')::text AS contents_table`;
  const info=rows[0]||{},projectId=clean(info.project_id,80),branchId=clean(info.branch_id,80),tableReady=clean(info.contents_table,120)==='core.contents';
  if(projectId!==PROJECT_ID||branchId!==config.expectedBranchId||!tableReady){const e=new Error('database_identity_mismatch');e.status=409;e.details={projectId:projectId||null,branchId:branchId||null,expectedBranchId:config.expectedBranchId,tableReady};throw e}
  return{sql,production:config.production,branchId};
}
async function authorizeWrite(req,production){if(!production)return;const auth=await authorizeArchiveRequest(req);if(auth.ok)return;const e=new Error(auth.error||'unauthorized');e.status=auth.status||401;throw e}

function toSnapshot(row){
  const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  return{
    id:wordId(row.id),term:row.title||'',description:row.body_text||'',excerpt:row.excerpt||'',
    gameName:clean(m.gameName,220),sourceGlossaryId:clean(m.sourceGlossaryId,180),
    relatedWaysIds:list(m.relatedWaysIds),relatedPublicNoteIds:list(m.relatedPublicNoteIds,40,180),
    relatedPublicGlossaryIds:list(m.relatedPublicGlossaryIds,40,180),sourceCreatedAt:m.sourceCreatedAt||null,
    publishedAt:m.publishedAt||row.created_at||null,snapshotUpdatedAt:m.snapshotUpdatedAt||row.updated_at||null,
    publicSlug:wordPublicSlug({publicSlug:m.publicSlug,gameName:m.gameName,term:row.title}),slugHistory:list(m.slugHistory,40,150),
    url:wordPublicPath({id:wordId(row.id),publicSlug:m.publicSlug,gameName:m.gameName,term:row.title})
  };
}
async function listSnapshots(sql){
  const rows=await sql`SELECT id,title,url,excerpt,body_text,metadata,created_at,updated_at FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' ORDER BY COALESCE((metadata->>'publishedAt')::timestamptz,created_at) DESC`;
  return rows.map(toSnapshot);
}
async function sourceGlossary(sql,id){
  const rows=await sql`SELECT id,title,body_text,metadata,created_at,updated_at FROM core.contents WHERE id=${sourceDbId(id)} AND source=${PRIVATE_SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived' LIMIT 1`;
  if(!rows[0]){const e=new Error('source_glossary_not_found');e.status=404;throw e}return rows[0];
}
async function gameName(sql,id){
  const raw=clean(id,180);if(!raw)return'共通 / ゲーム横断';
  const rows=await sql`SELECT title FROM core.contents WHERE id=${`game-notes:game:${raw}`} AND source=${PRIVATE_SOURCE} AND content_type=${GAME_TYPE} AND status<>'archived' LIMIT 1`;
  return rows[0]?.title||'未登録ゲーム';
}
async function relatedPublicNotes(sql,glossaryId){
  const rows=await sql`SELECT id,metadata FROM core.contents WHERE source=${PRIVATE_SOURCE} AND content_type=${NOTE_TYPE} AND status<>'archived'`;
  const sourceIds=[];
  for(const row of rows){const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};const ids=list(m.glossaryEntryIds,80,180).map(wordId);if(ids.includes(glossaryId))sourceIds.push(noteId(row.id))}
  if(!sourceIds.length)return[];
  const publicRows=await sql`SELECT metadata FROM core.contents WHERE source=${NOTE_PUBLIC_SOURCE} AND content_type=${NOTE_PUBLIC_TYPE} AND status='active'`;
  const active=new Set(publicRows.map(row=>noteId(row.metadata?.sourceNoteId||'')).filter(Boolean));
  return list(sourceIds.filter(id=>active.has(id)),40,180);
}
async function relatedPublicGlossaries(sql,sourceMeta){
  const wanted=list(sourceMeta?.relatedEntryIds,40,180).map(wordId);if(!wanted.length)return[];
  const rows=await sql`SELECT metadata FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active'`;
  const active=new Set(rows.map(row=>wordId(row.metadata?.sourceGlossaryId||'')).filter(Boolean));
  return wanted.filter(id=>active.has(id));
}
function requestedSlug(value){
  const raw=clean(value,180);
  if(!raw)return '';
  if(!/[\p{L}\p{N}]/u.test(raw)){const e=new Error('invalid_public_slug');e.status=400;throw e}
  const slug=slugifyPublic(raw,'word').slice(0,110);
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)){const e=new Error('reserved_public_slug');e.status=400;throw e}
  return slug;
}
function frozenSlug(row,fallback={}){
  const m=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
  return wordPublicSlug({publicSlug:m.publicSlug,gameName:m.gameName||fallback.gameName,term:row?.title||fallback.term});
}
function nextSlugHistory(row,newSlug){
  const m=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
  const history=list(m.slugHistory,40,150),oldSlug=row?frozenSlug(row):'';
  if(oldSlug&&oldSlug!==newSlug&&history.includes(newSlug)){
    const e=new Error('historic_slug_reuse_forbidden');e.status=409;throw e
  }
  const aliases=oldSlug&&oldSlug!==newSlug?[oldSlug]:[];
  return list([...history,...aliases].filter(x=>x!==newSlug),40,150);
}
// Slug-only /words/:slug/ URLs need namespace-wide uniqueness, including historical aliases.
async function assertUniqueSlug(sql,id,slug,history=[]){
  const rows=await sql`SELECT id,title,metadata FROM core.contents
    WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND id<>${snapshotDbId(id)}`;
  const requested=[slug,...history].map(value=>slugifyPublic(value,'word',150));
  if(rows.some(row=>{
    const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
    const aliases=[wordPublicSlug({publicSlug:m.publicSlug,gameName:m.gameName,term:row.title}),...list(m.slugHistory,40,150)]
      .map(value=>slugifyPublic(value,'word',150));
    return aliases.some(value=>requested.includes(value));
  })){const e=new Error('public_slug_conflict');e.status=409;throw e}
}
async function publishSnapshot(sql,id,settings={}){
  const source=await sourceGlossary(sql,id),m=source.metadata&&typeof source.metadata==='object'?source.metadata:{};
  const publicId=wordId(source.id),game=await gameName(sql,m.gameId);
  const relatedWaysIds=list(m.relatedWaysIds),relatedPublicNoteIds=await relatedPublicNotes(sql,publicId),relatedPublicGlossaryIds=await relatedPublicGlossaries(sql,m);
  const current=await sql`SELECT id,title,metadata FROM core.contents WHERE id=${snapshotDbId(publicId)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} LIMIT 1`;
  const existing=current[0]||null,old=existing?.metadata&&typeof existing.metadata==='object'?existing.metadata:{};
  const term=clean(source.title,280)||'無題のことば',description=clean(source.body_text,30000);
  const publicSlug=requestedSlug(settings.publicSlug)||frozenSlug(existing,{term,gameName:game});
  const slugHistory=nextSlugHistory(existing,publicSlug);
  await assertUniqueSlug(sql,publicId,publicSlug,slugHistory);
  const now=new Date().toISOString(),publishedAt=old.publishedAt||now;
  const metadata=JSON.stringify({...old,sourceGlossaryId:publicId,gameName:game,relatedWaysIds,relatedPublicNoteIds,relatedPublicGlossaryIds,sourceCreatedAt:m.createdAt||source.created_at||null,publishedAt,snapshotUpdatedAt:now,publicSlug,slugHistory});
  const url=wordPublicPath({id:publicId,publicSlug});
  const rows=await sql`
    INSERT INTO core.contents(id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
    VALUES(${snapshotDbId(publicId)},${PUBLIC_TYPE},${term},${url},${description.slice(0,280)},${description},'active',${PUBLIC_SOURCE},CAST(${metadata} AS jsonb),now(),now())
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,excerpt=EXCLUDED.excerpt,body_text=EXCLUDED.body_text,status='active',source=EXCLUDED.source,metadata=EXCLUDED.metadata,updated_at=now()
    RETURNING id,title,url,excerpt,body_text,metadata,created_at,updated_at`;
  return toSnapshot(rows[0]);
}
// URL-only edits never republish unapproved text from the private glossary.
async function saveUrlSettings(sql,id,settings={}){
  const rows=await sql`SELECT id,title,url,excerpt,body_text,metadata,created_at,updated_at FROM core.contents
    WHERE id=${snapshotDbId(id)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' LIMIT 1`;
  if(!rows[0]){const e=new Error('public_glossary_not_found');e.status=404;throw e}
  const existing=rows[0],old=existing.metadata&&typeof existing.metadata==='object'?existing.metadata:{};
  const publicSlug=requestedSlug(settings.publicSlug)||frozenSlug(existing);
  const slugHistory=nextSlugHistory(existing,publicSlug);
  await assertUniqueSlug(sql,id,publicSlug,slugHistory);
  const now=new Date().toISOString();
  const url=wordPublicPath({id:wordId(id),publicSlug});
  const metadata=JSON.stringify({...old,publicSlug,slugHistory,snapshotUpdatedAt:now});
  const updated=await sql`UPDATE core.contents SET url=${url},metadata=CAST(${metadata} AS jsonb),updated_at=now()
    WHERE id=${snapshotDbId(id)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active'
    RETURNING id,title,url,excerpt,body_text,metadata,created_at,updated_at`;
  if(!updated[0]){const e=new Error('public_glossary_not_found');e.status=404;throw e}
  return toSnapshot(updated[0]);
}
async function unpublish(sql,id){
  const rows=await sql`UPDATE core.contents SET status='archived',updated_at=now() WHERE id=${snapshotDbId(id)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' RETURNING id`;
  return Boolean(rows[0]);
}

export default async function handler(req,res){
  archiveCors(res);res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const ctx=await databaseContext();
    if(req.method==='GET'){
      const entries=await listSnapshots(ctx.sql),id=wordId(req.query?.word||'');
      if(id){const item=entries.find(x=>x.id===id)||null;return res.status(item?200:404).json(item?{ok:true,item}:{ok:false,error:'public_glossary_not_found'})}
      return res.status(200).json({ok:true,entries,count:entries.length});
    }
    await authorizeWrite(req,ctx.production);
    const body=parseBody(req),id=wordId(body.glossaryId||body.id||'');if(!id)return res.status(400).json({ok:false,error:'glossary_id_required'});
    if(req.method==='POST'||req.method==='PATCH'){const item=await publishSnapshot(ctx.sql,id,body);return res.status(200).json({ok:true,item})}
    if(req.method==='PUT'){const item=await saveUrlSettings(ctx.sql,id,body);return res.status(200).json({ok:true,item})}
    if(req.method==='DELETE'){const removed=await unpublish(ctx.sql,id);return res.status(removed?200:404).json({ok:removed,removed})}
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }catch(error){console.error('[game-glossary-publications]',error?.message||error);return res.status(error?.status||500).json({ok:false,error:error?.message||'game_glossary_publication_failed',...(error?.details||{})})}
}
