import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

const STORE_SERVICES=new Set([
  'steam','nintendo','playstation','xbox','itch','dlsite','booth','google_play','app_store',
  'epic','gog','gamejolt','unityroom','novelgame','freem','official','web'
]);

function clean(value,max=4000){return String(value||'').trim().slice(0,max)}

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
    const articleUrl=clean(payload.articleUrl,4000);
    const hintedSource=clean(payload.sourceOfTruth,200);
    if(!gameId)return res.status(400).json({ok:false,error:'game_id_required'});

    if(!config.url&&!config.production){
      const looksSalvaged=hintedSource==='archive-salvager'||gameId.startsWith('game-salvage-');
      return res.status(200).json({
        ok:true,simulated:true,previewOnly:true,writeMode:'preview-dry-run',
        deletedGame:looksSalvaged,unlinkedOnly:!looksSalvaged,
        gameId,articleUrl
      });
    }
    if(!config.url)return res.status(503).json({ok:false,error:'core_database_not_configured',writeMode:config.mode});

    const sql=neon(config.url);
    const gameRows=await sql`
      SELECT id,title,source_of_truth,store_url,article_url,status
      FROM core.games WHERE id=${gameId} LIMIT 1
    `;
    const game=gameRows[0];
    if(!game)return res.status(404).json({ok:false,error:'game_not_found'});

    const refs=await sql`
      SELECT service,external_id,external_url,metadata
      FROM core.game_refs WHERE game_id=${gameId}
      ORDER BY service,external_id
    `;
    const nonStoreRefs=refs.filter(r=>!STORE_SERVICES.has(String(r.service||'')));
    const deletable=String(game.source_of_truth||'')==='archive-salvager'&&nonStoreRefs.length===0;

    if(deletable){
      const linkedRows=await sql`SELECT count(*)::int AS count FROM core.content_game_links WHERE game_id=${gameId}`;
      const articleLinks=Number(linkedRows[0]?.count||0);
      await sql`DELETE FROM core.content_game_links WHERE game_id=${gameId}`;
      await sql`UPDATE core.content_assets SET game_id=NULL WHERE game_id=${gameId}`;
      await sql`DELETE FROM core.games WHERE id=${gameId}`;
      return res.status(200).json({
        ok:true,deletedGame:true,unlinkedOnly:false,gameId,title:game.title,
        removedArticleLinks:articleLinks,removedRefs:refs.length,writeMode:config.mode
      });
    }

    if(!articleUrl){
      return res.status(409).json({
        ok:false,error:'shared_game_cannot_be_deleted',
        message:'このゲームは他コンテンツで使われているため本体削除できません。記事URLを指定して紐付けだけ解除してください。',
        game:{id:game.id,title:game.title,sourceOfTruth:game.source_of_truth},
        protectedRefs:nonStoreRefs.map(r=>r.service)
      });
    }

    const contentRows=await sql`SELECT id,title,url FROM core.contents WHERE url=${articleUrl} LIMIT 1`;
    const content=contentRows[0];
    if(content){
      await sql`DELETE FROM core.content_game_links WHERE content_id=${content.id} AND game_id=${gameId}`;
    }
    return res.status(200).json({
      ok:true,deletedGame:false,unlinkedOnly:true,gameId,title:game.title,
      articleUrl,protectedRefs:nonStoreRefs.map(r=>r.service),writeMode:config.mode
    });
  }catch(error){
    console.error('[archive-delete-game]',error);
    return res.status(500).json({ok:false,error:'archive_delete_game_failed'});
  }
}
