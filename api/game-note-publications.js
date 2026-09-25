import { neon } from '@neondatabase/serverless';
import { archiveCors, archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';
import { notePublicPath, notePublicSlug, slugifyPublic } from '../lib/game-public-seo.js';

const PROJECT_ID='wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID='br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID='br-bold-butterfly-aw2ztgbd';
const PRIVATE_SOURCE='private-game-notes';
const PUBLIC_SOURCE='game-note-publications';
const NOTE_TYPE='private_game_note';
const GAME_TYPE='private_game_note_game';
const TYPE_TYPE='private_game_note_type';
const GLOSSARY_TYPE='private_game_note_glossary';
const PUBLIC_TYPE='game_note_public_snapshot';

const clean=(v,max=280)=>String(v??'').trim().slice(0,max);
const list=(v,max=60,len=220)=>{if(!Array.isArray(v))return[];const out=[],seen=new Set();for(const x of v){const s=clean(x,len);if(!s||seen.has(s))continue;seen.add(s);out.push(s);if(out.length>=max)break}return out};
const parseBody=req=>{if(!req.body)return{};if(typeof req.body==='object')return req.body;try{return JSON.parse(req.body)}catch{return{}}};
const publicNoteId=id=>clean(id,180).replace(/^game-notes:note:/,'').replace(/^game-notes:public-note:/,'');
const sourceDbId=id=>`game-notes:note:${publicNoteId(id)}`;
const snapshotDbId=id=>`game-notes:public-note:${publicNoteId(id)}`;
const glossaryPublicId=id=>clean(id,180).replace(/^game-notes:glossary:/,'');

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
  const item={
    id:publicNoteId(row.id),title:row.title||'',body:row.body_text||'',excerpt:row.excerpt||'',
    gameName:clean(m.gameName,220),typeName:clean(m.typeName,160),sourceNoteId:clean(m.sourceNoteId,180),
    relatedWaysIds:list(m.relatedWaysIds),sourceCreatedAt:m.sourceCreatedAt||null,publishedAt:m.publishedAt||row.created_at||null,
    snapshotUpdatedAt:m.snapshotUpdatedAt||row.updated_at||null,publicSlug:clean(m.publicSlug,150),slugHistory:list(m.slugHistory,40,150),seoTitle:clean(m.seoTitle,90)
  };
  item.publicSlug=notePublicSlug(item);item.url=notePublicPath(item);return item;
}
async function listSnapshots(sql){
  const rows=await sql`SELECT id,title,url,excerpt,body_text,metadata,created_at,updated_at FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' ORDER BY COALESCE((metadata->>'publishedAt')::timestamptz,created_at) DESC`;
  return rows.map(toSnapshot);
}
async function sourceNote(sql,noteId){
  const rows=await sql`SELECT id,title,body_text,metadata,created_at,updated_at FROM core.contents WHERE id=${sourceDbId(noteId)} AND source=${PRIVATE_SOURCE} AND content_type=${NOTE_TYPE} AND status<>'archived' LIMIT 1`;
  if(!rows[0]){const e=new Error('source_note_not_found');e.status=404;throw e}return rows[0];
}
async function dictionaryName(sql,contentType,id,entity){
  const raw=clean(id,180);if(!raw)return'';const dbid=`game-notes:${entity}:${raw}`;
  const rows=await sql`SELECT title FROM core.contents WHERE id=${dbid} AND source=${PRIVATE_SOURCE} AND content_type=${contentType} AND status<>'archived' LIMIT 1`;
  return rows[0]?.title||'';
}
async function relatedWaysForNote(sql,meta){
  const wanted=new Set(list(meta?.glossaryEntryIds,80,180).map(glossaryPublicId));if(!wanted.size)return[];
  const rows=await sql`SELECT id,metadata FROM core.contents WHERE source=${PRIVATE_SOURCE} AND content_type=${GLOSSARY_TYPE} AND status<>'archived'`;
  const out=[];for(const row of rows){if(!wanted.has(glossaryPublicId(row.id)))continue;const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};out.push(...list(m.relatedWaysIds))}return list(out);
}

function requestedSlug(value){
  const raw=clean(value,180);
  if(!raw)return '';
  if(!/[\p{L}\p{N}]/u.test(raw)){const e=new Error('invalid_public_slug');e.status=400;throw e}
  return slugifyPublic(raw,'play-note').slice(0,150);
}
function requestedSeoTitle(value){
  const raw=String(value??'').trim();
  if(raw.length>90){const e=new Error('seo_title_too_long');e.status=400;throw e}
  return raw;
}
function frozenSlug(existing,metadata,newTitle,newGame){
  const fixed=clean(metadata.publicSlug,150);
  if(fixed)return fixed;
  if(existing)return notePublicSlug({gameName:metadata.gameName||newGame,title:existing.title||newTitle});
  return notePublicSlug({gameName:newGame,title:newTitle});
}
async function assertUniqueSlug(sql,noteId,slug,history=[]){
  const rows=await sql`SELECT id,metadata FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' AND id<>${snapshotDbId(noteId)}`;
  if(rows.some(row=>{const m=row.metadata||{};const other=notePublicSlug({publicSlug:m.publicSlug,gameName:m.gameName,title:row.title});return other===slug||history.includes(other)||(Array.isArray(m.slugHistory)&&m.slugHistory.includes(slug))})){
    const e=new Error('public_slug_conflict');e.status=409;throw e;
  }
}
function nextSlugHistory(old,slug,existing){
  const previous=existing?notePublicSlug({publicSlug:old.publicSlug,gameName:old.gameName,title:existing.title}):'';
  return list([...(Array.isArray(old.slugHistory)?old.slugHistory:[]),...(previous&&previous!==slug?[previous]:[])].filter(x=>x!==slug),40,150);
}
async function publishSnapshot(sql,noteId,settings={}){
  const note=await sourceNote(sql,noteId),m=note.metadata&&typeof note.metadata==='object'?note.metadata:{};
  const gameName=await dictionaryName(sql,GAME_TYPE,m.gameId,'game');
  const typeName=await dictionaryName(sql,TYPE_TYPE,m.typeId,'type');
  const relatedWaysIds=await relatedWaysForNote(sql,m);
  const current=await sql`SELECT title,metadata FROM core.contents WHERE id=${snapshotDbId(noteId)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} LIMIT 1`;
  const existing=current[0]||null,old=existing?.metadata&&typeof existing.metadata==='object'?existing.metadata:{};
  const title=clean(note.title,280)||'PLAY NOTE',body=clean(note.body_text,30000);
  const publicSlug=requestedSlug(settings.publicSlug)||frozenSlug(existing,old,title,gameName);
  const slugHistory=nextSlugHistory(old,publicSlug,existing);await assertUniqueSlug(sql,noteId,publicSlug,slugHistory);
  const seoTitle=Object.hasOwn(settings,'seoTitle')?requestedSeoTitle(settings.seoTitle):clean(old.seoTitle,90);
  const now=new Date().toISOString(),publishedAt=old.publishedAt||now;
  const metadata=JSON.stringify({sourceNoteId:publicNoteId(note.id),gameName,typeName,relatedWaysIds,sourceCreatedAt:m.createdAt||note.created_at||null,publishedAt,snapshotUpdatedAt:now,publicSlug,slugHistory,seoTitle});
  const url=notePublicPath({id:publicNoteId(note.id),publicSlug});
  const rows=await sql`
    INSERT INTO core.contents(id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
    VALUES(${snapshotDbId(noteId)},${PUBLIC_TYPE},${title},${url},${body.slice(0,280)},${body},'active',${PUBLIC_SOURCE},CAST(${metadata} AS jsonb),now(),now())
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,excerpt=EXCLUDED.excerpt,body_text=EXCLUDED.body_text,status='active',source=EXCLUDED.source,metadata=EXCLUDED.metadata,updated_at=now()
    RETURNING id,title,url,excerpt,body_text,metadata,created_at,updated_at`;
  return toSnapshot(rows[0]);
}
// Metadata-only edits do not silently republish the newer private source body.
async function saveSeoSettings(sql,noteId,settings={}){
  const rows=await sql`SELECT id,title,url,excerpt,body_text,metadata,created_at,updated_at FROM core.contents WHERE id=${snapshotDbId(noteId)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' LIMIT 1`;
  if(!rows[0]){const e=new Error('public_note_not_found');e.status=404;throw e}
  const existing=rows[0],old=existing.metadata&&typeof existing.metadata==='object'?existing.metadata:{};
  const publicSlug=requestedSlug(settings.publicSlug)||frozenSlug(existing,old,existing.title,old.gameName);
  const seoTitle=Object.hasOwn(settings,'seoTitle')?requestedSeoTitle(settings.seoTitle):clean(old.seoTitle,90);
  const url=notePublicPath({id:publicNoteId(noteId),publicSlug});
  const metadata=JSON.stringify({...old,publicSlug,slugHistory,seoTitle,snapshotUpdatedAt:new Date().toISOString()});
  const updated=await sql`UPDATE core.contents SET url=${url},metadata=CAST(${metadata} AS jsonb),updated_at=now() WHERE id=${snapshotDbId(noteId)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' RETURNING id,title,url,excerpt,body_text,metadata,created_at,updated_at`;
  return toSnapshot(updated[0]);
}
async function unpublish(sql,noteId){const rows=await sql`UPDATE core.contents SET status='archived',updated_at=now() WHERE id=${snapshotDbId(noteId)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active' RETURNING id`;return Boolean(rows[0])}

export default async function handler(req,res){
  archiveCors(res);res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const ctx=await databaseContext();
    if(req.method==='GET'){
      const entries=await listSnapshots(ctx.sql),id=publicNoteId(req.query?.note||'');
      if(id){const item=entries.find(x=>x.id===id)||null;return res.status(item?200:404).json(item?{ok:true,item}:{ok:false,error:'public_note_not_found'})}
      return res.status(200).json({ok:true,entries,count:entries.length});
    }
    await authorizeWrite(req,ctx.production);
    const body=parseBody(req),noteId=publicNoteId(body.noteId||body.id||'');if(!noteId)return res.status(400).json({ok:false,error:'note_id_required'});
    if(req.method==='POST'||req.method==='PATCH'){const item=await publishSnapshot(ctx.sql,noteId,body);return res.status(200).json({ok:true,item})}
    if(req.method==='PUT'){const item=await saveSeoSettings(ctx.sql,noteId,body);return res.status(200).json({ok:true,item})}
    if(req.method==='DELETE'){const removed=await unpublish(ctx.sql,noteId);return res.status(removed?200:404).json({ok:removed,removed})}
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }catch(error){console.error('[game-note-publications]',error?.message||error);return res.status(error?.status||500).json({ok:false,error:error?.message||'game_note_publication_failed',...(error?.details||{})})}
}
