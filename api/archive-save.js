import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

function getPreviewDatabaseUrl(){return process.env.SALVAGER_PREVIEW_DATABASE_URL||''}
function makeId(prefix,value){const hash=createHash('sha256').update(String(value||'')).digest('hex').slice(0,20);return `${prefix}:${hash}`}
function cleanString(value,max=150000){return String(value||'').trim().slice(0,max)}
function parseDate(value){const raw=cleanString(value,200);if(!raw)return null;const date=new Date(raw);return Number.isNaN(date.getTime())?null:date.toISOString()}
function cleanCandidate(x){return {name:cleanString(x?.name,500),url:cleanString(x?.url,4000),source:cleanString(x?.source,200),confidence:Math.max(0,Math.min(100,Number(x?.confidence)||0))}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const databaseUrl=getPreviewDatabaseUrl();
  if(!databaseUrl)return res.status(503).json({ok:false,error:'preview_database_not_configured',expectedEnv:'SALVAGER_PREVIEW_DATABASE_URL',safeMode:true});
  try{
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const article=payload.article||{};
    const url=cleanString(article.url,4000),title=cleanString(article.title,1000);if(!url||!title)return res.status(400).json({ok:false,error:'article_required'});
    const parsed=new URL(url);if(!/(^|\.)harf-way\.com$/i.test(parsed.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});
    const contentId=makeId('content',url);const links=Array.isArray(payload.links)?payload.links.slice(0,100):[];const unresolved=(Array.isArray(payload.unresolved)?payload.unresolved:[]).slice(0,100).map(cleanCandidate).filter(x=>x.name);
    const assets=Array.isArray(article.images)?article.images.slice(0,100):[];const status=payload.status==='published'?'published':payload.status==='done'?'reviewed':'draft';const publishedAt=parseDate(article.date);
    const bodyText=cleanString(article.text,150000),excerpt=cleanString(article.excerpt||bodyText.slice(0,500),2000),featuredImageUrl=cleanString(article.featuredImage||'',4000);const sql=neon(databaseUrl);
    const metadata={fetchedUrl:article.url||url,salvageVersion:'0.5',unresolvedGames:unresolved,nameHints:(article.nameHints||[]).slice(0,120),storeLinks:(article.storeLinks||[]).slice(0,120)};
    await sql`
      INSERT INTO core.contents (id,content_type,title,url,published_at,excerpt,body_text,featured_image_url,status,source,metadata,updated_at)
      VALUES (${contentId},'article',${title},${url},${publishedAt},${excerpt},${bodyText},${featuredImageUrl},${status},'archive-salvager',${JSON.stringify(metadata)}::jsonb,now())
      ON CONFLICT (url) DO UPDATE SET title=EXCLUDED.title,published_at=EXCLUDED.published_at,excerpt=EXCLUDED.excerpt,body_text=EXCLUDED.body_text,featured_image_url=EXCLUDED.featured_image_url,status=EXCLUDED.status,source=EXCLUDED.source,metadata=EXCLUDED.metadata,updated_at=now()
    `;
    await sql`DELETE FROM core.content_game_links WHERE content_id=${contentId}`;
    for(const link of links){const gameId=cleanString(link.gameId,500);if(!gameId)continue;await sql`
      INSERT INTO core.content_game_links (content_id,game_id,relation_type,mention_text,note,confidence,source,metadata,updated_at)
      VALUES (${contentId},${gameId},'mentioned',${cleanString(link.excerpt,8000)},'',${Math.max(0,Math.min(100,Number(link.score)||0))},'archive-salvager',${JSON.stringify({matchSource:link.source||''})}::jsonb,now())
      ON CONFLICT (content_id,game_id) DO UPDATE SET mention_text=EXCLUDED.mention_text,confidence=EXCLUDED.confidence,metadata=EXCLUDED.metadata,updated_at=now()
    `}
    await sql`DELETE FROM core.content_assets WHERE content_id=${contentId}`;
    for(let i=0;i<assets.length;i++){const asset=assets[i]||{},sourceUrl=cleanString(asset.url||asset.sourceUrl,4000);if(!sourceUrl)continue;const assetId=makeId('asset',`${url}|${sourceUrl}`);await sql`
      INSERT INTO core.content_assets (id,content_id,game_id,asset_type,source_url,alt_text,sort_order,metadata)
      VALUES (${assetId},${contentId},NULL,${asset.featured?'featured_image':'image'},${sourceUrl},${cleanString(asset.alt,2000)},${i},${JSON.stringify({featured:Boolean(asset.featured)})}::jsonb)
      ON CONFLICT (content_id,source_url) DO UPDATE SET asset_type=EXCLUDED.asset_type,alt_text=EXCLUDED.alt_text,sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata
    `}
    const rows=await sql`SELECT id,title,url,status,games,assets,metadata,updated_at FROM core.content_catalog WHERE id=${contentId} LIMIT 1`;
    return res.status(200).json({ok:true,safeMode:true,content:rows[0]||null});
  }catch(error){console.error('[archive-save]',error);return res.status(500).json({ok:false,error:'archive_save_failed'});}
}
