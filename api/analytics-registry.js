import {getAnalyticsRegistry} from './analytics-registry-lib.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const registry=await getAnalyticsRegistry();
    return res.status(200).json({ok:true,generatedAt:new Date().toISOString(),...registry});
  }catch(error){
    console.error('[analytics-registry]',error);
    return res.status(500).json({ok:false,error:'analytics_registry_failed'});
  }
}
