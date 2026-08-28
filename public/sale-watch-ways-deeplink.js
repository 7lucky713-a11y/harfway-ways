(()=>{
  const shareToken=new URLSearchParams(location.search).get('_vercel_share')||'';
  const sourceMap=new Map();
  const normSources=v=>Array.isArray(v)?v.map(x=>String(x||'').toLowerCase()):[];
  const remember=(appid,patch={})=>{
    appid=String(appid||'').trim();
    if(!/^\d+$/.test(appid))return;
    const prev=sourceMap.get(appid)||{sources:new Set(),scrapUrl:''};
    for(const s of normSources(patch.sources))prev.sources.add(s);
    if(patch.ways)prev.sources.add('ways');
    if(patch.scrap)prev.sources.add('scrap');
    if(!prev.scrapUrl&&patch.scrapUrl)prev.scrapUrl=String(patch.scrapUrl);
    sourceMap.set(appid,prev);
  };
  const appIdFromStore=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const waysUrl=appid=>{
    const url=new URL('/',location.origin);
    url.searchParams.set('steam',appid);
    url.searchParams.set('from','sale-watch');
    if(shareToken)url.searchParams.set('_vercel_share',shareToken);
    return url.pathname+url.search;
  };
  const actionRow=card=>[...card.querySelectorAll('.kvRow')].find(row=>row.querySelector('.kvLabel')?.textContent?.includes('HARF-WAYコンテンツ'))?.querySelector('.links')||null;
  const makeLink=(kind,appid,url,label)=>{
    const a=document.createElement('a');
    a.className=`action ${kind}`;
    a.dataset.track='content_click';
    a.dataset.kind=kind;
    a.dataset.gameId=appid;
    a.dataset.deeplink=kind==='ways'?'steam-appid':'source-repair';
    a.href=url;
    a.target='_blank';
    a.rel='noopener';
    a.textContent=label;
    return a;
  };

  function repairCard(card){
    const appid=String(card.dataset.gameId||'').trim();
    if(!/^\d+$/.test(appid))return;
    const row=actionRow(card);
    if(!row)return;
    const meta=sourceMap.get(appid);
    if(meta?.sources.has('scrap')&&!row.querySelector('a[data-kind="scrap"]')){
      row.appendChild(makeLink('scrap',appid,meta.scrapUrl||'https://harf-way-game-scrapbook.vercel.app/','切れ端 ↗'));
    }
    if(meta?.sources.has('ways')&&!row.querySelector('a[data-kind="ways"]')){
      row.appendChild(makeLink('ways',appid,waysUrl(appid),'WAYSで再生 ↗'));
    }
    const ways=row.querySelector('a[data-kind="ways"]');
    if(ways){ways.href=waysUrl(appid);ways.textContent='WAYSで再生 ↗';ways.dataset.deeplink='steam-appid'}
    if(row.querySelector('a'))row.querySelector('.nothing')?.remove();
  }
  const repair=()=>document.querySelectorAll('article.card[data-game-id]').forEach(repairCard);

  async function loadSources(){
    try{
      const r=await fetch('/api/sales-catalog',{cache:'no-store'}),j=await r.json();
      if(r.ok&&j?.ok)for(const x of j.rows||[])remember(x.appid,{sources:x.sources,scrapUrl:x.scrapUrl});
    }catch{}
    try{
      const r=await fetch('/api/games-live',{cache:'no-store'}),j=await r.json();
      if(r.ok&&j?.ok)for(const x of j.entries||[])remember(appIdFromStore(x.storeUrl),{ways:true});
    }catch{}
    repair();
    window.HW_SALE_WATCH_SOURCE_HEALTH={
      ways:[...sourceMap.values()].filter(x=>x.sources.has('ways')).length,
      scrap:[...sourceMap.values()].filter(x=>x.sources.has('scrap')).length,
      loaded:true
    };
  }

  const grid=document.querySelector('#grid');
  repair();
  if(grid)new MutationObserver(repair).observe(grid,{childList:true,subtree:true});
  loadSources();
  window.HW_SALE_WATCH_WAYS_DEEPLINK={enabled:true,rewrite:repair,repair,sourceMap};
})();
