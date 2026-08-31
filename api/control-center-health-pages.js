import baseHandler from './control-center-health.js';

const PREVIEW_PAGE_ITEMS=[
  {
    id:'my-game-shelf',
    project_slug:'harfway-playlist-tv',
    public_url:'https://harfway-playlist-tv.vercel.app/shelf-live.html',
    admin_url:'https://harfway-playlist-tv.vercel.app/thumbnail-manager.html',
    sync_source:'preview-page-manifest',
    manifest:{
      harfway:true,
      id:'my-game-shelf',
      name:'MY GAME SHELF',
      project_slug:'harfway-playlist-tv',
      group:'PUBLISH',
      role:'自分のゲーム棚・再発見',
      description:'HARF-WAYが拾ってきたゲームを読者が自分の棚に持ち帰り、自分タグ・メモ・MEMORY CARDで整理する読者向け棚。',
      public_url:'https://harfway-playlist-tv.vercel.app/shelf-live.html',
      admin_url:'https://harfway-playlist-tv.vercel.app/thumbnail-manager.html',
      control_center:{sync:true,scope:'page'}
    }
  },
  {
    id:'weekly-harfway',
    project_slug:'harfway-playback',
    admin_url:'https://harfway-playback.vercel.app/weekly-harfway/',
    sync_source:'preview-page-manifest',
    manifest:{
      harfway:true,
      id:'weekly-harfway',
      name:'WEEKLY HARF-WAY',
      project_slug:'harfway-playback',
      group:'CREATE',
      role:'週刊まとめ編集・WordPress出力',
      description:'先週分のHARF-WAY素材を集め、WEEKLY BOARD・X/WAYS GAME LOG・MEMOを編集し、WordPress用HTML/CSSへ出力する週刊編集室。',
      admin_url:'https://harfway-playback.vercel.app/weekly-harfway/',
      control_center:{sync:true,scope:'page'}
    }
  }
];

function captureResponse(){
  return {
    statusCode:200,
    payload:null,
    headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(payload){this.payload=payload;return payload;}
  };
}

async function fetchJson(url,{timeoutMs=3200}={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center-Pages/0.1'}});
    const data=await response.json().catch(()=>null);
    return {ok:response.ok,status:response.status,data};
  }catch(error){
    return {ok:false,status:0,data:null,error:error?.name==='AbortError'?'timeout':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}

function normalizeId(value=''){
  return String(value||'').trim().toLowerCase();
}

function normalizeUrl(value=''){
  try{
    const u=new URL(String(value||'').trim());
    return `${u.origin}${u.pathname.replace(/\/+$/,'')||'/'}`;
  }catch{return String(value||'').trim().replace(/\/+$/,'')}
}

function bundleOrigin(item={}){
  for(const raw of [item.public_url,item.admin_url,item.metrics_url]){
    try{return new URL(String(raw||'').trim()).origin}catch{}
  }
  return '';
}

function pageItem(raw={},parent={}){
  const manifest=raw.manifest||raw;
  const control=manifest?.control_center||{};
  if(manifest?.harfway!==true||control.sync===false||control.scope!=='page')return null;
  const id=String(manifest.id||raw.id||'').trim();
  if(!id)return null;
  return {
    id,
    project_slug:manifest.project_slug||raw.project_slug||parent.project_slug||'',
    public_url:manifest.public_url||raw.public_url||'',
    admin_url:manifest.admin_url||raw.admin_url||'',
    metrics_url:manifest.metrics_url||raw.metrics_url||'',
    sync_source:'page-manifest',
    manifest:{...manifest,control_center:{...control,scope:'page'}}
  };
}

function itemKey(item={}){
  const m=item.manifest||{};
  const id=normalizeId(m.id||item.id);
  if(id)return `id:${id}`;
  const url=normalizeUrl(m.public_url||item.public_url||m.admin_url||item.admin_url);
  return url?`url:${url}`:'';
}

async function loadBundle(origin,parent={}){
  if(!origin)return {connected:false,origin,status:0,items:[]};
  const result=await fetchJson(`${origin}/harfway-tools.json`);
  const bundle=result.data;
  if(!result.ok||!bundle||bundle.harfway!==true||!Array.isArray(bundle.items)){
    return {connected:false,origin,status:result.status||0,items:[]};
  }
  const items=bundle.items.map(raw=>pageItem(raw,parent)).filter(Boolean);
  return {connected:true,origin,status:result.status,items};
}

async function discoverPages(hubItems=[]){
  const parents=[];
  const seenOrigins=new Set();
  for(const item of hubItems){
    const origin=bundleOrigin(item);
    if(!origin||seenOrigins.has(origin))continue;
    seenOrigins.add(origin);
    parents.push({origin,parent:item});
  }
  const bundles=await Promise.all(parents.slice(0,30).map(x=>loadBundle(x.origin,x.parent)));
  return {
    scanned:bundles.length,
    connected:bundles.filter(x=>x.connected).length,
    bundles,
    items:bundles.flatMap(x=>x.items)
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});

  const captured=captureResponse();
  await baseHandler(req,captured);
  const base=captured.payload;
  if(!base||captured.statusCode>=400)return res.status(captured.statusCode||500).json(base||{ok:false,error:'base_health_failed'});

  const pageDiscovery=await discoverPages(base?.hub?.items||[]);
  const existing=Array.isArray(base?.hub?.autoItems)?base.hub.autoItems:[];
  const seen=new Set(existing.map(itemKey).filter(Boolean));
  const pageItems=[];
  const candidates=[...pageDiscovery.items,...(process.env.VERCEL_ENV==='production'?[]:PREVIEW_PAGE_ITEMS)];
  for(const item of candidates){
    const key=itemKey(item);
    if(!key||seen.has(key))continue;
    seen.add(key);
    pageItems.push(item);
  }
  const autoItems=[...existing,...pageItems].slice(0,40);

  res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=300');
  return res.status(200).json({
    ...base,
    summary:{
      ...(base.summary||{}),
      autoSync:autoItems.length,
      pageManifestSync:pageItems.length
    },
    hub:{
      ...(base.hub||{}),
      autoItems
    },
    pageDiscovery:{
      source:'production-origin-harfway-tools-json',
      scannedOrigins:pageDiscovery.scanned,
      connectedBundles:pageDiscovery.connected,
      previewFixture:process.env.VERCEL_ENV!=='production',
      autoItems:pageItems,
      bundles:pageDiscovery.bundles.map(x=>({origin:x.origin,connected:x.connected,status:x.status,itemCount:x.items.length}))
    }
  });
}
