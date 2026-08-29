const HUB_API='https://harfway-vercel-hub.vercel.app/api/entries';
const VERCEL_API='https://api.vercel.com';
const VERCEL_TEAM_ID='team_gbsYb1fPzUH6nOmZmcSZDvvG';
const VERCEL_SYNC_SINCE=Date.parse('2026-08-29T00:00:00.000Z');

// Snapshot of HUB entries that existed when automatic sync was introduced.
// Any new HUB id added after this point is treated as an AUTO SYNC candidate.
const BASELINE_HUB_IDS=new Set([
  'hub','play','scr','show','ads','clean','mochikomi-02','editors-pick','tv','pltv','petit',
  'yorimichi-editor','scrap-extractor','design-stock','factory','zine-editor','todays-flyer',
  'db-importer','kirehashi-read-watch'
]);

// Existing first-class systems. Production re-deploys of these projects should not
// create duplicate AUTO cards when the Vercel production watcher sees them again.
const KNOWN_TOOL_IDS=new Set([
  'ways','play','playback','archive','salvager','db-master','r2-media','analytics','showcase',
  'playlist','playlist-tv','scrapbook','yorimichi','yorimichi-editor','zine','zine-editor',
  'design-stock','factory','cleanup','sale-watch','reader-entrance','ads','harfway-ads',
  'shelf-admin','shelf-generator'
]);

// Sub-routes living inside an existing Vercel project do not create a new project-level
// production deployment. Keep those first-class tools here so Control Center still treats
// them like synced tools.
const LOCAL_AUTO_ITEMS=[
  {
    id:'sale-watch',
    public_url:'https://harfway-playback.vercel.app/sales',
    admin_url:'https://harfway-playback.vercel.app/sales-admin',
    sync_source:'manifest',
    manifest:{
      harfway:true,
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
    sync_source:'manifest',
    manifest:{
      harfway:true,
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
    sync_source:'manifest',
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
    sync_source:'manifest',
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

function isKnownTool(item={}){
  const manifest=item.manifest||{};
  const id=normalizeId(manifest.id||item.id);
  if(id&&KNOWN_TOOL_IDS.has(id))return true;
  const url=normalizeUrl(manifest.public_url||item.public_url||'');
  if(!url)return false;
  return CORE_CHECKS.some(x=>normalizeUrl(x.url)===url)||LOCAL_AUTO_ITEMS.some(x=>normalizeUrl(x.public_url)===url);
}

async function timedFetch(url,opts={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),6500);
  const started=Date.now();
  try{
    let res=await fetch(url,{method:'HEAD',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.4'},...opts});
    if(res.status===405||res.status===501){
      res=await fetch(url,{method:'GET',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.4'},...opts});
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
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),3000);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.4'}});
    if(!response.ok)return null;
    const manifest=await response.json().catch(()=>null);
    if(!manifest||manifest.harfway!==true||manifest?.control_center?.sync===false)return null;
    return manifest;
  }catch{return null}finally{clearTimeout(timer)}
}

async function withManifest(item={}){
  const url=manifestUrl(item);
  if(!url)return {...item,sync_source:'hub',manifest:null};
  const manifest=await fetchManifest(url);
  return manifest?{...item,sync_source:'manifest',manifest}:{...item,sync_source:'hub',manifest:null};
}

async function loadVercelProductionItems(){
  const token=String(process.env.VERCEL_AUTOMATION_TOKEN||process.env.VERCEL_TOKEN||'').trim();
  if(!token){
    return {connected:false,status:0,reason:'missing_vercel_token',scanned:0,items:[]};
  }

  const params=new URLSearchParams({
    teamId:VERCEL_TEAM_ID,
    target:'production',
    state:'READY',
    limit:'100',
    since:String(VERCEL_SYNC_SINCE)
  });

  try{
    const response=await fetch(`${VERCEL_API}/v7/deployments?${params.toString()}`,{
      cache:'no-store',
      headers:{
        authorization:`Bearer ${token}`,
        'user-agent':'HARF-WAY-Control-Center/0.4'
      }
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      return {connected:false,status:response.status,reason:data?.error?.message||'vercel_api_error',scanned:0,items:[]};
    }

    const deployments=Array.isArray(data?.deployments)?data.deployments:[];
    const newestByProject=new Map();
    for(const deployment of deployments){
      const projectId=String(deployment?.projectId||deployment?.name||'');
      if(!projectId||!deployment?.url)continue;
      const current=newestByProject.get(projectId);
      if(!current||Number(deployment?.created||0)>Number(current?.created||0))newestByProject.set(projectId,deployment);
    }

    const candidates=[...newestByProject.values()].slice(0,40);
    const resolved=await Promise.all(candidates.map(async deployment=>{
      const baseUrl=`https://${String(deployment.url).replace(/^https?:\/\//,'')}`;
      const manifest=await fetchManifest(new URL('/harfway-tool.json',baseUrl).toString());
      if(!manifest)return null;
      const item={
        id:manifest.id||`vercel-${deployment.projectId||deployment.uid||deployment.name}`,
        project_slug:manifest.project_slug||deployment.name||'',
        public_url:manifest.public_url||baseUrl,
        admin_url:manifest.admin_url||'',
        metrics_url:manifest.metrics_url||'',
        sync_source:'vercel-production',
        manifest,
        deployment:{
          id:deployment.uid||deployment.id||'',
          projectId:deployment.projectId||'',
          url:baseUrl,
          created:deployment.created||0,
          target:deployment.target||'production',
          state:deployment.state||deployment.readyState||'READY'
        }
      };
      return isKnownTool(item)?null:item;
    }));

    return {
      connected:true,
      status:response.status,
      reason:'',
      scanned:candidates.length,
      items:resolved.filter(Boolean)
    };
  }catch(error){
    return {connected:false,status:0,reason:String(error?.message||error),scanned:0,items:[]};
  }
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
  res.setHeader('Cache-Control','no-store');
  const checkedAt=new Date().toISOString();

  const [hubResult,checks,vercelResult]=await Promise.all([
    fetch(HUB_API,{headers:{'user-agent':'HARF-WAY-Control-Center/0.4'}})
      .then(async r=>({ok:r.ok,status:r.status,data:r.ok?await r.json():null}))
      .catch(error=>({ok:false,status:0,error:String(error?.message||error)})),
    Promise.all(CORE_CHECKS.map(async item=>({...item,...await timedFetch(item.url)}))),
    loadVercelProductionItems()
  ]);

  const hubItems=Array.isArray(hubResult?.data?.items)?hubResult.data.items:[];
  const localIds=new Set(LOCAL_AUTO_ITEMS.map(item=>String(item.id||'')));
  const autoCandidates=hubItems.filter(item=>!BASELINE_HUB_IDS.has(String(item?.id||''))&&!localIds.has(String(item?.id||'')));
  const remoteAutoItems=await Promise.all(autoCandidates.slice(0,20).map(withManifest));

  // Production watcher is authoritative for new standalone tools. HUB remains as a fallback
  // and for manually registered/sub-route tools.
  const autoItems=mergeAutoItems(LOCAL_AUTO_ITEMS,vercelResult.items,remoteAutoItems);
  const healthy=checks.filter(x=>x.ok).length;

  return res.status(200).json({
    ok:true,
    checkedAt,
    summary:{
      healthy,
      total:checks.length,
      hubEntries:hubItems.length,
      autoSync:autoItems.length,
      vercelProductionSync:vercelResult.items.length
    },
    checks,
    hub:{
      connected:!!hubResult.ok,
      status:hubResult.status||0,
      items:hubItems,
      autoItems,
      baselineCount:BASELINE_HUB_IDS.size
    },
    vercel:{
      connected:vercelResult.connected,
      status:vercelResult.status,
      reason:vercelResult.reason,
      syncSince:new Date(VERCEL_SYNC_SINCE).toISOString(),
      scanned:vercelResult.scanned,
      autoItems:vercelResult.items
    }
  });
}
