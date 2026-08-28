import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';
import { GAME_LINK_SERVICES, normalizeGameLinks, choosePrimaryLink } from './game-link-utils.js';

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
    if(!gameId)return res.status(400).json({ok:false,error:'game_id_required'});
    const links=normalizeGameLinks(payload.links||[]);
    const explicitPrimary=clean(payload.primaryUrl,4000);
    let primary=links.find(x=>x.url===explicitPrimary)||choosePrimaryLink(links);
    if(primary)links.forEach(x=>x.primary=x.url===primary.url);

    if(!config.url&&!config.production){
      return res.status(200).json({
        ok:true,updated:true,simulated:true,previewOnly:true,writeMode:'preview-dry-run',
        game:{id:gameId,store_url:primary?.url||''},
        links
      });
    }
    if(!config.url)return res.status(503).json({ok:false,error:'core_database_not_configured',writeMode:config.mode});

    const sql=neon(config.url);
    const games=await sql`SELECT id,title,store_url FROM core.games WHERE id=${gameId} LIMIT 1`;
    if(!games[0])return res.status(404).json({ok:false,error:'game_not_found'});

    for(const link of links){
      const collision=await sql`
        SELECT r.game_id,g.title,r.external_url
        FROM core.game_refs r JOIN core.games g ON g.id=r.game_id
        WHERE r.service=${link.service} AND r.external_id=${link.externalId} AND r.game_id<>${gameId}
        LIMIT 1
      `;
      if(collision[0])return res.status(409).json({
        ok:false,error:'game_link_already_linked',message:'この作品リンクは別ゲームに紐付いています。',
        link,existingGame:collision[0]
      });
    }

    await sql`
      DELETE FROM core.game_refs
      WHERE game_id=${gameId} AND service = ANY(${GAME_LINK_SERVICES}::text[])
    `;

    for(const link of links){
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES (
          ${link.service},${link.externalId},${gameId},${link.url},
          ${JSON.stringify({source:'game-links-editor',label:link.label,name:link.name||'',primary:!!link.primary})}::jsonb,
          now()
        )
        ON CONFLICT (service,external_id) DO UPDATE SET
          game_id=EXCLUDED.game_id,
          external_url=EXCLUDED.external_url,
          metadata=EXCLUDED.metadata,
          updated_at=now()
      `;
    }

    await sql`UPDATE core.games SET store_url=${primary?.url||''},updated_at=now() WHERE id=${gameId}`;
    const updated=await sql`SELECT id,title,store_url,updated_at FROM core.games WHERE id=${gameId} LIMIT 1`;
    const refs=await sql`
      SELECT service,external_id,external_url,metadata,updated_at
      FROM core.game_refs WHERE game_id=${gameId}
      ORDER BY COALESCE((metadata->>'primary')::boolean,false) DESC,service,updated_at DESC
    `;
    return res.status(200).json({ok:true,updated:true,writeMode:config.mode,game:updated[0],links:refs});
  }catch(error){
    console.error('[archive-update-links]',error);
    return res.status(500).json({ok:false,error:'archive_update_links_failed'});
  }
}
