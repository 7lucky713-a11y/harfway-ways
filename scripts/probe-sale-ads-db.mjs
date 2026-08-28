import { neon } from '@neondatabase/serverless';

const candidates=[
  ['DATABASE_URL',process.env.DATABASE_URL],
  ['WAYS_DATABASE_URL',process.env.WAYS_DATABASE_URL],
  ['NEON_DATABASE_URL',process.env.NEON_DATABASE_URL],
  ['POSTGRES_URL',process.env.POSTGRES_URL],
  ['SALVAGER_PREVIEW_DATABASE_URL',process.env.SALVAGER_PREVIEW_DATABASE_URL]
];
const [envName,url]=candidates.find(([,value])=>typeof value==='string'&&value.trim())||[];
if(!url){
  console.log('[SALE_ADS_DB_PROBE] configured=false');
  process.exit(0);
}
try{
  const sql=neon(url);
  const tables=(await sql`
    SELECT
      to_regclass('public.ad_campaigns') IS NOT NULL AS ad_campaigns,
      to_regclass('public.ad_events') IS NOT NULL AS ad_events,
      to_regclass('public.ad_media') IS NOT NULL AS ad_media,
      to_regclass('public.ad_placement_rules') IS NOT NULL AS ad_placement_rules
  `)[0]||{};
  let counts={};
  let placements=[];
  if(tables.ad_campaigns&&tables.ad_events){
    counts=(await sql`
      SELECT
        (SELECT count(*)::int FROM public.ad_campaigns) AS campaigns,
        (SELECT count(*)::int FROM public.ad_events WHERE event_type='impression') AS impressions,
        (SELECT count(*)::int FROM public.ad_events WHERE event_type='click') AS clicks,
        (SELECT count(*)::int FROM public.ad_events WHERE event_type='store_visit') AS store_visits
    `)[0]||{};
  }
  if(tables.ad_placement_rules){
    placements=(await sql`SELECT placement FROM public.ad_placement_rules ORDER BY placement`).map(x=>x.placement);
  }
  console.log('[SALE_ADS_DB_PROBE]',JSON.stringify({configured:true,env:envName,tables,counts,placements}));
}catch(error){
  console.log('[SALE_ADS_DB_PROBE]',JSON.stringify({configured:true,env:envName,error:'probe_failed',message:String(error?.message||error).slice(0,160)}));
}
