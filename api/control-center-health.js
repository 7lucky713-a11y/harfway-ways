const HUB_API='https://harfway-vercel-hub.vercel.app/api/entries';
const GITHUB_OWNER='7lucky713-a11y';
const GITHUB_REPOS_API=`https://api.github.com/users/${GITHUB_OWNER}/repos?per_page=100&sort=pushed&direction=desc&type=owner`;
const GITHUB_SYNC_SINCE=Date.parse('2026-08-29T00:00:00.000Z');
const LOCAL_REGISTRY_URL='https://raw.githubusercontent.com/7lucky713-a11y/harfway-ways/control-center-registry/public/harfway-tools.json';

const BASELINE_HUB_IDS=new Set([
  'hub','play','scr','show','ads','clean','mochikomi-02','editors-pick','tv','pltv','petit',
  'yorimichi-editor','scrap-extractor','design-stock','factory','zine-editor','todays-flyer',
  'db-importer','kirehashi-read-watch'
]);

const KNOWN_TOOL_IDS=new Set([
  'ways','play','playback','archive','salvager','db-master','r2-media','analytics','showcase',
  'playlist','playlist-tv','scrapbook','yorimichi','yorimichi-editor','zine','zine-editor',
  'design-stock','factory','cleanup','sale-watch','reader-entrance','ads','harfway-ads',
  'shelf-admin','shelf-generator'
]);

const LOCAL_AUTO_ITEMS=[
  {
    id:'sale-watch',
    public_url:'https://harfway-playback.vercel.app/sales',
    admin_url:'https://harfway-playback.vercel.app/sales-admin',
    sync_source:'local-registry',
    manifest:{
      harfway:true,
      id:'sale-watch',
      name:'SALE WATCH',
      group:'OPERATE',
      role:'Steamセール監視',
      description:'HARF-WAYで紹介したゲームをCore横断で監視し、現在のSteamセールを管理・公開。',
      public_url:'https://harfway-playback.vercel.app/sales',
      admin_url:'https://harfway-playback.vercel.app/sales-admin'
    }
  },
  {
    id:'reader-entrance',
    public_url:'https://harfway-playback.vercel.app/entrance',
    sync_source:'local-registry',
    manifest:{
      harfway:true,
      id:'reader-entrance',
      name:'HARF-WAY ENTRANCE',
      group:'PUBLISH',
      role:'読者向けコンテンツHUB',
      description:'HARF-WAY本体・WAYS・PLAYLIST・SCRAPS・SALE WATCHを1か所から辿れる読者向け入口。',
      public_url:'https://harfway-playback.vercel.app/entrance'
    }
  },
  {
    id:'harfway-ads',
    public_url:'https://harfway-ads-prototype.vercel.app/',
    admin_url:'https://harfway-ads-admin.vercel.app/',
    metrics_url:'https://harfway-ads-placement-dashboard.vercel.app/',
    sync_source:'local-registry',
    manifest:{
      harfway:true,
      id:'harfway-ads',
      name:'HARF-WAY ADS',
      group:'OPERATE',
      role:'広告配信・入稿・計測',
      description:'HARF-WAYの自前広告ネットワーク。広告主向け入口、管理、配信枠、IMP上限、結果計測をまとめて扱う。',
      public_url:'https://harfway-ads-prototype.vercel.app/',
      admin_url:'https://harfway-ads-admin.vercel.app/',
      metrics_url:'https://harfway-ads-placement-dashboard.vercel.app/'
    }
  },
  {
    id:'shelf-admin',
    admin_url:'https://harfway-playback.vercel.app/db-master-core',
    sync_source:'local-registry',
    manifest:{
      harfway:true,
      id:'shelf-admin',
      name:'SHELF ADMIN / CORE',
      group:'CREATE',
      role:'棚生成・表示管理',
      description:'Shared Content Coreの作品から棚を組むための表示・固定・画像ソース設定を管理。専用UI分離前はCore DB管理画面を入口にする。',
      admin_url:'https://harfway-playback.vercel.app/db-master-core'
    }
  }
];

const CORE_CHECKS=[
  {id:'hub',name:'VERCEL HUB',kind:'ops',url:'https://harfway-vercel-hub.vercel.app/'},
  {id:'ways',name:'WAYS',kind:'publish',url:'https://harfway-playback.vercel.app/'},
  {id:'ways-editor',name:'WAYS EDITOR',kind:'create',url:'https://harfway-playback-editor.vercel.app/'},
  {id:'archive',name:'WAYS ARCHIVE',kind:'publish',url:'https://harfway-playback.vercel.app/archive/'},
  {id:'salvager',name:'ARCHIVE SALVAGER',kind:'core',url:'https://harfway-playback.vercel.app/salvage/'},
  {id:'db-master',name:'DB MASTER',kind:'core',url:'https://harfway-playback.vercel.app/db-master'},
  {id:'shelf-admin',name:'SHELF ADMIN / CORE',kind:'create',url:'https://harfway-playback.vercel.app/db-master-core'},
  {id:'r2-media',name:'R2 MEDIA MANAGER',kind:'core',url:'https://harfway-showcase-manager-v2.vercel.app/r2-media.html'},
  {id:'analytics',name:'ANALYTICS HUB',kind:'ops',url:'https://harfway-playback.vercel.app/analytics'},
  {id:'ads',name:'HARF-WAY ADS',kind:'ops',url:'https://harfway-ads-admin.vercel.app/'},
  {id:'showcase',name:'SHOWCASE',kind:'publish',url:'https://harfway-showcase-ui-v4.vercel.app/'},
  {id:'playlist',name:'PLAYLIST TV',kind:'publish',url:'https://harfway-playlist-tv.vercel.app/'},
  {id:'scrapbook',name:'GAME SCRAPBOOK',kind:'publish',url:'https://harf-way-game-scrapbook.vercel.app/'},
  {id:'yorimichi',name:'YORIMICHI EDITOR',kind:'create',url:'https://weekly-yorimichi-editor.vercel.app/'},
  {id:'zine',name:'ZINE EDITOR',kind:'create',url:'https://harfway-zine-editor.vercel.app/'},
  {id:'design-stock',name:'DESIGN STOCK',kind:'create',url:'https://design-stock-nu.vercel.app/'},
  {id:'factory',name:'HARFWAY FACTORY',kind:'create',url:'https://harfway-factory-restart-test.vercel.app/'},
  {id:'cleanup',name:'VERCEL CLEANUP',kind:'ops',url:'https://harfway-vercel-cleanup-harf-way.vercel.app/'}
];

function normalizeId(value=''){
  return String(value||'').trim().toLowerCase();
}

function normalizeUrl(value=''){
  try{
    const u=new URL(String(value||'').trim());
    return `${u.origin}${u.pathname.replace(/\/+$/,'')||'/'}`;
  }catch{return String(value||'').trim().replace(/\/+$/,'')}
}

function syncKey(item={}){
  const manifest=item.manifest||{};
  const id=normalizeId(manifest.id||item.id);
  if(id)return `id:${id}`;
  const url=normalizeUrl(manifest.public_url||item.public_url||manifest.admin_url||item.admin_url);
  if(url)return `url:${url}`;
  return '';
}

function isKnownTool(item={},localItems=LOCAL_AUTO_ITEMS){
  const manifest=item.manifest||{};
  const id=normalizeId(manifest.id||item.id);
  if(id&&KNOWN_TOOL_IDS.has(id))return true;
  const url=normalizeUrl(manifest.public_url||item.public_url||'');
  if(!url)return false;
  return CORE_CHECKS.some(x=>normalizeUrl(x.url)===url)||localItems.some(x=>normalizeUrl(x.public_url)===url);
}

async function fetchJson(url,{timeoutMs=3500,headers={}}={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.5',...headers}});
    const data=await response.json().catch(()=>null);
    return {ok:response.ok,status:response.status,data,headers:response.headers};
  }catch(error){
    return {ok:false,status:0,data:null,error:error?.name==='AbortError'?'timeout':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}

async function timedFetch(url,opts={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),6500);
  const started=Date.now();
  try{
    let res=await fetch(url,{method:'HEAD',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.5'},...opts});
    if(res.status===405||res.status===501){
      res=await fetch(url,{method:'GET',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.5'},...opts});
    }
    return {ok:res.ok,status:res.status,latencyMs:Date.now()-started,finalUrl:res.url||url};
  }catch(error){
    return {ok:false,status:0,latencyMs:Date.now()-started,error:error?.name==='AbortError'?'timeout':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}

function manifestUrl(item={}){
  const raw=String(item.admin_url||item.public_url||'').trim();
  if(!raw)return '';
  try{return new URL('/harfway-tool.json',raw).toString()}catch{return ''}
}

async function fetchManifest(url){
  if(!url)return null;
  const result=await fetchJson(url,{timeoutMs:3000});
  const manifest=result.data;
  if(!result.ok||!manifest||manifest.harfway!==true||manifest?.control_center?.sync===false)return null;
  return manifest;
}

async function withManifest(item={}){
  const url=manifestUrl(item);
  if(!url)return {...item,sync_source:'hub',manifest:null};
  const manifest=await fetchManifest(url);
  return manifest?{...item,sync_source:'manifest',manifest}:{...item,sync_source:'hub',manifest:null};
}

async function loadLocalRegistryItems(){
  const result=await fetchJson(LOCAL_REGISTRY_URL,{timeoutMs:2500});
  const items=Array.isArray(result?.data?.items)?result.data.items:[];
  if(!result.ok||!items.length)return {connected:false,status:result.status||0,items:LOCAL_AUTO_ITEMS};
  const clean=items.filter(item=>item?.manifest?.harfway===true&&item?.manifest?.control_center?.sync!==false);
  return {connected:true,status:result.status,items:clean.length?clean:LOCAL_AUTO_ITEMS};
}

function rawManifestUrls(repo={}){
  const fullName=String(repo.full_name||'').trim();
  if(!fullName)return [];
  const refs=['production'];
  const defaultBranch=String(repo.default_branch||'').trim();
  if(defaultBranch&&defaultBranch!=='production')refs.push(defaultBranch);
  const paths=['public/harfway-tool.json','harfway-tool.json'];
  const urls=[];
  for(const ref of refs){
    for(const path of paths)urls.push(`https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(ref)}/${path}`);
  }
  return urls;
}

async function repoManifest(repo={}){
  for(const url of rawManifestUrls(repo)){
    const manifest=await fetchManifest(url);
    if(manifest)return {manifest,sourceUrl:url};
  }
  return null;
}

function sameManifest(repoManifestValue={},liveManifest={}){
  const repoId=normalizeId(repoManifestValue.id||repoManifestValue.project_slug||'');
  const liveId=normalizeId(liveManifest.id||liveManifest.project_slug||'');
  if(repoId&&liveId)return repoId===liveId;
  const repoName=normalizeId(repoManifestValue.name||'');
  const liveName=normalizeId(liveManifest.name||'');
  return Boolean(repoName&&liveName&&repoName===liveName);
}

async function verifyLiveProduction(manifest={}){
  const raw=String(manifest?.control_center?.manifest_url||manifest.public_url||manifest.admin_url||'').trim();
  if(!raw)return null;
  let url='';
  try{
    url=manifest?.control_center?.manifest_url?new URL(raw).toString():new URL('/harfway-tool.json',raw).toString();
  }catch{return null}
  const live=await fetchManifest(url);
  if(!live||!sameManifest(manifest,live))return null;
  return {manifest:live,url};
}

async function loadGithubProductionItems(localItems=LOCAL_AUTO_ITEMS){
  const reposResult=await fetchJson(GITHUB_REPOS_API,{
    timeoutMs:4500,
    headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}
  });
  if(!reposResult.ok||!Array.isArray(reposResult.data)){
    return {connected:false,status:reposResult.status||0,reason:reposResult.error||'github_repo_list_failed',scanned:0,manifestCandidates:0,items:[]};
  }

  const recentRepos=reposResult.data
    .filter(repo=>!repo?.fork&&!repo?.archived&&Date.parse(repo?.pushed_at||0)>=GITHUB_SYNC_SINCE)
    .slice(0,35);

  const discovered=await Promise.all(recentRepos.map(async repo=>{
    const source=await repoManifest(repo);
    if(!source)return null;
    const manifest=source.manifest;
    const item={
      id:manifest.id||`github-${repo.name}`,
      project_slug:manifest.project_slug||repo.name||'',
      public_url:manifest.public_url||'',
      admin_url:manifest.admin_url||'',
      metrics_url:manifest.metrics_url||'',
      sync_source:'github-production',
      manifest,
      repository:{
        fullName:repo.full_name||'',
        defaultBranch:repo.default_branch||'',
        pushedAt:repo.pushed_at||'',
        manifestSource:source.sourceUrl
      }
    };
    if(isKnownTool(item,localItems))return null;
    const live=await verifyLiveProduction(manifest);
    if(!live)return null;
    return {...item,manifest:live.manifest,productionManifestUrl:live.url};
  }));

  const manifestCandidates=discovered.filter(Boolean).length;
  return {
    connected:true,
    status:reposResult.status,
    reason:'',
    scanned:recentRepos.length,
    manifestCandidates,
    items:discovered.filter(Boolean)
  };
}

function mergeAutoItems(...groups){
  const seen=new Set();
  const merged=[];
  for(const group of groups){
    for(const item of group||[]){
      const key=syncKey(item)||`fallback:${normalizeId(item?.project_slug||item?.name||'')}`;
      if(key&&seen.has(key))continue;
      if(key)seen.add(key);
      merged.push(item);
    }
  }
  return merged.slice(0,30);
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=900');
  const checkedAt=new Date().toISOString();

  const [localRegistry,hubResult,checks]=await Promise.all([
    loadLocalRegistryItems(),
    fetchJson(HUB_API,{timeoutMs:3500}),
    Promise.all(CORE_CHECKS.map(async item=>({...item,...await timedFetch(item.url)})))
  ]);

  const localItems=localRegistry.items||LOCAL_AUTO_ITEMS;
  const githubResult=await loadGithubProductionItems(localItems);
  const hubItems=Array.isArray(hubResult?.data?.items)?hubResult.data.items:[];
  const localIds=new Set(localItems.map(item=>String(item.id||'')));
  const autoCandidates=hubItems.filter(item=>!BASELINE_HUB_IDS.has(String(item?.id||''))&&!localIds.has(String(item?.id||'')));
  const remoteAutoItems=await Promise.all(autoCandidates.slice(0,20).map(withManifest));
  const autoItems=mergeAutoItems(localItems,githubResult.items,remoteAutoItems);
  const healthy=checks.filter(x=>x.ok).length;

  return res.status(200).json({
    ok:true,
    checkedAt,
    summary:{
      healthy,
      total:checks.length,
      hubEntries:hubItems.length,
      autoSync:autoItems.length,
      githubProductionSync:githubResult.items.length,
      vercelProductionSync:0
    },
    checks,
    hub:{
      connected:!!hubResult.ok,
      status:hubResult.status||0,
      items:hubItems,
      autoItems,
      baselineCount:BASELINE_HUB_IDS.size
    },
    localRegistry:{
      connected:localRegistry.connected,
      status:localRegistry.status,
      autoItems:localItems
    },
    discovery:{
      connected:githubResult.connected,
      source:'github-production-manifest',
      status:githubResult.status,
      reason:githubResult.reason,
      syncSince:new Date(GITHUB_SYNC_SINCE).toISOString(),
      scanned:githubResult.scanned,
      manifestCandidates:githubResult.manifestCandidates,
      autoItems:githubResult.items
    },
    vercel:{
      connected:false,
      status:0,
      reason:'not_required_tokenless_registry_and_github_discovery',
      syncSince:new Date(GITHUB_SYNC_SINCE).toISOString(),
      scanned:0,
      autoItems:[]
    }
  });
}
