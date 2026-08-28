import { neon } from '@neondatabase/serverless';

function candidateUrl(){
  const candidates=[
    ['DATABASE_URL',process.env.DATABASE_URL],
    ['WAYS_DATABASE_URL',process.env.WAYS_DATABASE_URL],
    ['NEON_DATABASE_URL',process.env.NEON_DATABASE_URL],
    ['POSTGRES_URL',process.env.POSTGRES_URL],
    ['SALVAGER_PREVIEW_DATABASE_URL',process.env.SALVAGER_PREVIEW_DATABASE_URL]
  ];
  return candidates.find(([,value])=>typeof value==='string'&&value.trim())||[null,null];
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex');
  if(process.env.VERCEL_ENV==='production')return res.status(404).json({ok:false,error:'preview_only'});
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});

  const [envName,url]=candidateUrl();
  if(!url)return res.status(200).json({ok:true,configured:false,env:null,tables:{}});

  try{
    const sql=neon(url);
    const rows=await sql`
      SELECT
        to_regclass('public.ad_campaigns') IS NOT NULL AS ad_campaigns,
        to_regclass('public.ad_events') IS NOT NULL AS ad_events,
        to_regclass('public.ad_media') IS NOT NULL AS ad_media,
        to_regclass('public.ad_placement_rules') IS NOT NULL AS ad_placement_rules
    `;
    const tables=rows[0]||{};
    let counts=null;
    let placements=[];
    if(tables.ad_campaigns&&tables.ad_events){
      const countRows=await sql`
        SELECT
          (SELECT count(*)::int FROM public.ad_campaigns) AS campaigns,
          (SELECT count(*)::int FROM public.ad_events WHERE event_type='impression') AS impressions,
          (SELECT count(*)::int FROM public.ad_events WHERE event_type='click') AS clicks,
          (SELECT count(*)::int FROM public.ad_events WHERE event_type='store_visit') AS store_visits
      `;
      counts=countRows[0]||null;
    }
    if(tables.ad_placement_rules){
      const ruleRows=await sql`SELECT placement FROM public.ad_placement_rules ORDER BY placement`;
      placements=ruleRows.map(x=>x.placement);
    }
    return res.status(200).json({ok:true,configured:true,env:envName,tables,counts,placements});
  }catch(error){
    console.error('[sale-ads-db-probe]',error?.message||error);
    return res.status(200).json({ok:false,configured:true,env:envName,error:'probe_failed'});
  }
}
