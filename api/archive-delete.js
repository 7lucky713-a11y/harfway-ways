import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

function cleanString(value,max=4000){return String(value||'').trim().slice(0,max)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  archiveCors(res);
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});

  const auth=await authorizeArchiveRequest(req);
  if(!auth.ok)return res.status(auth.status||401).json({ok:false,error:auth.error,authRequired:auth.authRequired});
  const config=auth.config||archiveDatabaseConfig();
  if(!config.url)return res.status(503).json({ok:false,error:config.production?'core_database_not_configured':'preview_database_not_configured',writeMode:config.mode});

  try{
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const url=cleanString(payload.url);
    if(!url)return res.status(400).json({ok:false,error:'url_required'});
    const parsed=new URL(url);
    if(!/(^|\.)harf-way\.com$/i.test(parsed.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});

    const sql=neon(config.url);
    const found=await sql`SELECT id,title,url FROM core.contents WHERE url=${url} LIMIT 1`;
    if(!found.length)return res.status(404).json({ok:false,error:'archive_not_found'});
    const row=found[0];
    const counts=await sql`
      SELECT
        (SELECT count(*)::int FROM core.content_game_links WHERE content_id=${row.id}) AS links,
        (SELECT count(*)::int FROM core.content_assets WHERE content_id=${row.id}) AS assets
    `;
    await sql`DELETE FROM core.contents WHERE id=${row.id}`;
    return res.status(200).json({ok:true,writeMode:config.mode,authRequired:auth.authRequired,deleted:{id:row.id,title:row.title,url:row.url,links:counts[0]?.links||0,assets:counts[0]?.assets||0}});
  }catch(error){
    console.error('[archive-delete]',error);
    return res.status(500).json({ok:false,error:'archive_delete_failed'});
  }
}
