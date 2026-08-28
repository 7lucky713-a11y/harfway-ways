import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

function clean(value,max=4000){return String(value||'').trim().slice(0,max)}
function cleanIds(value){
  const list=Array.isArray(value)?value:[];
  return [...new Set(list.map(x=>clean(x,500)).filter(Boolean))].slice(0,200);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  archiveCors(res);
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});

  const auth=await authorizeArchiveRequest(req);
  if(!auth.ok)return res.status(auth.status||401).json({ok:false,error:auth.error,authRequired:auth.authRequired});
  const config=auth.config||archiveDatabaseConfig();

  try{
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const url=clean(payload.url,4000);
    const excludedGameIds=cleanIds(payload.excludedGameIds);
    if(!url)return res.status(400).json({ok:false,error:'url_required'});
    const parsed=new URL(url);
    if(!/(^|\.)harf-way\.com$/i.test(parsed.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});

    if(!config.url&&!config.production){
      return res.status(200).json({ok:true,simulated:true,previewOnly:true,writeMode:'preview-dry-run',url,excludedGameIds});
    }
    if(!config.url)return res.status(503).json({ok:false,error:'core_database_not_configured',writeMode:config.mode});

    const sql=neon(config.url);
    const rows=await sql`
      UPDATE core.contents
      SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{excludedGameIds}',${JSON.stringify(excludedGameIds)}::jsonb,true),
          updated_at=now()
      WHERE url=${url} AND source='archive-salvager'
      RETURNING id,title,url,metadata,updated_at
    `;
    return res.status(200).json({ok:true,updated:Boolean(rows[0]),writeMode:config.mode,excludedGameIds,content:rows[0]||null});
  }catch(error){
    console.error('[archive-candidate-decisions]',error);
    return res.status(500).json({ok:false,error:'archive_candidate_decisions_failed'});
  }
}
