import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

function clean(value,max=4000){return String(value||'').trim().slice(0,max)}
function steamAppId(url=''){
  if(!url)return '';
  try{
    const u=new URL(url);
    if(u.hostname!=='store.steampowered.com')return '';
    const m=u.pathname.match(/\/app\/(\d+)/);
    return m?.[1]||'';
  }catch{return ''}
}
function canonicalSteamUrl(appId){return appId?`https://store.steampowered.com/app/${appId}/`:''}

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
    const gameId=clean(payload.gameId,500);
    const inputUrl=clean(payload.storeUrl,4000);
    if(!gameId)return res.status(400).json({ok:false,error:'game_id_required'});

    let appId='';
    let canonical='';
    if(inputUrl){
      appId=steamAppId(inputUrl);
      if(!appId)return res.status(400).json({ok:false,error:'invalid_steam_url',message:'Steamの /app/123456/ 形式のURLを入力してください。'});
      canonical=canonicalSteamUrl(appId);
    }

    // Preview dry-run: verify the edit flow without writing to Production.
    if(!config.url&&!config.production){
      return res.status(200).json({
        ok:true,
        updated:true,
        simulated:true,
        previewOnly:true,
        writeMode:'preview-dry-run',
        authRequired:false,
        game:{id:gameId,store_url:canonical},
        steamAppId:appId||null,
        previous:{storeUrl:null,refs:[]},
        cleared:!appId
      });
    }

    if(!config.url)return res.status(503).json({ok:false,error:'core_database_not_configured',writeMode:config.mode});

    const sql=neon(config.url);
    const gameRows=await sql`
      SELECT id,title,store_url,article_url,category,status,source_of_truth
      FROM core.games WHERE id=${gameId} LIMIT 1
    `;
    const game=gameRows[0];
    if(!game)return res.status(404).json({ok:false,error:'game_not_found'});

    if(appId){
      const collision=await sql`
        SELECT r.game_id,g.title,g.store_url
        FROM core.game_refs r
        JOIN core.games g ON g.id=r.game_id
        WHERE r.service='steam' AND r.external_id=${appId} AND r.game_id<>${gameId}
        LIMIT 1
      `;
      if(collision[0])return res.status(409).json({ok:false,error:'steam_app_id_already_linked',message:'このSteamページは別ゲームに紐付いています。',existingGame:collision[0]});
    }

    const previousStoreUrl=String(game.store_url||'');
    const previousRefs=await sql`
      SELECT external_id,external_url FROM core.game_refs
      WHERE service='steam' AND game_id=${gameId}
      ORDER BY updated_at DESC
    `;

    await sql`UPDATE core.games SET store_url=${canonical},updated_at=now() WHERE id=${gameId}`;
    await sql`DELETE FROM core.game_refs WHERE service='steam' AND game_id=${gameId}`;

    if(appId){
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES ('steam',${appId},${gameId},${canonical},${JSON.stringify({source:'archive-salvager-manual-edit'})}::jsonb,now())
        ON CONFLICT (service,external_id) DO UPDATE SET
          game_id=EXCLUDED.game_id,
          external_url=EXCLUDED.external_url,
          metadata=EXCLUDED.metadata,
          updated_at=now()
      `;
    }

    const updated=await sql`
      SELECT id,title,store_url,article_url,category,status,source_of_truth,updated_at
      FROM core.games WHERE id=${gameId} LIMIT 1
    `;

    return res.status(200).json({
      ok:true,
      updated:true,
      writeMode:config.mode,
      authRequired:auth.authRequired,
      game:updated[0]||null,
      steamAppId:appId||null,
      previous:{storeUrl:previousStoreUrl,refs:previousRefs},
      cleared:!appId
    });
  }catch(error){
    console.error('[archive-update-store]',error);
    return res.status(500).json({ok:false,error:'archive_update_store_failed'});
  }
}
