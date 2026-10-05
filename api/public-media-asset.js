import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { publicDatabaseContext } from '../lib/game-public-seo.js';

const SOURCE='harfway-media-library';
const ASSET_TYPE='media_asset';
const PUBLIC_SOURCE='game-note-publications';
const PUBLIC_TYPE='game_note_public_snapshot';
const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const fullId=v=>{const s=clean(v,180);return s?(s.startsWith('media-asset:')?s:`media-asset:${s}`):''};
function r2(){const accountId=process.env.R2_ACCOUNT_ID,accessKeyId=process.env.R2_ACCESS_KEY_ID,secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;if(!accountId||!accessKeyId||!secretAccessKey)throw new Error('r2_credentials_not_configured');return new S3Client({region:'auto',endpoint:`https://${accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey}})}
function bucket(){const b=clean(process.env.R2_BUCKET,240);if(!b)throw new Error('r2_bucket_not_configured');return b}
function metadataList(m,key){return Array.isArray(m?.[key])?m[key].map(x=>fullId(x)).filter(Boolean):[]}

export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end('Method Not Allowed');
 try{
  const id=fullId(req.query?.id);if(!id)return res.status(400).json({ok:false,error:'asset_id_required'});
  const ctx=await publicDatabaseContext();
  const pubs=await ctx.sql`SELECT metadata FROM core.contents WHERE source=${PUBLIC_SOURCE} AND content_type=${PUBLIC_TYPE} AND status='active'`;
  const allowed=pubs.some(row=>metadataList(row.metadata&&typeof row.metadata==='object'?row.metadata:{},'mediaAssetIds').includes(id));
  if(!allowed)return res.status(404).json({ok:false,error:'public_asset_not_found'});
  const rows=await ctx.sql`SELECT id,status,metadata FROM core.contents WHERE id=${id} AND source=${SOURCE} AND content_type=${ASSET_TYPE} AND status<>'archived' LIMIT 1`;
  const row=rows[0];if(!row)return res.status(404).json({ok:false,error:'public_asset_not_found'});
  const meta=row.metadata&&typeof row.metadata==='object'?row.metadata:{};const key=clean(meta.r2Key,1400);if(!key)return res.status(404).json({ok:false,error:'public_asset_not_found'});
  const obj=await r2().send(new GetObjectCommand({Bucket:bucket(),Key:key}));if(!obj.Body)return res.status(404).json({ok:false,error:'public_asset_not_found'});
  const bytes=Buffer.from(await obj.Body.transformToByteArray());
  res.setHeader('Content-Type',obj.ContentType||meta.mimeType||'application/octet-stream');
  res.setHeader('Content-Length',String(bytes.length));
  res.setHeader('Content-Disposition','inline');
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(200).send(bytes);
 }catch(error){console.error('[public-media-asset]',error?.message||error);return res.status(error?.status||500).json({ok:false,error:error?.message||'public_media_failed'})}
}
