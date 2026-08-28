const HUB_API='https://harfway-vercel-hub.vercel.app/api/entries';

const BASELINE_HUB_IDS=new Set([
  'hub','play','scr','show','ads','clean','mochikomi-02','editors-pick','tv','pltv','petit',
  'yorimichi-editor','scrap-extractor','design-stock','factory','zine-editor','todays-flyer',
  'db-importer','kirehashi-read-watch'
]);

const DEFAULT_ANALYTICS_SERVICES=[
  {serviceName:'ways',label:'WAYS',contentType:'public_discovery',productionUrl:'https://harfway-playback.vercel.app/',hosts:['harfway-playback.vercel.app','harfway-playback-harf-way.vercel.app'],source:'built_in'},
  {serviceName:'sale-watch',label:'SALE WATCH',contentType:'public_tool',productionUrl:'https://harfway-playback.vercel.app/sales',hosts:['harfway-playback.vercel.app','harfway-playback-harf-way.vercel.app'],source:'built_in',expectedEvents:['page_view','store_click','content_click','filter_change','search']},
  {serviceName:'showcase',label:'SHOWCASE',contentType:'public_showcase',productionUrl:'https://harfway-showcase-ui-v4.vercel.app/',hosts:['harfway-showcase-ui-v4.vercel.app','harfway-showcase-ui-v4-harf-way.vercel.app'],source:'built_in'},
  {serviceName:'playlist',label:'PLAYLIST',contentType:'public_playlist',productionUrl:'https://harfway-playlist-tv.vercel.app/',hosts:['harfway-playlist-tv.vercel.app','harfway-playlist-tv-harf-way.vercel.app'],source:'built_in'},
  {serviceName:'yorimichi',label:'YORIMICHI',contentType:'editor',productionUrl:'https://weekly-yorimichi-editor.vercel.app/',hosts:['weekly-yorimichi-editor.vercel.app','weekly-yorimichi-editor-harf-way.vercel.app'],source:'built_in'},
  {serviceName:'zine',label:'ZINE',contentType:'editor',productionUrl:'https://harfway-zine-editor.vercel.app/',hosts:['harfway-zine-editor.vercel.app','harfway-zine-editor-harf-way.vercel.app'],source:'built_in'}
];

function cleanServiceName(value){
  const name=String(value||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  return name.slice(0,64);
}

function hostname(value){
  try{return new URL(String(value||'')).hostname.toLowerCase()}catch{return ''}
}

function manifestUrls(item={}){
  const urls=[];
  for(const raw of [item.public_url,item.admin_url]){
    const value=String(raw||'').trim();
    if(!value)continue;
    try{urls.push(new URL('/harfway-tool.json',value).toString())}catch{}
  }
  return [...new Set(urls)];
}

async function fetchJson(url,timeoutMs=2500){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Analytics-Registry/1.0'}});
    if(!response.ok)return null;
    return await response.json().catch(()=>null);
  }catch{return null}finally{clearTimeout(timer)}
}

async function fetchManifest(item){
  for(const url of manifestUrls(item)){
    const manifest=await fetchJson(url,2200);
    if(manifest?.harfway===true)return manifest;
  }
  return null;
}

function fromManifest(manifest,item={}){
  if(!manifest||manifest.harfway!==true||manifest.analytics?.enabled!==true)return null;
  const analytics=manifest.analytics||{};
  const serviceName=cleanServiceName(analytics.service_name||manifest.id||item.id);
  const productionUrl=String(analytics.production_url||manifest.public_url||item.public_url||'').trim();
  const primaryHost=hostname(productionUrl);
  if(!serviceName||!primaryHost)return null;
  const hostAliases=Array.isArray(analytics.host_aliases)?analytics.host_aliases:[];
  const hosts=[primaryHost,...hostAliases.map(hostname).filter(Boolean)];
  return {
    serviceName,
    label:String(analytics.label||manifest.name||item.name||serviceName).trim().slice(0,80),
    contentType:String(analytics.content_type||'public_tool').trim().slice(0,80),
    productionUrl,
    hosts:[...new Set(hosts)],
    source:'manifest',
    manifestId:String(manifest.id||item.id||''),
    hubId:String(item.id||''),
    expectedEvents:Array.isArray(analytics.events)?analytics.events.map(x=>String(x)).filter(Boolean).slice(0,30):[]
  };
}

export async function getAnalyticsRegistry(){
  const services=DEFAULT_ANALYTICS_SERVICES.map(x=>({...x,hosts:[...x.hosts]}));
  const usedNames=new Set(services.map(x=>x.serviceName));
  const usedHosts=new Set(services.flatMap(x=>x.hosts));
  const hub=await fetchJson(HUB_API,3500);
  const hubConnected=Boolean(hub&&Array.isArray(hub.items));
  const hubItems=hubConnected?hub.items:[];
  const candidates=hubItems.filter(item=>!BASELINE_HUB_IDS.has(String(item?.id||''))).slice(0,30);
  const discovered=await Promise.all(candidates.map(async item=>({item,manifest:await fetchManifest(item)})));
  let autoAdded=0;
  const manifestChecked=discovered.filter(x=>manifestUrls(x.item).length>0).length;
  for(const {item,manifest} of discovered){
    const service=fromManifest(manifest,item);
    if(!service||usedNames.has(service.serviceName))continue;
    service.hosts=service.hosts.filter(host=>!usedHosts.has(host));
    if(!service.hosts.length)continue;
    services.push(service);
    usedNames.add(service.serviceName);
    service.hosts.forEach(host=>usedHosts.add(host));
    autoAdded++;
  }
  return {
    services,
    summary:{total:services.length,builtIn:DEFAULT_ANALYTICS_SERVICES.length,autoAdded,hubCandidates:candidates.length,manifestChecked},
    hubConnected
  };
}

export {DEFAULT_ANALYTICS_SERVICES};
