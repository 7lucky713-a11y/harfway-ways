const HUB_API='https://harfway-vercel-hub.vercel.app/api/entries';

// Snapshot of HUB entries that existed when automatic sync was introduced.
// Any new HUB id added after this point is treated as an AUTO SYNC candidate.
const BASELINE_HUB_IDS=new Set([
  'hub','play','scr','show','ads','clean','mochikomi-02','editors-pick','tv','pltv','petit',
  'yorimichi-editor','scrap-extractor','design-stock','factory','zine-editor','todays-flyer',
  'db-importer','kirehashi-read-watch'
]);

// Sub-routes living inside an existing Vercel project do not create a new HUB id.
// Keep those first-class tools here so Control Center still treats them like synced tools.
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
  }
];

const CORE_CHECKS=[
  {id:'hub',name:'VERCEL HUB',kind:'ops',url:'https://harfway-vercel-hub.vercel.app/'},
  {id:'ways',name:'WAYS',kind:'publish',url:'https://harfway-playback.vercel.app/'},
  {id:'ways-editor',name:'WAYS EDITOR',kind:'create',url:'https://harfway-playback-editor.vercel.app/'},
  {id:'archive',name:'WAYS ARCHIVE',kind:'publish',url:'https://harfway-playback.vercel.app/archive/'},
  {id:'salvager',name:'ARCHIVE SALVAGER',kind:'core',url:'https://harfway-playback.vercel.app/salvage/'},
  {id:'db-master',name:'DB MASTER',kind:'core',url:'https://harfway-playback.vercel.app/db-master'},
  {id:'r2-media',name:'R2 MEDIA MANAGER',kind:'core',url:'https://harfway-showcase-manager-v2.vercel.app/r2-media.html'},
  {id:'analytics',name:'ANALYTICS HUB',kind:'ops',url:'https://harfway-playback.vercel.app/analytics'},
  {id:'showcase',name:'SHOWCASE',kind:'publish',url:'https://harfway-showcase-ui-v4.vercel.app/'},
  {id:'playlist',name:'PLAYLIST TV',kind:'publish',url:'https://harfway-playlist-tv.vercel.app/'},
  {id:'scrapbook',name:'GAME SCRAPBOOK',kind:'publish',url:'https://harf-way-game-scrapbook.vercel.app/'},
  {id:'yorimichi',name:'YORIMICHI EDITOR',kind:'create',url:'https://weekly-yorimichi-editor.vercel.app/'},
  {id:'zine',name:'ZINE EDITOR',kind:'create',url:'https://harfway-zine-editor.vercel.app/'},
  {id:'design-stock',name:'DESIGN STOCK',kind:'create',url:'https://design-stock-nu.vercel.app/'},
  {id:'factory',name:'HARFWAY FACTORY',kind:'create',url:'https://harfway-factory-restart-test.vercel.app/'},
  {id:'cleanup',name:'VERCEL CLEANUP',kind:'ops',url:'https://harfway-vercel-cleanup-harf-way.vercel.app/'}
];

async function timedFetch(url,opts={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),6500);
  const started=Date.now();
  try{
    let res=await fetch(url,{method:'HEAD',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.3'},...opts});
    if(res.status===405||res.status===501){
      res=await fetch(url,{method:'GET',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.3'},...opts});
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

async function withManifest(item={}){
  const url=manifestUrl(item);
  if(!url)return {...item,sync_source:'hub',manifest:null};
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),2500);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.3'}});
    if(!response.ok)return {...item,sync_source:'hub',manifest:null};
    const manifest=await response.json().catch(()=>null);
    if(!manifest||manifest.harfway!==true)return {...item,sync_source:'hub',manifest:null};
    return {...item,sync_source:'manifest',manifest};
  }catch{
    return {...item,sync_source:'hub',manifest:null};
  }finally{clearTimeout(timer)}
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  res.setHeader('Cache-Control','no-store');
  const checkedAt=new Date().toISOString();
  const [hubResult,checks]=await Promise.all([
    fetch(HUB_API,{headers:{'user-agent':'HARF-WAY-Control-Center/0.3'}})
      .then(async r=>({ok:r.ok,status:r.status,data:r.ok?await r.json():null}))
      .catch(error=>({ok:false,status:0,error:String(error?.message||error)})),
    Promise.all(CORE_CHECKS.map(async item=>({...item,...await timedFetch(item.url)})))
  ]);
  const hubItems=Array.isArray(hubResult?.data?.items)?hubResult.data.items:[];
  const localIds=new Set(LOCAL_AUTO_ITEMS.map(item=>String(item.id||'')));
  const autoCandidates=hubItems.filter(item=>!BASELINE_HUB_IDS.has(String(item?.id||''))&&!localIds.has(String(item?.id||'')));
  const remoteAutoItems=await Promise.all(autoCandidates.slice(0,20).map(withManifest));
  const autoItems=[...LOCAL_AUTO_ITEMS,...remoteAutoItems].slice(0,20);
  const healthy=checks.filter(x=>x.ok).length;
  return res.status(200).json({
    ok:true,
    checkedAt,
    summary:{healthy,total:checks.length,hubEntries:hubItems.length,autoSync:autoItems.length},
    checks,
    hub:{
      connected:!!hubResult.ok,
      status:hubResult.status||0,
      items:hubItems,
      autoItems,
      baselineCount:BASELINE_HUB_IDS.size
    }
  });
}
