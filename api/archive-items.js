import { neon } from '@neondatabase/serverless';
import { archiveDatabaseConfig, authorizeArchiveRequest, archiveCors } from './archive-core.js';

function clean(value,max=4000){return String(value||'').trim().slice(0,max)}
function clampLimit(value){const n=Number.parseInt(String(value||''),10);if(!Number.isFinite(n)||n<=0)return 100;return Math.min(n,500)}
function array(v){return Array.isArray(v)?v:[]}
function meta(row){return row?.metadata&&typeof row.metadata==='object'?row.metadata:{}}
function buildItems(rows){
  const map=new Map();
  for(const row of rows){
    const m=meta(row);const url=clean(row.external_url||m.url||'',4000);if(!url)continue;
    const id=String(m.articleId||`article:${url}`);
    let x=map.get(id);
    if(!x){
      const assets=array(m.images).map((a,i)=>({
        id:`${id}:asset:${i}`,
        sourceUrl:a.sourceUrl||a.url||'',source_url:a.sourceUrl||a.url||'',
        altText:a.altText||a.alt||'',alt_text:a.altText||a.alt||'',
        assetType:a.assetType||a.asset_type||(a.featured?'featured_image':'image'),
        asset_type:a.assetType||a.asset_type||(a.featured?'featured_image':'image'),
        featured:Boolean(a.featured)
      })).filter(a=>a.sourceUrl);
      x={
        id,content_type:'article',title:String(m.title||url),url,
        published_at:m.publishedAt||null,excerpt:String(m.excerpt||''),body_text:String(m.bodyText||''),
        featured_image_url:String(m.featuredImageUrl||''),status:String(m.status||'draft'),source:String(m.source||'archive-salvager'),
        metadata:{contentSource:m.contentSource||'',nameHints:array(m.nameHints),storeLinks:array(m.storeLinks),unresolvedGames:array(m.unresolvedGames),salvageVersion:m.salvageVersion||'0.8'},
        games:[],assets,created_at:null,updated_at:row.updated_at||null
      };
      map.set(id,x);
    }
    const link=m.link&&typeof m.link==='object'?m.link:{};
    x.games.push({gameId:String(row.game_id||''),game_id:String(row.game_id||''),title:String(row.game_title||link.title||row.game_id||''),score:Number(link.score)||0,excerpt:String(link.excerpt||''),source:String(link.source||'archive-article')});
    if(String(row.updated_at||'')>String(x.updated_at||''))x.updated_at=row.updated_at;
  }
  return [...map.values()].map(x=>({...x,game_count:x.games.length,asset_count:x.assets.length})).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
}

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
    const sql=neon(config.url);const url=clean(req.query?.url);
    if(url){
      const rows=await sql`
        SELECT r.external_url,r.game_id,r.metadata,r.updated_at,g.title AS game_title
        FROM core.game_refs r JOIN core.games g ON g.id=r.game_id
        WHERE r.service='archive-article' AND r.external_url=${url}
        ORDER BY r.updated_at DESC
        LIMIT 200
      `;
      const items=buildItems(rows);
      return res.status(200).json({ok:true,configured:true,writeMode:config.mode,authRequired:auth.authRequired,item:items[0]||null});
    }
    const limit=clampLimit(req.query?.limit);
    const rows=await sql`
      SELECT r.external_url,r.game_id,r.metadata,r.updated_at,g.title AS game_title
      FROM core.game_refs r JOIN core.games g ON g.id=r.game_id
      WHERE r.service='archive-article'
      ORDER BY r.updated_at DESC
      LIMIT ${Math.min(limit*12,5000)}
    `;
    const items=buildItems(rows).slice(0,limit);
    return res.status(200).json({ok:true,configured:true,writeMode:config.mode,authRequired:auth.authRequired,count:items.length,items});
  }catch(error){
    console.error('[archive-items]',error);
    return res.status(500).json({ok:false,error:'archive_items_failed'});
  }
}
