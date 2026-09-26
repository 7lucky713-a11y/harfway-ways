import { archiveCors, authorizeArchiveRequest } from './archive-core.js';
import { notePublicPath, notePublicSlug, publicDatabaseContext, slugifyPublic } from '../lib/game-public-seo.js';

const PRIVATE_SOURCE='private-learning-clips';
const PUBLIC_SOURCE='game-note-publications';
const PUBLIC_TYPE='game_note_public_snapshot';
const CLIP_TYPE='private_learning_clip';
const TYPES=new Set(['短文','日記','エッセイ','ゲームの感想','その他']);
const clean=(v,max=280)=>String(v??'').trim().slice(0,max);
const parseBody=req=>{if(!req.body)return{};if(typeof req.body==='object')return req.body;try{return JSON.parse(req.body)}catch{return{}}};
const list=(v,max=24,len=80)=>Array.isArray(v)?[...new Set(v.map(x=>clean(x,len)).filter(Boolean))].slice(0,max):[];
function clipId(value){
  const id=clean(value,180).replace(/^clip-/,'').replace(/^private-clips:clip:/,'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){const e=new Error('valid_clip_id_required');e.status=400;throw e}
  return id;
}
const snapshotId=id=>`game-notes:public-note:clip-${id}`;
const sourceId=id=>`private-clips:clip:${id}`;
function toEntry(row){
  const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  const id=clean(m.sourceClipId,80)||clipId(row.id.replace(/^game-notes:public-note:/,''));
  const item={
    clipId:id,id:`clip-${id}`,title:row.title||'',body:row.body_text||'',
    typeName:clean(m.typeName,80)||'短文',tags:list(m.tags),publicSlug:clean(m.publicSlug,150),slugHistory:list(m.slugHistory,40,150),
    publishedAt:m.publishedAt||row.created_at||null,updatedAt:m.snapshotUpdatedAt||row.updated_at||null
  };
  item.url=notePublicPath({publicSlug:item.publicSlug,title:item.title});
  return item;
}
async function listEntries(sql){
  const rows=await sql`SELECT id,title,body_text,metadata,created_at,updated_at
    FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active'
      AND metadata->>'sourceKind'='clip'
    ORDER BY COALESCE((metadata->>'publishedAt')::timestamptz,created_at) DESC`;
  return rows.map(toEntry);
}
async function sourceClip(sql,id){
  const rows=await sql`SELECT title,body_text,metadata,created_at FROM core.contents
    WHERE id=${sourceId(id)} AND source=${PRIVATE_SOURCE}
      AND content_type=${CLIP_TYPE} AND status='active' LIMIT 1`;
  if(!rows[0]){const e=new Error('source_clip_not_found');e.status=404;throw e}
  return rows[0];
}
async function publishedSnapshot(sql,id){
  const rows=await sql`SELECT id,title,body_text,metadata,created_at,updated_at,status
    FROM core.contents WHERE id=${snapshotId(id)} AND source=${PUBLIC_SOURCE}
      AND content_type=${PUBLIC_TYPE} LIMIT 1`;
  if(rows[0]&&rows[0].metadata?.sourceKind!=='clip'){
    const e=new Error('snapshot_identity_conflict');e.status=409;throw e;
  }
  return rows[0]||null;
}

function requestedSlug(value){
  const raw=clean(value,180);
  if(!raw)return'';
  if(!/[\p{L}\p{N}]/u.test(raw)){const e=new Error('invalid_public_slug');e.status=400;throw e}
  return slugifyPublic(raw,'clip').slice(0,110);
}
function currentSlug(row){
  if(!row)return'';
  const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  return notePublicSlug({publicSlug:m.publicSlug,gameName:m.gameName,title:row.title});
}
function changedSlugHistory(old,previous,slug){
  const original=currentSlug(old),existing=list(previous.slugHistory,40,150);
  if(original&&original!==slug&&existing.includes(slug)){
    const e=new Error('historic_slug_reuse_forbidden');e.status=409;throw e;
  }
  return list([...existing,...(original&&original!==slug?[original]:[])].filter(x=>x!==slug),40,150);
}
async function assertSlugAvailable(sql,id,slug,history=[]){
  const rows=await sql`SELECT id,title,metadata FROM core.contents WHERE source=${PUBLIC_SOURCE}
    AND content_type=${PUBLIC_TYPE} AND status='active' AND id<>${snapshotId(id)}`;
  if(rows.some(row=>{
    const m=row.metadata||{};
    const current=notePublicSlug({publicSlug:m.publicSlug,title:row.title,gameName:m.gameName});
    const old=list(m.slugHistory,40,150);
    return current===slug||old.includes(slug)||history.includes(current)||history.some(alias=>old.includes(alias));
  })){
    const e=new Error('public_slug_conflict');e.status=409;throw e;
  }
}
async function publish(sql,id,body){
  const clip=await sourceClip(sql,id);
  const old=await publishedSnapshot(sql,id);
  const previous=old?.metadata&&typeof old.metadata==='object'?old.metadata:{};
  const typeName=TYPES.has(body.typeName)?body.typeName:(TYPES.has(previous.typeName)?previous.typeName:'短文');
  const tags=body.includeTags===true?list(clip.metadata?.tags):[];
  const title=clean(clip.title,280),text=clean(clip.body_text,30000);
  if(!title){const e=new Error('clip_title_required');e.status=400;throw e}
  const publicSlug=requestedSlug(body.publicSlug)||currentSlug(old)||`clip-${slugifyPublic(title,'clip').slice(0,62)}-${id.slice(0,8)}`;
  const slugHistory=changedSlugHistory(old,previous,publicSlug);
  await assertSlugAvailable(sql,id,publicSlug,slugHistory);
  const now=new Date().toISOString();
  const metadata=JSON.stringify({
    ...previous,sourceKind:'clip',sourceClipId:id,typeName,tags,gameName:'',
    relatedWaysIds:[],sourceCreatedAt:clip.metadata?.createdAt||clip.created_at||null,
    publicSlug,slugHistory,seoTitle:previous.seoTitle||'',publishedAt:previous.publishedAt||now,snapshotUpdatedAt:now
  });
  const url=notePublicPath({publicSlug});
  const rows=await sql`INSERT INTO core.contents
    (id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
    VALUES (${snapshotId(id)},${PUBLIC_TYPE},${title},${url},${text.replace(/\s+/g,' ').slice(0,280)},${text},'active',${PUBLIC_SOURCE},CAST(${metadata} AS jsonb),now(),now())
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,
      excerpt=EXCLUDED.excerpt,body_text=EXCLUDED.body_text,status='active',
      metadata=EXCLUDED.metadata,updated_at=now()
    WHERE core.contents.source=${PUBLIC_SOURCE} AND core.contents.content_type=${PUBLIC_TYPE}
    RETURNING id,title,body_text,metadata,created_at,updated_at`;
  if(!rows[0]){const e=new Error('public_clip_conflict');e.status=409;throw e}
  return toEntry(rows[0]);
}
// A URL-only edit must never publish newer changes from the private source.
async function saveUrlSettings(sql,id,body){
  const old=await publishedSnapshot(sql,id);
  if(!old||old.status!=='active'){const e=new Error('published_clip_not_found');e.status=404;throw e}
  const previous=old.metadata&&typeof old.metadata==='object'?old.metadata:{};
  const publicSlug=requestedSlug(body.publicSlug)||currentSlug(old);
  const slugHistory=changedSlugHistory(old,previous,publicSlug);
  await assertSlugAvailable(sql,id,publicSlug,slugHistory);
  const now=new Date().toISOString(),url=notePublicPath({publicSlug});
  const metadata=JSON.stringify({...previous,publicSlug,slugHistory,snapshotUpdatedAt:now});
  const rows=await sql`UPDATE core.contents SET url=${url},metadata=CAST(${metadata} AS jsonb),updated_at=now()
    WHERE id=${snapshotId(id)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE}
      AND status='active' AND metadata->>'sourceKind'='clip'
    RETURNING id,title,body_text,metadata,created_at,updated_at`;
  if(!rows[0]){const e=new Error('published_clip_not_found');e.status=404;throw e}
  return toEntry(rows[0]);
}
async function unpublish(sql,id){
  const rows=await sql`UPDATE core.contents SET status='archived',updated_at=now()
    WHERE id=${snapshotId(id)} AND source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE}
      AND metadata->>'sourceKind'='clip' AND status='active' RETURNING id`;
  return Boolean(rows[0]);
}
export default async function handler(req,res){
  archiveCors(res);res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow,noarchive');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  try{
    const ctx=await publicDatabaseContext();
    if(req.method==='GET'){
      const entries=await listEntries(ctx.sql);
      return res.status(200).json({ok:true,entries,count:entries.length});
    }
    if(!['POST','PATCH','PUT','DELETE'].includes(req.method))return res.status(405).json({ok:false,error:'method_not_allowed'});
    if(ctx.production){
      const auth=await authorizeArchiveRequest(req);
      if(!auth.ok)return res.status(auth.status||401).json({ok:false,error:auth.error||'unauthorized'});
    }
    const body=parseBody(req),id=clipId(body.clipId||body.id);
    if(req.method==='DELETE'){
      const removed=await unpublish(ctx.sql,id);
      return res.status(removed?200:404).json({ok:removed,removed});
    }
    const entry=req.method==='PUT'?await saveUrlSettings(ctx.sql,id,body):await publish(ctx.sql,id,body);
    return res.status(200).json({ok:true,entry});
  }catch(error){
    console.error('[clip-publications]',error?.message||error);
    return res.status(error?.status||500).json({ok:false,error:error?.message||'clip_publication_failed'});
  }
}
