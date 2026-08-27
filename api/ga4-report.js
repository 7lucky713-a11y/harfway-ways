import {getGa4Summary,ga4ConfigStatus} from './ga4-lib.js';

const intParam=(value,fallback,min,max)=>{const n=Number.parseInt(String(value??''),10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const days=intParam(req.query?.days,7,1,365);
  const result=await getGa4Summary(days);
  if(!result.ok){
    return res.status(result.reason==='ga4_data_api_credentials_required'?200:502).json({
      ok:false,
      configured:ga4ConfigStatus(),
      reason:result.reason,
      message:result.message||null,
      status:result.status||null
    });
  }
  return res.status(200).json({ok:true,period:result.period,configured:result.config,services:result.services});
}
