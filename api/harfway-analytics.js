const WAYS='https://harfway-playback.vercel.app/api/analytics';
const SHOWCASE='https://harfway-showcase-metrics.vercel.app/api/stats';
const CORE='https://harfway-playback.vercel.app/api/core/games?limit=500';
const GA4_MEASUREMENT_ID='G-LQVHR07K15';

const SERVICE_META={
  ways:{contentType:'public_discovery',url:'https://harfway-playback.vercel.app/'},
  showcase:{contentType:'public_showcase',url:'https://harfway-showcase-ui-v4.vercel.app/'},
  playlist:{contentType:'public_playlist',url:'https://harfway-playlist-tv.vercel.app/'},
  yorimichi:{contentType:'editor',url:'https://weekly-yorimichi-editor.vercel.app/'},
  zine:{contentType:'editor',url:'https://harfway-zine-editor.vercel.app/'}
};

const intParam=(value,fallback,min,max)=>{const n=Number.parseInt(String(value??''),10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};
const num=v=>Number(v||0);
const collection=name=>({enabled:true,provider:'ga4',measurementId:GA4_MEASUREMENT_ID,serviceName:name,contentType:SERVICE_META[name].contentType,productionUrl:SERVICE_META[name].url});

async function jsonFetch(url,options={}){
  try{
    const r=await fetch(url,{cache:'no-store',...options});
    const text=await r.text();
    let data={};
    try{data=text?JSON.parse(text):{}}catch{data={error:'invalid_json',preview:text.slice(0,160)}}
    return {ok:r.ok,status:r.status,data};
  }catch(error){
    return {ok:false,status:0,data:{error:error?.message||'fetch_failed'}};
  }
}

function showcaseTotal(data,event){return num(data?.totals?.find?.(x=>x.event_type===event)?.count)}
function showcaseSessions(data){return num(data?.totals?.find?.(x=>x.event_type==='showcase_page_view')?.sessions)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const days=intParam(req.query?.days,7,1,365);
  const key=String(req.headers['x-showcase-admin-key']||'').trim();
  try{
    const [ways,showcase,core]=await Promise.all([
      jsonFetch(`${WAYS}?days=${days}`),
      key?jsonFetch(`${SHOWCASE}?showcaseId=mochikomi-02`,{headers:{'x-admin-key':key}}):Promise.resolve({ok:false,status:401,data:{error:'admin_key_required'}}),
      jsonFetch(CORE)
    ]);

    const titles=new Map((core.data?.games||[]).map(g=>[String(g.id||''),String(g.title||g.id||'')]));
    const waysGames=(ways.data?.games||[]).map(g=>({...g,title:titles.get(String(g.game_id||''))||String(g.game_id||'')}));
    const waysSummary=ways.ok?{
      pageViews:num(ways.data?.summary?.page_views),sessions:num(ways.data?.summary?.sessions),gameViews:num(ways.data?.summary?.game_views),plays:num(ways.data?.summary?.plays),completes:num(ways.data?.summary?.completes),storeClicks:num(ways.data?.summary?.store_clicks),articleClicks:num(ways.data?.summary?.article_clicks),tagClicks:num(ways.data?.summary?.tag_clicks)
    }:null;
    const showcaseSummary=showcase.ok?{
      pageViews:showcaseTotal(showcase.data,'showcase_page_view'),sessions:showcaseSessions(showcase.data),gameViews:showcaseTotal(showcase.data,'showcase_game_view'),plays:showcaseTotal(showcase.data,'showcase_video_start'),tenSeconds:showcaseTotal(showcase.data,'showcase_video_10s'),completes:showcaseTotal(showcase.data,'showcase_video_complete'),storeClicks:(showcase.data?.games||[]).reduce((a,g)=>a+num(g.store_clicks),0),picks:showcaseTotal(showcase.data,'showcase_pick_add'),shares:showcaseTotal(showcase.data,'showcase_share')
    }:null;

    return res.status(200).json({
      ok:true,
      generatedAt:new Date().toISOString(),
      services:{
        ways:{connected:ways.ok,reportingConnected:ways.ok,reportingProvider:'custom',collection:collection('ways'),period:`last_${days}_days`,status:ways.status,summary:waysSummary,games:waysGames,devices:ways.data?.devices||[],error:ways.ok?null:ways.data?.error},
        showcase:{connected:showcase.ok,reportingConnected:showcase.ok,reportingProvider:'custom',collection:collection('showcase'),period:'all_time',status:showcase.status,error:showcase.ok?null:(showcase.data?.error||'showcase_unavailable'),summary:showcaseSummary,games:showcase.data?.games||[]},
        playlist:{connected:false,reportingConnected:false,reportingProvider:'ga4_data_api',collection:collection('playlist'),period:null,status:null,reason:'ga4_data_api_pending'},
        yorimichi:{connected:false,reportingConnected:false,reportingProvider:'ga4_data_api',collection:collection('yorimichi'),period:null,status:null,reason:'ga4_data_api_pending'},
        zine:{connected:false,reportingConnected:false,reportingProvider:'ga4_data_api',collection:collection('zine'),period:null,status:null,reason:'ga4_data_api_pending'}
      },
      ga4:{
        collectionEnabled:true,
        measurementId:GA4_MEASUREMENT_ID,
        servicesInstrumented:5,
        reportingConnected:false,
        reportingProvider:'ga4_data_api',
        reason:'ga4_data_api_credentials_required',
        customDimensions:['service_name','content_type','game_id']
      },
      core:{connected:core.ok,count:(core.data?.games||[]).length}
    });
  }catch(error){
    console.error('[harfway-analytics]',error);
    return res.status(500).json({ok:false,error:'analytics_hub_failed'});
  }
}
