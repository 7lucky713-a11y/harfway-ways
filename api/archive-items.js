import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

function clean(value,max=4000){return String(value||'').trim().slice(0,max)}
function clampLimit(value){const n=Number.parseInt(String(value||''),10);if(!Number.isFinite(n)||n<=0)return 100;return Math.min(n,500)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  archiveCors(res);
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});

  const auth=await authorizeArchiveRequest(req);
  if(!auth.ok)return res.status(auth.status||401).json({ok:false,error:auth.error,authRequired:auth.authRequired});
  const config=auth.config||archiveDatabaseConfig();
  if(!config.url)return res.status(200).json({ok:true,configured:false,writeMode:config.mode,authRequired:auth.authRequired,items:[]});

  try{
    const sql=neon(config.url);
    const url=clean(req.query?.url);
    if(url){
      const rows=await sql`
        SELECT id,content_type,title,url,published_at,excerpt,body_text,featured_image_url,status,source,metadata,games,assets,created_at,updated_at
        FROM core.content_catalog
        WHERE url=${url} AND source='archive-salvager'
        LIMIT 1
      `;
      return res.status(200).json({ok:true,configured:true,writeMode:config.mode,authRequired:auth.authRequired,item:rows[0]||null});
    }
    const limit=clampLimit(req.query?.limit);
    const rows=await sql`
      SELECT id,title,url,published_at,status,excerpt,featured_image_url,
        COALESCE(jsonb_array_length(games),0) AS game_count,
        COALESCE(jsonb_array_length(assets),0) AS asset_count,
        games,updated_at
      FROM core.content_catalog
      WHERE source='archive-salvager'
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return res.status(200).json({ok:true,configured:true,writeMode:config.mode,authRequired:auth.authRequired,count:rows.length,items:rows});
  }catch(error){
    console.error('[archive-items]',error);
    return res.status(500).json({ok:false,error:'archive_items_failed'});
  }
}
