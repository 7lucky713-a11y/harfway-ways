import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

function dbUrl(){return process.env.SALVAGER_PREVIEW_DATABASE_URL||''}
function clean(v,max=4000){return String(v||'').trim().slice(0,max)}
function slugify(v=''){
  return String(v).normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g,'-')
    .replace(/^-+|-+$/g,'').slice(0,64)||'game';
}
function shortHash(v=''){return createHash('sha256').update(String(v)).digest('hex').slice(0,8)}
function steamAppId(url=''){
  try{const u=new URL(url);if(u.hostname!=='store.steampowered.com')return '';const m=u.pathname.match(/\/app\/(\d+)/);return m?.[1]||''}catch{return ''}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'preview_only'});
  const databaseUrl=dbUrl();
  if(!databaseUrl)return res.status(503).json({ok:false,error:'preview_database_not_configured',safeMode:true});

  try{
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const title=clean(payload.title,500);
    const storeUrl=clean(payload.storeUrl,4000);
    const articleUrl=clean(payload.articleUrl,4000);
    if(!title)return res.status(400).json({ok:false,error:'title_required'});
    if(articleUrl){const u=new URL(articleUrl);if(!/(^|\.)harf-way\.com$/i.test(u.hostname))return res.status(400).json({ok:false,error:'harf_way_article_only'})}
    const sql=neon(databaseUrl);

    let existing=[];
    if(storeUrl){
      existing=await sql`SELECT id,title,store_url,article_url,category,status,source_of_truth FROM core.games WHERE lower(title)=lower(${title}) OR store_url=${storeUrl} LIMIT 1`;
    }else{
      existing=await sql`SELECT id,title,store_url,article_url,category,status,source_of_truth FROM core.games WHERE lower(title)=lower(${title}) LIMIT 1`;
    }
    if(existing[0])return res.status(200).json({ok:true,created:false,game:existing[0],safeMode:true});

    const appId=steamAppId(storeUrl);
    const base=appId?`steam-${appId}`:`${slugify(title)}-${shortHash(`${title}|${storeUrl}|${articleUrl}`)}`;
    let gameId=`game-salvage-${base}`;
    const idHit=await sql`SELECT id FROM core.games WHERE id=${gameId} LIMIT 1`;
    if(idHit[0])gameId=`${gameId}-${shortHash(Date.now())}`;

    const rows=await sql`
      INSERT INTO core.games (id,title,description,store_url,article_url,category,status,source_of_truth,updated_at)
      VALUES (${gameId},${title},'',${storeUrl},${articleUrl},'','active','archive-salvager',now())
      RETURNING id,title,store_url,article_url,category,status,source_of_truth,created_at,updated_at
    `;

    if(appId){
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES ('steam',${appId},${gameId},${storeUrl},${JSON.stringify({source:'archive-salvager'})}::jsonb,now())
        ON CONFLICT (service,external_id) DO UPDATE SET
          game_id=EXCLUDED.game_id, external_url=EXCLUDED.external_url, metadata=EXCLUDED.metadata, updated_at=now()
      `;
    }

    return res.status(200).json({ok:true,created:true,game:rows[0],steamAppId:appId||null,safeMode:true});
  }catch(error){
    console.error('[archive-create-game]',error);
    return res.status(500).json({ok:false,error:'archive_create_game_failed'});
  }
}
