import {getGa4Summary} from './ga4-lib.js';
import {getAnalyticsRegistry} from './analytics-registry-lib.js';

const PROD_ANALYTICS='https://harfway-playback.vercel.app/api/analytics';
const SHOWCASE='https://harfway-showcase-metrics.vercel.app/api/stats';
const CORE='https://harfway-playback.vercel.app/api/core/games?limit=500';
const GA4_MEASUREMENT_ID='G-LQVHR07K15';

const intParam=(value,fallback,min,max)=>{const n=Number.parseInt(String(value??''),10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};
const num=v=>Number(v||0);
const analyticsUrl=()=>PROD_ANALYTICS;
const ga4Summary=s=>s?{
  pageViews:num(s.pageViews),sessions:num(s.sessions),activeUsers:num(s.activeUsers),eventCount:num(s.eventCount),
  gameViews:num(s.events?.game_view),plays:num(s.events?.video_start),completes:num(s.events?.video_complete),storeClicks:num(s.events?.store_click),
  editorSaves:num(s.events?.editor_save),pageCreates:num(s.events?.page_create),exports:num(s.events?.project_export)+num(s.events?.export_json)+num(s.events?.export_html)
}:null;
const saleGa4Summary=s=>s?{
  pageViews:num(s.pageViews),sessions:num(s.sessions),activeUsers:num(s.activeUsers),eventCount:num(s.eventCount),
  storeClicks:num(s.events?.store_click),contentClicks:num(s.events?.content_click),filterChanges:num(s.events?.sale_filter),searches:num(s.events?.sale_search)
}:null;

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
function collection(def){return {enabled:true,provider:'ga4',measurementId:GA4_MEASUREMENT_ID,serviceName:def.serviceName,contentType:def.contentType,productionUrl:def.productionUrl,source:def.source||'built_in'}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const days=intParam(req.query?.days,7,1,365);
  const key=String(req.headers['x-showcase-admin-key']||'').trim();
  try{
    const base=analyticsUrl();
    const [ways,saleWatch,showcase,core,registry]=await Promise.all([
      jsonFetch(`${base}?days=${days}&page=ways`),
      jsonFetch(`${base}?days=${days}&page=sale-watch`),
      key?jsonFetch(`${SHOWCASE}?showcaseId=mochikomi-02`,{headers:{'x-admin-key':key}}):Promise.resolve({ok:false,status:401,data:{error:'admin_key_required'}}),
      jsonFetch(CORE),
      getAnalyticsRegistry()
    ]);
    const definitions=Array.isArray(registry?.services)?registry.services:[];
    const ga4=await getGa4Summary(days,definitions);

    const titles=new Map((core.data?.games||[]).map(g=>[String(g.id||''),String(g.title||g.id||'')]));
    const waysGames=(ways.data?.games||[]).map(g=>({...g,title:titles.get(String(g.game_id||''))||String(g.game_id||'')}));
    const waysSummary=ways.ok?{
      pageViews:num(ways.data?.summary?.page_views),sessions:num(ways.data?.summary?.sessions),gameViews:num(ways.data?.summary?.game_views),plays:num(ways.data?.summary?.plays),completes:num(ways.data?.summary?.completes),storeClicks:num(ways.data?.summary?.store_clicks),articleClicks:num(ways.data?.summary?.article_clicks),tagClicks:num(ways.data?.summary?.tag_clicks)
    }:null;
    const saleWatchCustomSummary=saleWatch.ok?{
      pageViews:num(saleWatch.data?.summary?.page_views),sessions:num(saleWatch.data?.summary?.sessions),storeClicks:num(saleWatch.data?.summary?.store_clicks),contentClicks:num(saleWatch.data?.summary?.content_clicks),filterChanges:num(saleWatch.data?.summary?.filter_changes),searches:num(saleWatch.data?.summary?.searches)
    }:null;
    const showcaseSummary=showcase.ok?{
      pageViews:showcaseTotal(showcase.data,'showcase_page_view'),sessions:showcaseSessions(showcase.data),gameViews:showcaseTotal(showcase.data,'showcase_game_view'),plays:showcaseTotal(showcase.data,'showcase_video_start'),tenSeconds:showcaseTotal(showcase.data,'showcase_video_10s'),completes:showcaseTotal(showcase.data,'showcase_video_complete'),storeClicks:(showcase.data?.games||[]).reduce((a,g)=>a+num(g.store_clicks),0),picks:showcaseTotal(showcase.data,'showcase_pick_add'),shares:showcaseTotal(showcase.data,'showcase_share')
    }:null;
    const ga4For=name=>ga4.ok?ga4.services?.[name]||null:null;
    const ga4Period=ga4.ok?ga4.period:`last_${days}_days`;
    const showcaseGa4=ga4Summary(ga4For('showcase'));
    const showcaseReporting=showcase.ok||ga4.ok;
    const services={};

    for(const def of definitions){
      const name=def.serviceName;
      if(name==='ways'){
        services.ways={connected:ways.ok,reportingConnected:ways.ok,reportingProvider:'custom',collection:collection(def),period:`last_${days}_days`,status:ways.status,summary:waysSummary,ga4Summary:ga4Summary(ga4For('ways')),games:waysGames,devices:ways.data?.devices||[],attribution:ways.data?.attribution||[],error:ways.ok?null:ways.data?.error,label:def.label,autoSynced:def.source==='manifest'};
        continue;
      }
      if(name==='sale-watch'){
        const routedGa4=saleGa4Summary(ga4For('sale-watch'));
        const reporting=ga4.ok||saleWatch.ok;
        services['sale-watch']={
          connected:reporting,
          reportingConnected:reporting,
          reportingProvider:ga4.ok?(saleWatch.ok?'ga4_data_api+custom':'ga4_data_api'):'custom',
          collection:collection(def),
          period:ga4.ok?ga4Period:`last_${days}_days`,
          status:ga4.ok?200:saleWatch.status,
          summary:routedGa4||saleWatchCustomSummary,
          ga4Summary:routedGa4,
          customSummary:saleWatchCustomSummary,
          games:saleWatch.data?.games||[],
          devices:saleWatch.data?.devices||[],
          error:reporting?null:(saleWatch.data?.error||ga4.reason||'sale_watch_unavailable'),
          label:def.label,
          autoSynced:false,
          expectedEvents:def.expectedEvents||[]
        };
        continue;
      }
      if(name==='showcase'){
        services.showcase={connected:showcaseReporting,reportingConnected:showcaseReporting,deepReportingConnected:showcase.ok,reportingProvider:showcase.ok?'custom+ga4_data_api':'ga4_data_api',collection:collection(def),period:showcase.ok?'all_time':ga4Period,status:showcase.ok?showcase.status:(ga4.ok?200:showcase.status),error:showcaseReporting?null:(showcase.data?.error||ga4.reason||'showcase_unavailable'),summary:showcase.ok?showcaseSummary:showcaseGa4,ga4Summary:showcaseGa4,games:showcase.ok?(showcase.data?.games||[]):[],label:def.label,autoSynced:def.source==='manifest'};
        continue;
      }
      services[name]={
        connected:ga4.ok,
        reportingConnected:ga4.ok,
        reportingProvider:'ga4_data_api',
        collection:collection(def),
        period:ga4Period,
        status:ga4.ok?200:null,
        reason:ga4.ok?null:ga4.reason,
        summary:ga4Summary(ga4For(name)),
        label:def.label,
        autoSynced:def.source==='manifest',
        manifestId:def.manifestId||null,
        expectedEvents:def.expectedEvents||[]
      };
    }

    return res.status(200).json({
      ok:true,
      generatedAt:new Date().toISOString(),
      services,
      ga4:{
        collectionEnabled:true,
        measurementId:GA4_MEASUREMENT_ID,
        servicesInstrumented:definitions.length,
        reportingConnected:ga4.ok,
        reportingProvider:'ga4_data_api',
        period:ga4.ok?ga4.period:null,
        reason:ga4.ok?null:ga4.reason,
        message:ga4.message||null,
        config:ga4.config||null,
        services:ga4.ok?ga4.services:{},
        customDimensions:['service_name','content_type','game_id']
      },
      registry:{...registry.summary,hubConnected:registry.hubConnected,services:definitions.map(def=>({serviceName:def.serviceName,label:def.label,contentType:def.contentType,productionUrl:def.productionUrl,pathPrefix:def.pathPrefix,source:def.source,hosts:def.hosts}))},
      core:{connected:core.ok,count:(core.data?.games||[]).length}
    });
  }catch(error){
    console.error('[harfway-analytics]',error);
    return res.status(500).json({ok:false,error:'analytics_hub_failed'});
  }
}
