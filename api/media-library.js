import { neon } from '@neondatabase/serverless';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { archiveDatabaseConfig, authorizeArchiveRequest } from './archive-core.js';

const PROJECT_ID = 'wispy-recipe-34518010';
const PRODUCTION_BRANCH_ID = 'br-noisy-boat-awncea92';
const PREVIEW_BRANCH_ID = 'br-bold-butterfly-aw2ztgbd';
const SOURCE = 'harfway-media-library';
const ASSET_TYPE = 'media_asset';
const NOTE_SOURCE = 'private-game-notes';
const NOTE_TYPE = 'private_game_note';
const PUBLIC_SOURCE = 'game-note-publications';
const PUBLIC_TYPE = 'game_note_public_snapshot';
const INVENTORY_LIMIT = 5000;

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const list = (v, max = 40, len = 100) => {
  if (!Array.isArray(v)) return [];
  const out = [], seen = new Set();
  for (const x of v) {
    const s = clean(x, len);
    if (!s) continue;
    const key = s.toLocaleLowerCase('ja');
    if (seen.has(key)) continue;
    seen.add(key); out.push(s);
    if (out.length >= max) break;
  }
  return out;
};
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}
function assetId(value = '') {
  const raw = clean(value, 180);
  if (!raw) return '';
  return raw.startsWith('media-asset:') ? raw : `media-asset:${raw}`;
}
function publicAssetId(value = '') { return clean(value, 180).replace(/^media-asset:/, ''); }
function typeOf(key = '', mime = '') {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(key)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(key)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(key)) return 'audio';
  return 'other';
}
function purposeOf(key = '') {
  const p = String(key).split('/')[0] || 'legacy';
  return ['private-game-notes', 'media-library', 'media-library-preview', 'ways', 'showcase', 'shared'].includes(p) ? p : 'legacy';
}
function fileNameOf(key = '') { try{return decodeURIComponent(String(key).split('/').pop() || 'media')}catch{return String(key).split('/').pop()||'media'} }
function databaseConfig() {
  const production = process.env.VERCEL_ENV === 'production';
  return production
    ? { production, expectedBranchId: PRODUCTION_BRANCH_ID, url: archiveDatabaseConfig().url || '' }
    : { production, expectedBranchId: PREVIEW_BRANCH_ID, url: process.env.SINGLE_GAME_KIT_PREVIEW_DATABASE_URL || '' };
}
async function databaseContext() {
  const config = databaseConfig();
  if (!config.url) { const e = new Error(config.production ? 'production_database_not_configured' : 'preview_database_not_configured'); e.status = 503; throw e; }
  const sql = neon(config.url);
  const rows = await sql`SELECT current_setting('neon.project_id',true)::text AS project_id,current_setting('neon.branch_id',true)::text AS branch_id,to_regclass('core.contents')::text AS contents_table`;
  const info = rows[0] || {};
  const projectId = clean(info.project_id, 80), branchId = clean(info.branch_id, 80), tableReady = clean(info.contents_table, 120) === 'core.contents';
  if (projectId !== PROJECT_ID || branchId !== config.expectedBranchId || !tableReady) {
    const e = new Error('database_identity_mismatch'); e.status = 409; e.details = { projectId: projectId || null, branchId: branchId || null, expectedBranchId: config.expectedBranchId, tableReady }; throw e;
  }
  return { sql, production: config.production, branchId };
}
async function authorize(req, production) {
  if (!production) return;
  const auth = await authorizeArchiveRequest(req);
  if (auth.ok) return;
  const e = new Error(auth.error || 'unauthorized'); e.status = auth.status || 401; throw e;
}
function ensureWriteOrigin(req) {
  const origin = String(req.headers.origin || ''), host = String(req.headers.host || '');
  if (!origin || !host) { const e = new Error('origin_required'); e.status = 403; throw e; }
  let originHost = ''; try { originHost = new URL(origin).host; } catch {}
  if (!originHost || originHost !== host) { const e = new Error('origin_mismatch'); e.status = 403; throw e; }
}
function r2() {
  const accountId = process.env.R2_ACCOUNT_ID, accessKeyId = process.env.R2_ACCESS_KEY_ID, secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('r2_credentials_not_configured');
  return new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
}
function bucket() { const b = clean(process.env.R2_BUCKET, 240); if (!b) throw new Error('r2_bucket_not_configured'); return b; }
function publicBase() { return clean(process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_URL || 'https://pub-2d323c5412584bc480059c19872176e1.r2.dev', 1000).replace(/\/$/, ''); }
function rawUrl(key) { const base = publicBase(); return base ? `${base}/${encodeURI(key).replace(/#/g, '%23')}` : ''; }
function toAsset(row) {
  const m = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {id:row.id||'',publicId:publicAssetId(row.id),registered:true,status:row.status||'active',name:row.title||m.originalName||fileNameOf(m.r2Key),r2Key:clean(m.r2Key,1400),mimeType:clean(m.mimeType,160),kind:clean(m.kind,30)||typeOf(m.r2Key,m.mimeType),size:Math.max(0,Number(m.size||0)||0),etag:clean(m.etag,200),originalName:clean(m.originalName,260),storagePurpose:clean(m.storagePurpose,80)||purposeOf(m.r2Key),gameId:clean(m.gameId,200),gameName:clean(m.gameNameCache,260),alt:clean(m.alt,500),caption:clean(m.caption,1200),tags:list(m.tags,40,100),createdAt:m.createdAt||row.created_at||null,trashedAt:m.trashedAt||null,updatedAt:row.updated_at||null,rawUrl:rawUrl(clean(m.r2Key,1400))};
}
async function registry(sql) { const rows=await sql`SELECT id,title,status,metadata,created_at,updated_at FROM core.contents WHERE source=${SOURCE} AND content_type=${ASSET_TYPE} AND status<>'archived' ORDER BY updated_at DESC`; return rows.map(toAsset); }
async function listInventory() {
  const client=r2(),bkt=bucket(),rows=[];let token,truncated=false;
  do{const out=await client.send(new ListObjectsV2Command({Bucket:bkt,ContinuationToken:token,MaxKeys:1000}));for(const item of out.Contents||[]){if(!item.Key||/\/tmp\//.test(item.Key)||/\/guard\/open\//.test(item.Key))continue;rows.push({r2Key:item.Key,name:fileNameOf(item.Key),size:Number(item.Size)||0,etag:String(item.ETag||'').replaceAll('"',''),lastModified:item.LastModified?new Date(item.LastModified).toISOString():'',kind:typeOf(item.Key),storagePurpose:purposeOf(item.Key),rawUrl:rawUrl(item.Key)});if(rows.length>=INVENTORY_LIMIT){truncated=true;break}}if(rows.length>=INVENTORY_LIMIT)break;token=out.IsTruncated?out.NextContinuationToken:undefined}while(token);
  return{rows,truncated};
}
function addUsage(map,key,usage){if(!key)return;const xs=map.get(key)||[];if(!xs.some(x=>x.surface===usage.surface&&x.contentId===usage.contentId))xs.push(usage);map.set(key,xs)}
async function usageMaps(sql){
 const byId=new Map(),byKey=new Map();
 const notes=await sql`SELECT id,title,metadata FROM core.contents WHERE source=${NOTE_SOURCE} AND content_type=${NOTE_TYPE} AND status<>'archived'`;
 for(const row of notes){const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};const u={surface:'game-notes',contentId:String(row.id||'').replace(/^game-notes:note:/,''),label:'GAME NOTES',title:row.title||'無題',url:'/game-notes/'};for(const id of list(m.mediaAssetIds,30,180))addUsage(byId,assetId(id),u);for(const item of Array.isArray(m.media)?m.media:[]){if(item?.assetId)addUsage(byId,assetId(item.assetId),u);if(item?.key)addUsage(byKey,clean(item.key,1400),u)}}
 const pubs=await sql`SELECT id,title,url,metadata FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active'`;
 for(const row of pubs){const m=row.metadata&&typeof row.metadata==='object'?row.metadata:{};const u={surface:'public-note',contentId:String(row.id||'').replace(/^game-notes:public-note:/,''),label:'PUBLIC PLAY NOTE',title:row.title||'無題',url:row.url||'/notes/'};for(const id of list(m.mediaAssetIds,30,180))addUsage(byId,assetId(id),u)}
 return{byId,byKey};
}
function usagesFor(asset,maps){const out=[...(maps.byId.get(asset.id)||[]),...(maps.byKey.get(asset.r2Key)||[])],seen=new Set();return out.filter(x=>{const k=`${x.surface}:${x.contentId}`;if(seen.has(k))return false;seen.add(k);return true})}
function hardDeleteScope(asset,production){if(!production)return{allowed:false,reason:'preview_hard_delete_disabled'};return /^(private-game-notes|media-library)\//.test(asset.r2Key||'')?{allowed:true,reason:''}:{allowed:false,reason:'legacy_usage_scope_unverified'}}
async function mergedLibrary(sql,production){
 const [assets,inv,maps]=await Promise.all([registry(sql),listInventory(),usageMaps(sql)]),byKey=new Map(assets.filter(a=>a.r2Key).map(a=>[a.r2Key,a])),seen=new Set(),items=[];
 for(const obj of inv.rows){const saved=byKey.get(obj.r2Key);if(saved){seen.add(saved.id);const usages=usagesFor(saved,maps),scope=hardDeleteScope(saved,production);items.push({...saved,...obj,usages,usageCount:usages.length,hardDeleteAllowed:saved.status==='trash'&&usages.length===0&&scope.allowed,hardDeleteReason:scope.reason})}else{const usages=[...(maps.byKey.get(obj.r2Key)||[])];items.push({id:'',publicId:'',registered:false,status:'unregistered',...obj,mimeType:'',gameId:'',gameName:'',alt:'',caption:'',tags:[],originalName:obj.name,usages,usageCount:usages.length,hardDeleteAllowed:false,hardDeleteReason:'register_first'})}}
 for(const saved of assets){if(seen.has(saved.id))continue;const usages=usagesFor(saved,maps),scope=hardDeleteScope(saved,production);items.push({...saved,missing:true,usages,usageCount:usages.length,hardDeleteAllowed:false,hardDeleteReason:scope.reason||'r2_object_missing'})}
 items.sort((a,b)=>String(b.lastModified||b.updatedAt||b.createdAt||'').localeCompare(String(a.lastModified||a.updatedAt||a.createdAt||'')));return{items,truncated:inv.truncated,count:items.length};
}
async function assetById(sql,id){const full=assetId(id);if(!full)return null;const rows=await sql`SELECT id,title,status,metadata,created_at,updated_at FROM core.contents WHERE id=${full} AND source=${SOURCE} AND content_type=${ASSET_TYPE} LIMIT 1`;return rows[0]?toAsset(rows[0]):null}
async function assetByKey(sql,key){const rows=await sql`SELECT id,title,status,metadata,created_at,updated_at FROM core.contents WHERE source=${SOURCE} AND content_type=${ASSET_TYPE} AND metadata->>'r2Key'=${key} LIMIT 1`;return rows[0]?toAsset(rows[0]):null}
async function registerKey(sql,body){
 const key=clean(body.key||body.r2Key,1400);if(!key){const e=new Error('r2_key_required');e.status=400;throw e}const existing=await assetByKey(sql,key);if(existing)return existing;
 const head=await r2().send(new HeadObjectCommand({Bucket:bucket(),Key:key})),mimeType=clean(head.ContentType||body.mimeType,160),kind=typeOf(key,mimeType),size=Number(head.ContentLength||body.size||0)||0,id=`media-asset:${crypto.randomUUID()}`,now=new Date().toISOString();
 const metadata=JSON.stringify({r2Key:key,mimeType,kind,size,etag:String(head.ETag||body.etag||'').replaceAll('"',''),originalName:clean(body.name||body.originalName,260)||fileNameOf(key),storagePurpose:purposeOf(key),gameId:clean(body.gameId,200),gameNameCache:clean(body.gameName,260),alt:clean(body.alt,500),caption:clean(body.caption,1200),tags:list(body.tags,40,100),createdAt:now});
 const rows=await sql`INSERT INTO core.contents(id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at) VALUES(${id},${ASSET_TYPE},${clean(body.name,260)||fileNameOf(key)},${`/media-library/_private/${encodeURIComponent(publicAssetId(id))}`},'','','active',${SOURCE},CAST(${metadata} AS jsonb),now(),now()) RETURNING id,title,status,metadata,created_at,updated_at`;return toAsset(rows[0]);
}
async function updateAsset(sql,body){const current=await assetById(sql,body.id);if(!current){const e=new Error('asset_not_found');e.status=404;throw e}const rows=await sql`SELECT metadata FROM core.contents WHERE id=${current.id} AND source=${SOURCE} AND content_type=${ASSET_TYPE} LIMIT 1`,old=rows[0]?.metadata&&typeof rows[0].metadata==='object'?rows[0].metadata:{},next={...old,gameId:clean(body.gameId,200),gameNameCache:clean(body.gameName,260),alt:clean(body.alt,500),caption:clean(body.caption,1200),tags:list(body.tags,40,100)},title=clean(body.name,260)||current.name,out=await sql`UPDATE core.contents SET title=${title},metadata=CAST(${JSON.stringify(next)} AS jsonb),updated_at=now() WHERE id=${current.id} AND source=${SOURCE} AND content_type=${ASSET_TYPE} RETURNING id,title,status,metadata,created_at,updated_at`;return toAsset(out[0])}
async function setTrash(sql,id,trash){const current=await assetById(sql,id);if(!current){const e=new Error('asset_not_found');e.status=404;throw e}const rows=await sql`SELECT metadata FROM core.contents WHERE id=${current.id} AND source=${SOURCE} AND content_type=${ASSET_TYPE} LIMIT 1`,old=rows[0]?.metadata&&typeof rows[0].metadata==='object'?rows[0].metadata:{},next={...old,trashedAt:trash?new Date().toISOString():null},out=await sql`UPDATE core.contents SET status=${trash?'trash':'active'},metadata=CAST(${JSON.stringify(next)} AS jsonb),updated_at=now() WHERE id=${current.id} AND source=${SOURCE} AND content_type=${ASSET_TYPE} RETURNING id,title,status,metadata,created_at,updated_at`;return toAsset(out[0])}
async function hardDelete(sql,id,production){const current=await assetById(sql,id);if(!current){const e=new Error('asset_not_found');e.status=404;throw e}if(current.status!=='trash'){const e=new Error('asset_must_be_in_trash');e.status=409;throw e}const maps=await usageMaps(sql),usages=usagesFor(current,maps);if(usages.length){const e=new Error('asset_in_use');e.status=409;e.details={usages};throw e}const scope=hardDeleteScope(current,production);if(!scope.allowed){const e=new Error(scope.reason);e.status=409;throw e}await r2().send(new DeleteObjectCommand({Bucket:bucket(),Key:current.r2Key}));const rows=await sql`SELECT metadata FROM core.contents WHERE id=${current.id} AND source=${SOURCE} AND content_type=${ASSET_TYPE} LIMIT 1`,old=rows[0]?.metadata&&typeof rows[0].metadata==='object'?rows[0].metadata:{},next={...old,hardDeletedAt:new Date().toISOString()};await sql`UPDATE core.contents SET status='archived',metadata=CAST(${JSON.stringify(next)} AS jsonb),updated_at=now() WHERE id=${current.id} AND source=${SOURCE} AND content_type=${ASSET_TYPE}`;return{id:current.id,r2Key:current.r2Key}}
async function sendFile(res,key){const obj=await r2().send(new GetObjectCommand({Bucket:bucket(),Key:key}));if(!obj.Body){const e=new Error('media_not_found');e.status=404;throw e}const bytes=Buffer.from(await obj.Body.transformToByteArray());res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',obj.ContentType||'application/octet-stream');res.setHeader('Content-Length',String(bytes.length));res.setHeader('Content-Disposition','inline');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');return res.status(200).send(bytes)}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');try{const ctx=await databaseContext();await authorize(req,ctx.production);if(req.method==='GET'){const action=clean(req.query?.action,40);if(action==='file'){let key=clean(req.query?.key,1400);if(req.query?.id){const asset=await assetById(ctx.sql,req.query.id);if(!asset||asset.status==='archived'){const e=new Error('asset_not_found');e.status=404;throw e}key=asset.r2Key}if(!key){const e=new Error('media_key_required');e.status=400;throw e}return await sendFile(res,key)}const data=await mergedLibrary(ctx.sql,ctx.production);return res.status(200).json({ok:true,environment:ctx.production?'production':'preview',branchId:ctx.branchId,hardDeletePreviewDisabled:!ctx.production,...data})}ensureWriteOrigin(req);const body=parseBody(req);if(req.method==='POST'){const action=clean(body.action,40);if(action==='register')return res.status(200).json({ok:true,asset:await registerKey(ctx.sql,body)});if(action==='trash')return res.status(200).json({ok:true,asset:await setTrash(ctx.sql,body.id,true)});if(action==='restore')return res.status(200).json({ok:true,asset:await setTrash(ctx.sql,body.id,false)});return res.status(400).json({ok:false,error:'unknown_action'})}if(req.method==='PATCH')return res.status(200).json({ok:true,asset:await updateAsset(ctx.sql,body)});if(req.method==='DELETE'){if(body.confirm!=='DELETE')return res.status(400).json({ok:false,error:'delete_confirmation_required'});return res.status(200).json({ok:true,deleted:await hardDelete(ctx.sql,body.id,ctx.production)})}return res.status(405).json({ok:false,error:'method_not_allowed'})}catch(error){console.error('[media-library]',error?.message||error);return res.status(error?.status||500).json({ok:false,error:error?.message||'media_library_failed',...(error?.details||{})})}}
