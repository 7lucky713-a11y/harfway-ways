const ROOT='https://harfway-ads-prototype.vercel.app';
const keys=['ad_campaigns','ad_media','ad_events','media_url','media_mime','owner_user_id','ad_pick_campaign','ad_record_'];
const clip=(text,idx,r=260)=>text.slice(Math.max(0,idx-r),Math.min(text.length,idx+r)).replace(/\s+/g,' ');
try{
  const html=await (await fetch(ROOT,{headers:{'user-agent':'HARFWAY-ADS-AUDIT/1.0'}})).text();
  const paths=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
  console.log('[ADS_PORTAL_FIELD_AUDIT] chunks='+paths.length);
  const seen=new Set();
  for(const path of paths){
    const url=path.startsWith('http')?path:ROOT+path;
    const text=await (await fetch(url,{headers:{'user-agent':'HARFWAY-ADS-AUDIT/1.0'}})).text();
    for(const key of keys){
      let from=0,count=0;
      while(count<8){
        const idx=text.indexOf(key,from);if(idx<0)break;
        const sample=clip(text,idx);
        const sig=key+'|'+sample;
        if(!seen.has(sig)){
          seen.add(sig);
          console.log(`[ADS_PORTAL_FIELD_AUDIT] ${key} :: ${sample}`);
          count++;
        }
        from=idx+key.length;
      }
    }
  }
}catch(error){
  console.log('[ADS_PORTAL_FIELD_AUDIT] failed='+String(error?.message||error).slice(0,180));
}
