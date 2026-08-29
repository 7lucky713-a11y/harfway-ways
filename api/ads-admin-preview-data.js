import { cors, getSql } from './ads-fair-core.js';

function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function cleanStatus(v){ return String(v||'').trim(); }

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  // Safety: this endpoint is for Vercel-protected Preview deployments only.
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({ok:false,error:'not_found'});
  try{
    const sql=getSql();
    const rows=await sql`
      SELECT
        c.id,
        c.title,
        c.catch_text,
        c.description,
        c.store_url,
        c.media_url,
        c.media_mime,
        c.target_tags,
        c.placements,
        c.status,
        c.impressions,
        c.impression_limit,
        c.price_yen,
        c.end_date,
        c.created_at,
        c.updated_at,
        COALESCE((SELECT count(*) FROM public.ad_events e WHERE e.campaign_id=c.id AND e.event_type='click'),0)::int AS clicks,
        COALESCE((SELECT count(*) FROM public.ad_events e WHERE e.campaign_id=c.id AND e.event_type='store_visit'),0)::int AS store_visits
      FROM public.ad_campaigns c
      ORDER BY
        CASE WHEN c.status='pending' THEN 0 WHEN c.status='active' THEN 1 ELSE 2 END,
        c.created_at DESC
      LIMIT 200
    `;
    const campaigns=rows.map(r=>{
      const impressions=num(r.impressions);
      const limit=num(r.impression_limit);
      const clicks=num(r.clicks);
      return {
        title:String(r.title||''),
        catchText:String(r.catch_text||''),
        description:String(r.description||''),
        storeUrl:String(r.store_url||''),
        mediaUrl:String(r.media_url||''),
        mediaMime:String(r.media_mime||''),
        targetTags:Array.isArray(r.target_tags)?r.target_tags:[],
        placements:Array.isArray(r.placements)?r.placements:[],
        status:cleanStatus(r.status),
        impressions,
        impressionLimit:limit,
        remaining:Math.max(0,limit-impressions),
        clicks,
        ctr:impressions>0?(clicks/impressions*100):0,
        storeVisits:num(r.store_visits),
        priceYen:num(r.price_yen),
        endDate:r.end_date||null,
        createdAt:r.created_at||null,
        updatedAt:r.updated_at||null
      };
    });
    return res.status(200).json({ok:true,campaigns,count:campaigns.length,preview:true,writeEnabled:false});
  }catch(error){
    console.error('[ads-admin-preview-data]',String(error?.message||error));
    return res.status(500).json({ok:false,error:'load_failed'});
  }
}
