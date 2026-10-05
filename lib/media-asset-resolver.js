const MEDIA_SOURCE='harfway-media-library';
const MEDIA_TYPE='media_asset';

const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const normalizeId=(v='')=>{const s=clean(v,180);return s?(s.startsWith('media-asset:')?s:`media-asset:${s}`):''};
const fileName=(key='')=>{try{return decodeURIComponent(String(key).split('/').pop()||'media')}catch{return String(key).split('/').pop()||'media'}};
const kindOf=(key='',mime='')=>{
  const m=String(mime||'').toLowerCase();
  if(m.startsWith('image/')||/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(key))return'image';
  if(m.startsWith('video/')||/\.(mp4|webm|mov|m4v|mkv)$/i.test(key))return'video';
  if(m.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(key))return'audio';
  return'other';
};
const autoRegisterable=key=>/^private-game-notes\//.test(String(key||''));

async function findById(sql,id){
  if(!id)return null;
  const rows=await sql`SELECT id,metadata FROM core.contents WHERE id=${id} AND source=${MEDIA_SOURCE} AND content_type=${MEDIA_TYPE} AND status<>'archived' LIMIT 1`;
  return rows[0]||null;
}
async function findByKey(sql,key){
  if(!key)return null;
  const rows=await sql`SELECT id,metadata FROM core.contents WHERE source=${MEDIA_SOURCE} AND content_type=${MEDIA_TYPE} AND status<>'archived' AND metadata->>'r2Key'=${key} LIMIT 1`;
  return rows[0]||null;
}
async function registerLegacy(sql,item){
  const key=clean(item?.key,1400);
  if(!autoRegisterable(key))return null;
  const id=`media-asset:${crypto.randomUUID()}`;
  const mimeType=clean(item?.type,160);
  const kind=clean(item?.kind,30)||kindOf(key,mimeType);
  const originalName=clean(item?.name,260)||fileName(key);
  const metadata=JSON.stringify({
    r2Key:key,
    mimeType,
    kind,
    size:Math.max(0,Number(item?.size||0)||0),
    etag:'',
    originalName,
    storagePurpose:'private-game-notes',
    gameId:'',
    gameNameCache:'',
    alt:clean(item?.alt,500),
    caption:clean(item?.caption,1200),
    tags:[],
    createdAt:new Date().toISOString(),
    migratedFrom:'legacy-game-note-media'
  });
  const rows=await sql`
    INSERT INTO core.contents(id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
    VALUES(${id},${MEDIA_TYPE},${originalName},${`/media-library/_private/${encodeURIComponent(id.replace(/^media-asset:/,''))}`},'','','active',${MEDIA_SOURCE},CAST(${metadata} AS jsonb),now(),now())
    RETURNING id,metadata
  `;
  return rows[0]||null;
}

export async function ensureRegisteredMedia(sql,media=[]){
  const out=[];
  for(const raw of Array.isArray(media)?media:[]){
    const item={...raw};
    const key=clean(item.key,1400);
    let id=normalizeId(item.assetId);
    let row=id?await findById(sql,id):null;
    if(row&&key&&clean(row.metadata?.r2Key,1400)!==key)row=null;
    if(!row&&key)row=await findByKey(sql,key);
    if(!row&&key)row=await registerLegacy(sql,item);
    if(row?.id)id=normalizeId(row.id);
    out.push({...item,assetId:id});
  }
  return out;
}

export function attachedMediaAssetIds(media=[]){
  const out=[],seen=new Set();
  for(const item of Array.isArray(media)?media:[]){
    const id=normalizeId(item?.assetId);
    if(!id||seen.has(id))continue;
    seen.add(id);out.push(id);
    if(out.length>=24)break;
  }
  return out;
}
