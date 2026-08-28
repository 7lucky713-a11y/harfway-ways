import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

function makeId(prefix,value){const hash=createHash('sha256').update(String(value||'')).digest('hex').slice(0,20);return `${prefix}:${hash}`}
function cleanString(value,max=150000){return String(value||'').trim().slice(0,max)}
function parseDate(value){const raw=cleanString(value,200);if(!raw)return null;const date=new Date(raw);return Number.isNaN(date.getTime())?null:date.toISOString()}
function cleanCandidate(x){return {name:cleanString(x?.name,500),url:cleanString(x?.url,4000),source:cleanString(x?.source,200),confidence:Math.max(0,Math.min(100,Number(x?.confidence)||0))}}
function cleanAsset(asset={}){const sourceUrl=cleanString(asset.url||asset.sourceUrl,4000);if(!sourceUrl)return null;return {sourceUrl,altText:cleanString(asset.alt||asset.altText,2000),assetType:asset.featured?'featured_image':'image',featured:Boolean(asset.featured)}}
function cleanLink(link={}){const gameId=cleanString(link.gameId,500);if(!gameId)return null;return {gameId,title:cleanString(link.title,500),score:Math.max(0,Math.min(100,Number(link.score)||0)),excerpt:cleanString(link.excerpt,8000),source:cleanString(link.source,300)}}

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
    const article=payload.article||{};
    const url=cleanString(article.url,4000),title=cleanString(article.title,1000);
    if(!url||!title)return res.status(400).json({ok:false,error:'article_required'});
    const parsed=new URL(url);
    if(!/(^|\.)harf-way\.com$/i.test(parsed.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});

    const links=(Array.isArray(payload.links)?payload.links:[]).slice(0,100).map(cleanLink).filter(Boolean);
    if(!links.length)return res.status(400).json({ok:false,error:'article_game_required'});

    const unresolved=(Array.isArray(payload.unresolved)?payload.unresolved:[]).slice(0,100).map(cleanCandidate).filter(x=>x.name);
    const assets=(Array.isArray(article.images)?article.images:[]).slice(0,100).map(cleanAsset).filter(Boolean);
    const status=payload.status==='published'?'published':payload.status==='done'?'reviewed':'draft';
    const publishedAt=parseDate(article.date);
    const bodyText=cleanString(article.text,150000);
    const excerpt=cleanString(article.excerpt||bodyText.slice(0,500),2000);
    const featuredImageUrl=cleanString(article.featuredImage||assets.find(x=>x.featured)?.sourceUrl||'',4000);
    const contentId=makeId('content',url);
    const sql=neon(config.url);

    // Archive articles live as first-class references attached to Core games.
    // Re-saving the same article replaces its previous game links atomically enough for this editor workflow.
    await sql`DELETE FROM core.game_refs WHERE service='archive-article' AND external_url=${url}`;

    const commonMetadata={
      articleId:contentId,
      title,
      publishedAt,
      excerpt,
      bodyText,
      featuredImageUrl,
      status,
      source:'archive-salvager',
      salvageVersion:'0.8',
      contentSource:cleanString(article.contentSource||'',2000),
      unresolvedGames:unresolved,
      nameHints:(article.nameHints||[]).slice(0,120),
      storeLinks:(article.storeLinks||[]).slice(0,120),
      images:assets
    };

    const savedGames=[];
    for(const link of links){
      const existing=await sql`SELECT id,title FROM core.games WHERE id=${link.gameId} LIMIT 1`;
      if(!existing[0])continue;
      const externalId=makeId('archive-link',`${url}|${link.gameId}`);
      const metadata={...commonMetadata,link:{score:link.score,excerpt:link.excerpt,source:link.source,title:link.title||existing[0].title}};
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES ('archive-article',${externalId},${link.gameId},${url},${JSON.stringify(metadata)}::jsonb,now())
        ON CONFLICT (service,external_id) DO UPDATE SET
          game_id=EXCLUDED.game_id,
          external_url=EXCLUDED.external_url,
          metadata=EXCLUDED.metadata,
          updated_at=now()
      `;
      savedGames.push({gameId:link.gameId,title:link.title||existing[0].title,score:link.score,excerpt:link.excerpt,source:link.source});
    }

    if(!savedGames.length)return res.status(400).json({ok:false,error:'linked_games_not_found'});

    return res.status(200).json({
      ok:true,
      writeMode:config.mode,
      authRequired:auth.authRequired,
      content:{
        id:contentId,
        content_type:'article',
        title,
        url,
        published_at:publishedAt,
        excerpt,
        body_text:bodyText,
        featured_image_url:featuredImageUrl,
        status,
        source:'archive-salvager',
        metadata:commonMetadata,
        games:savedGames,
        assets,
        updated_at:new Date().toISOString()
      }
    });
  }catch(error){
    console.error('[archive-save]',error);
    return res.status(500).json({ok:false,error:'archive_save_failed'});
  }
}
