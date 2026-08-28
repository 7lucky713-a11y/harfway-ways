function clean(v,max=4000){return String(v||'').trim().slice(0,max)}
function appIdFrom(value=''){
  const raw=clean(value,4000);
  if(/^\d+$/.test(raw))return raw;
  try{
    const u=new URL(raw);
    if(!/(^|\.)store\.steampowered\.com$/i.test(u.hostname))return '';
    return u.pathname.match(/\/app\/(\d+)/)?.[1]||'';
  }catch{return ''}
}
function canonical(appId){return `https://store.steampowered.com/app/${appId}/`}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const input=clean(req.query?.url||req.query?.q,4000);
  const appId=appIdFrom(input);
  if(!appId)return res.status(400).json({ok:false,error:'invalid_steam_url'});
  try{
    const r=await fetch(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=japanese`,{
      headers:{'user-agent':'HARF-WAY Archive Salvager/0.9','accept':'application/json'}
    });
    if(!r.ok)throw new Error(`steam_${r.status}`);
    const j=await r.json();
    const item=j?.[appId];
    if(!item?.success||!item?.data?.name)return res.status(404).json({ok:false,error:'steam_app_not_found',appId});
    return res.status(200).json({ok:true,appId,name:String(item.data.name),storeUrl:canonical(appId)});
  }catch(error){
    console.error('[steam-resolve]',error);
    return res.status(502).json({ok:false,error:'steam_lookup_failed',appId});
  }
}
