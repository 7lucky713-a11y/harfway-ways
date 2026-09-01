import { neon } from '@neondatabase/serverless';

const EDITOR_URL = process.env.WAYS_EDITOR_URL || 'https://harfway-playback-editor.vercel.app';
const PRODUCTION_BASE = 'https://harfway-playback.vercel.app';
const STORE_SERVICES = ['steam','nintendo','playstation','xbox','itch','dlsite','booth','google_play','app_store','epic','gog','gamejolt','unityroom','novelgame','freem','official','web'];

function string(value,max=4000){return String(value||'').trim().slice(0,max)}
function array(value){return Array.isArray(value)?value:[]}
function adminKey(req){return string(req.headers['x-showcase-admin-key']||req.headers['x-admin-key']||'',1000)}
function previewDatabaseUrl(){return process.env.SALVAGER_PREVIEW_DATABASE_URL||''}
function productionDatabaseUrl(){return process.env.WAYS_DATABASE_URL||process.env.DATABASE_URL||process.env.NEON_DATABASE_URL||process.env.POSTGRES_URL||''}
function databaseConfig(){
  const production=process.env.VERCEL_ENV==='production';
  return {production,mode:production?'shared-content-core':'preview-core',url:production?productionDatabaseUrl():previewDatabaseUrl()};
}
function normalizeTitle(value=''){
  return string(value,1000).normalize('NFKC').toLowerCase()
    .replace(/[（(]\s*(?:体験版|demo)\s*[）)]/gi,'')
    .replace(/\s*(?:[-–—:]?\s*demo)\s*$/gi,'')
    .replace(/[\s\u3000'’“”"・:：!！?？,，.。\/\\_-]+/g,'');
}
function steamAppId(value=''){
  const match=string(value,4000).match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match?match[1]:'';
}
function normalizeWay(game={},index=0){
  return {
    id:string(game.id||`game-${index}`,500),title:string(game.title,1000),storeUrl:string(game.storeUrl||game.store_url,4000),
    video:string(game.video||game.video_url,4000),articleUrl:string(game.articleUrl||game.article_url,4000),status:string(game.status,100)
  };
}
async function editorState(key){
  if(!key){const error=new Error('admin_key_required');error.status=401;throw error}
  const response=await fetch(`${EDITOR_URL}/api/proxy?target=${encodeURIComponent('state')}`,{
    cache:'no-store',headers:{accept:'application/json','x-showcase-admin-key':key}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data?.error||'invalid_admin_key');error.status=response.status===401?401:502;throw error}
  const state=data?.state||{games:[]};
  return array(state.games).map(normalizeWay);
}
async function readCore(sql){
  return sql`
    SELECT
      g.id,g.title,g.store_url,g.article_url,g.status,g.source_of_truth,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('service',r.service,'externalId',r.external_id,'externalUrl',r.external_url,'metadata',r.metadata) ORDER BY r.service,r.external_id)
        FROM core.game_refs r
        WHERE r.game_id=g.id AND (r.service='ways' OR r.service=ANY(${STORE_SERVICES}::text[]))
      ),'[]'::jsonb) AS refs,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'url',c.url,'status',c.status) ORDER BY c.updated_at DESC,c.title)
        FROM core.content_game_links l
        JOIN core.contents c ON c.id=l.content_id
        WHERE l.game_id=g.id AND c.content_type='article' AND c.status<>'archived'
      ),'[]'::jsonb) AS articles
    FROM core.games g
    WHERE g.status='active'
    ORDER BY g.updated_at DESC,g.title ASC
    LIMIT 1500
  `;
}
function normalizeCoreGame(row={}){
  return {
    id:string(row.id,500),title:string(row.title,1000),storeUrl:string(row.store_url,4000),articleUrl:string(row.article_url,4000),
    status:string(row.status,100),sourceOfTruth:string(row.source_of_truth,200),refs:array(row.refs),articles:array(row.articles)
  };
}
function buildIndexes(coreGames){
  const byWays=new Map(),bySteam=new Map(),byTitle=new Map();
  for(const game of coreGames){
    const title=normalizeTitle(game.title);
    if(title){if(!byTitle.has(title))byTitle.set(title,[]);byTitle.get(title).push(game)}
    const steamIds=new Set([steamAppId(game.storeUrl)]);
    for(const ref of array(game.refs)){
      if(ref?.service==='ways'&&string(ref?.externalId,500))byWays.set(string(ref.externalId,500),game);
      if(ref?.service==='steam')steamIds.add(string(ref?.externalId,100));
      const refSteam=steamAppId(ref?.externalUrl||'');if(refSteam)steamIds.add(refSteam);
    }
    for(const id of steamIds)if(id&&!bySteam.has(id))bySteam.set(id,game);
  }
  return {byWays,bySteam,byTitle};
}
function inferWay(way,indexes){
  const explicit=indexes.byWays.get(way.id)||null;
  if(explicit)return {status:'linked',game:explicit,matchType:'ways-ref',confidence:100};
  const steam=steamAppId(way.storeUrl);
  if(steam&&indexes.bySteam.has(steam))return {status:'inferred',game:indexes.bySteam.get(steam),matchType:'steam-app-id',confidence:100};
  const matches=indexes.byTitle.get(normalizeTitle(way.title))||[];
  if(matches.length===1)return {status:'inferred',game:matches[0],matchType:'title',confidence:88};
  return {status:'unlinked',game:null,matchType:'unmatched',confidence:0};
}
function summarize(items){
  return items.reduce((out,item)=>{out[item.linkStatus]=(out[item.linkStatus]||0)+1;out.total+=1;return out},{total:0,linked:0,inferred:0,unlinked:0});
}
async function fallbackProductionCore(){
  const response=await fetch(`${PRODUCTION_BASE}/api/core/games?limit=500`,{cache:'no-store',headers:{accept:'application/json'}});
  if(!response.ok)throw new Error('production_core_api_unavailable');
  const payload=await response.json().catch(()=>({}));
  return array(payload?.games).map(game=>({
    id:string(game.id,500),title:string(game.title,1000),storeUrl:string(game.storeUrl,4000),articleUrl:string(game.articleUrl,4000),
    status:string(game.status,100),sourceOfTruth:string(game.sourceOfTruth,200),refs:array(game.refs),articles:[]
  }));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Admin-Key, X-Showcase-Admin-Key');
  if(req.method==='OPTIONS')return res.status(204).end();

  const key=adminKey(req);
  try{
    const ways=await editorState(key);
    const config=databaseConfig();

    if(req.method==='GET'){
      let coreGames=[],readSource='';
      if(config.url){
        const sql=neon(config.url);
        coreGames=(await readCore(sql)).map(normalizeCoreGame);
        readSource=config.production?'production-core-database':'preview-core-database';
      }else{
        coreGames=await fallbackProductionCore();
        readSource='production-core-api-readonly-fallback';
      }
      const indexes=buildIndexes(coreGames);
      const items=ways.map(way=>{
        const match=inferWay(way,indexes),game=match.game;
        return {
          wayId:way.id,title:way.title,storeUrl:way.storeUrl,videoUrl:way.video,waysArticleUrl:way.articleUrl,
          linkStatus:match.status,matchType:match.matchType,confidence:match.confidence,
          coreGameId:game?.id||'',coreTitle:game?.title||'',coreStoreUrl:game?.storeUrl||'',coreArticleUrl:game?.articleUrl||'',
          articles:array(game?.articles)
        };
      });
      return res.status(200).json({ok:true,mode:config.mode,readSource,writable:Boolean(config.url),previewDryRun:!config.production&&!config.url,summary:summarize(items),items,coreGames});
    }

    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const wayId=string(body.wayId,500),coreGameId=string(body.coreGameId,500);
      if(!wayId||!coreGameId)return res.status(400).json({ok:false,error:'way_id_and_core_game_id_required'});
      const way=ways.find(item=>item.id===wayId);
      if(!way)return res.status(404).json({ok:false,error:'ways_item_not_found'});
      if(!config.url){
        if(config.production)return res.status(503).json({ok:false,error:'core_database_not_configured'});
        return res.status(200).json({ok:true,simulated:true,previewOnly:true,writeMode:'preview-dry-run',wayId,coreGameId});
      }
      const sql=neon(config.url);
      const gameRows=await sql`SELECT id,title,store_url,article_url FROM core.games WHERE id=${coreGameId} AND status='active' LIMIT 1`;
      if(!gameRows[0])return res.status(404).json({ok:false,error:'core_game_not_found'});
      const externalUrl=`${PRODUCTION_BASE}/?game=${encodeURIComponent(wayId)}`;
      const metadata={source:'db-master',title:way.title,video_url:way.video,store_url:way.storeUrl,linked_at:new Date().toISOString(),link_method:'manual-confirm'};
      await sql`
        INSERT INTO core.game_refs (service,external_id,game_id,external_url,metadata,updated_at)
        VALUES ('ways',${wayId},${coreGameId},${externalUrl},${JSON.stringify(metadata)}::jsonb,now())
        ON CONFLICT (service,external_id) DO UPDATE SET
          game_id=EXCLUDED.game_id,
          external_url=EXCLUDED.external_url,
          metadata=COALESCE(core.game_refs.metadata,'{}'::jsonb)||EXCLUDED.metadata,
          updated_at=now()
      `;
      return res.status(200).json({ok:true,simulated:false,writeMode:config.mode,wayId,coreGameId,coreTitle:string(gameRows[0].title,1000)});
    }

    if(req.method==='DELETE'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const wayId=string(body.wayId,500);
      if(!wayId)return res.status(400).json({ok:false,error:'way_id_required'});
      if(!ways.some(item=>item.id===wayId))return res.status(404).json({ok:false,error:'ways_item_not_found'});
      if(!config.url){
        if(config.production)return res.status(503).json({ok:false,error:'core_database_not_configured'});
        return res.status(200).json({ok:true,simulated:true,previewOnly:true,writeMode:'preview-dry-run',wayId});
      }
      const sql=neon(config.url);
      const rows=await sql`DELETE FROM core.game_refs WHERE service='ways' AND external_id=${wayId} RETURNING game_id`;
      return res.status(200).json({ok:true,simulated:false,writeMode:config.mode,wayId,removed:rows.length>0,previousCoreGameId:string(rows[0]?.game_id,500)});
    }

    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error('[db-master-core-link]',error?.message||error);
    return res.status(status).json({ok:false,error:error?.message||'db_master_core_link_failed'});
  }
}
