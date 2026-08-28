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
  const chunks=(a,n)=>{const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
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

  function addWaysQuickButton(){
    const quick=document.querySelector('.quick');
    if(!quick||quick.querySelector('[data-quick="ways"]'))return;
    const btn=document.createElement('button');
    btn.dataset.quick='ways';
    btn.textContent='WAYS';
    btn.addEventListener('click',()=>{
      const source=document.querySelector('#source'),filter=document.querySelector('#filter');
      if(source)source.value='ways';
      if(filter)filter.value='all';
      document.querySelectorAll('[data-quick]').forEach(b=>b.classList.toggle('active',b===btn));
      try{render()}catch{}
    });
    const scrap=quick.querySelector('[data-quick="scrap"]');
    if(scrap?.nextSibling)quick.insertBefore(btn,scrap.nextSibling);else quick.appendChild(btn);
  }

  async function waitForGames(){
    for(let i=0;i<60;i++){
      try{if(Array.isArray(games)&&games.length)return games}catch{}
      await wait(100);
    }
    return [];
  }

  async function fetchPriceIds(ids,refresh=false){
    if(!ids.length)return {};
    const q=new URLSearchParams();
    q.set('appids',ids.join(','));
    if(refresh)q.set('refresh','1');
    try{
      const r=await fetch('/api/steam-prices-public?'+q.toString(),{cache:'no-store'}),j=await r.json();
      return r.ok&&j?.ok?(j.prices||{}):{};
    }catch{return {}}
  }

  async function primeSourcePrices(){
    const liveGames=await waitForGames();
    if(!liveGames.length)return;
    const priority=[...sourceMap.entries()]
      .filter(([,meta])=>meta.sources.has('scrap')||meta.sources.has('ways'))
      .map(([appid])=>appid)
      .filter(appid=>liveGames.some(g=>String(g?.appid||'')===appid));
    if(!priority.length)return;

    let resolved=0;
    const missing=[];
    for(const group of chunks(priority,8)){
      const prices=await fetchPriceIds(group,false);
      for(const appid of group){
        const game=liveGames.find(g=>String(g?.appid||'')===appid);
        const hit=prices[appid];
        if(game&&hit?.ok){game.price=hit;resolved++}else missing.push(appid);
      }
      try{render()}catch{}
    }

    for(const group of chunks(missing,2)){
      const prices=await fetchPriceIds(group,true);
      for(const appid of group){
        const game=liveGames.find(g=>String(g?.appid||'')===appid);
        const hit=prices[appid];
        if(game&&hit?.ok){game.price=hit;resolved++}
      }
      try{render()}catch{}
    }

    const salePriority=liveGames.filter(g=>g?.price?.ok&&g?.price?.onSale&&(sourceMap.get(String(g.appid))?.sources.has('scrap')||sourceMap.get(String(g.appid))?.sources.has('ways')));
    window.HW_SALE_WATCH_PRIORITY_PRICE={requested:priority.length,resolved,onSale:salePriority.length,completed:true};
    repair();
  }

  async function loadSources(){
    try{
      const r=await fetch('/api/sales-catalog',{cache:'no-store'}),j=await r.json();
      if(r.ok&&j?.ok)for(const x of j.rows||[])remember(x.appid,{sources:x.sources,scrapUrl:x.scrapUrl});
    }catch{}
    try{
      const r=await fetch('/api/games-live',{cache:'no-store'}),j=await r.json();
      if(r.ok&&j?.ok)for(const x of j.entries||[])remember(appIdFromStore(x.storeUrl),{ways:true});
    }catch{}
    addWaysQuickButton();
    repair();
    window.HW_SALE_WATCH_SOURCE_HEALTH={
      ways:[...sourceMap.values()].filter(x=>x.sources.has('ways')).length,
      scrap:[...sourceMap.values()].filter(x=>x.sources.has('scrap')).length,
      loaded:true
    };
    primeSourcePrices();
  }

  const grid=document.querySelector('#grid');
  addWaysQuickButton();
  repair();
  if(grid)new MutationObserver(repair).observe(grid,{childList:true,subtree:true});
  loadSources();
  window.HW_SALE_WATCH_WAYS_DEEPLINK={enabled:true,rewrite:repair,repair,sourceMap,primeSourcePrices};
})();
