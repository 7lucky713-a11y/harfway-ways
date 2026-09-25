import { archiveCors, authorizeArchiveRequest } from './archive-core.js';
import { publicDatabaseContext } from '../lib/game-public-seo.js';
import { loadPlayNotesPageSettings, savePlayNotesPageSettings } from '../lib/play-notes-page-settings.js';

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  try{return JSON.parse(String(req.body||''))}catch{const e=new Error('invalid_json');e.status=400;throw e}
}
export default async function handler(req,res){
  archiveCors(res);
  res.setHeader('Access-Control-Allow-Methods','GET,PUT,OPTIONS');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow,noarchive');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET'&&req.method!=='PUT')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    if(req.method==='PUT'){
      const auth=await authorizeArchiveRequest(req);
      if(!auth.ok)return res.status(auth.status||401).json({ok:false,error:auth.error||'unauthorized'});
    }
    const ctx=await publicDatabaseContext();
    const result=req.method==='GET'?await loadPlayNotesPageSettings(ctx.sql)
      :await savePlayNotesPageSettings(ctx.sql,parseBody(req));
    return res.status(200).json({ok:true,...result});
  }catch(error){
    console.error('[play-notes-page-settings]',error?.message||error);
    return res.status(error?.status||503).json({ok:false,error:error?.message||'play_notes_page_settings_unavailable'});
  }
}
