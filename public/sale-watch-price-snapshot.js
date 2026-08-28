(()=>{
  const nativeFetch=window.fetch.bind(window);
  let snapshotPromise=null;
  let snapshot=null;
  const state={enabled:true,status:'idle',requested:0,onSale:0,available:0,durationMs:0};
  window.HW_SALE_PRICE_SNAPSHOT=state;

  const asUrl=input=>{
    try{return new URL(typeof input==='string'?input:input?.url||'',location.href)}catch{return null}
  };
  const idsFromCatalog=json=>[...new Set((json?.rows||[]).map(x=>String(x?.appid||'')).filter(x=>/^\d+$/.test(x)))];

  async function loadSnapshot(ids){
    if(snapshotPromise)return snapshotPromise;
    const started=performance.now();
    state.status='loading';
    state.requested=ids.length;
    const q=new URLSearchParams({appids:ids.join(',')});
    snapshotPromise=nativeFetch('/api/sale-price-snapshot?'+q.toString(),{cache:'no-store'})
      .then(async r=>{
        const j=await r.json();
        if(!r.ok||!j?.ok)throw new Error('snapshot_failed');
        snapshot=j;
        state.status='ready';
        state.onSale=Number(j?.summary?.onSale||0);
        state.available=Number(j?.summary?.available||0);
        state.durationMs=Math.round(performance.now()-started);
        return j;
      })
      .catch(error=>{
        state.status='fallback';
        state.error=String(error?.message||error);
        state.durationMs=Math.round(performance.now()-started);
        return null;
      });
    return snapshotPromise;
  }

  window.fetch=async function(input,init){
    const url=asUrl(input);
    const method=String(init?.method||'GET').toUpperCase();
    if(!url||method!=='GET')return nativeFetch(input,init);

    if(url.origin===location.origin&&url.pathname==='/api/sales-catalog'){
      const response=await nativeFetch(input,init);
      try{
        const json=await response.clone().json();
        const ids=idsFromCatalog(json);
        if(response.ok&&json?.ok&&ids.length)await loadSnapshot(ids);
      }catch{}
      return response;
    }

    if(url.origin===location.origin&&url.pathname==='/api/steam-prices-public'&&snapshotPromise){
      const snap=await snapshotPromise;
      if(snap?.prices){
        const ids=[...new Set(String(url.searchParams.get('appids')||'').split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x)))];
        const prices={};
        for(const id of ids)prices[id]=snap.prices[id]||{appid:id,ok:false,error:'price_missing'};
        return new Response(JSON.stringify({
          ok:true,country:'JP',currency:'JPY',updatedAt:snap.updatedAt||new Date().toISOString(),
          forced:false,incomplete:Object.values(prices).some(v=>!v?.ok||!v?.priceAvailable),appids:ids,prices,snapshot:true
        }),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
      }
    }

    return nativeFetch(input,init);
  };
})();
