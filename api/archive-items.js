import { neon } from '@neondatabase/serverless';

function getPreviewDatabaseUrl(){return process.env.SALVAGER_PREVIEW_DATABASE_URL||''}
function clean(value,max=4000){return String(value||'').trim().slice(0,max)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const databaseUrl=getPreviewDatabaseUrl();
  if(!databaseUrl)return res.status(200).json({ok:true,safeMode:true,configured:false,items:[]});
  try{
    const sql=neon(databaseUrl);
    const url=clean(req.query?.url);
    if(url){
      const rows=await sql`
        SELECT id,content_type,title,url,published_at,excerpt,body_text,featured_image_url,status,source,metadata,games,assets,created_at,updated_at
        FROM core.content_catalog WHERE url=${url} LIMIT 1
      `;
      return res.status(200).json({ok:true,safeMode:true,configured:true,item:rows[0]||null});
    }
    const rows=await sql`
      SELECT id,title,url,published_at,status,
        jsonb_array_length(games) AS game_count,
        jsonb_array_length(assets) AS asset_count,
        updated_at
      FROM core.content_catalog
      ORDER BY updated_at DESC
      LIMIT 100
    `;
    return res.status(200).json({ok:true,safeMode:true,configured:true,items:rows});
  }catch(error){
    console.error('[archive-items]',error);
    return res.status(500).json({ok:false,error:'archive_items_failed'});
  }
}