const HUB_API='https://harfway-vercel-hub.vercel.app/api/entries';

const CORE_CHECKS=[
  {id:'hub',name:'VERCEL HUB',kind:'hub',url:'https://harfway-vercel-hub.vercel.app/'},
  {id:'ways',name:'WAYS',kind:'public',url:'https://harfway-playback.vercel.app/'},
  {id:'ways-archive',name:'WAYS ARCHIVE',kind:'public',url:'https://harfway-playback.vercel.app/archive/'},
  {id:'salvager',name:'ARCHIVE SALVAGER',kind:'tool',url:'https://harfway-playback.vercel.app/salvage/'},
  {id:'db-master',name:'DB MASTER',kind:'tool',url:'https://harfway-playback.vercel.app/db-master'},
  {id:'analytics',name:'ANALYTICS HUB',kind:'analytics',url:'https://harfway-playback.vercel.app/analytics'},
  {id:'showcase',name:'SHOWCASE',kind:'public',url:'https://harfway-showcase-ui-v4.vercel.app/'},
  {id:'playlist',name:'PLAYLIST TV',kind:'public',url:'https://harfway-playlist-tv.vercel.app/'},
  {id:'yorimichi',name:'YORIMICHI EDITOR',kind:'editor',url:'https://weekly-yorimichi-editor.vercel.app/'},
  {id:'zine',name:'ZINE EDITOR',kind:'editor',url:'https://harfway-zine-editor.vercel.app/'},
  {id:'design-stock',name:'DESIGN STOCK',kind:'tool',url:'https://design-stock-nu.vercel.app/'},
  {id:'factory',name:'HARFWAY FACTORY',kind:'tool',url:'https://harfway-factory-restart-test.vercel.app/'}
];

async function timedFetch(url,opts={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),6500);
  const started=Date.now();
  try{
    let res=await fetch(url,{method:'HEAD',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.1'},...opts});
    if(res.status===405||res.status===501){
      res=await fetch(url,{method:'GET',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'HARF-WAY-Control-Center/0.1'},...opts});
    }
    return {ok:res.ok,status:res.status,latencyMs:Date.now()-started,finalUrl:res.url||url};
  }catch(error){
    return {ok:false,status:0,latencyMs:Date.now()-started,error:error?.name==='AbortError'?'timeout':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  res.setHeader('Cache-Control','no-store');
  const checkedAt=new Date().toISOString();
  const [hubResult,checks]=await Promise.all([
    fetch(HUB_API,{headers:{'user-agent':'HARF-WAY-Control-Center/0.1'}})
      .then(async r=>({ok:r.ok,status:r.status,data:r.ok?await r.json():null}))
      .catch(error=>({ok:false,status:0,error:String(error?.message||error)})),
    Promise.all(CORE_CHECKS.map(async item=>({...item,...await timedFetch(item.url)})))
  ]);
  const hubItems=Array.isArray(hubResult?.data?.items)?hubResult.data.items:[];
  const healthy=checks.filter(x=>x.ok).length;
  return res.status(200).json({
    ok:true,
    checkedAt,
    summary:{healthy,total:checks.length,hubEntries:hubItems.length},
    checks,
    hub:{connected:!!hubResult.ok,status:hubResult.status||0,items:hubItems}
  });
}
