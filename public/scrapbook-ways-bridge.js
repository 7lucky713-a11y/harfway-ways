(()=>{
  const CORE='/api/core/games?limit=500';
  const share=new URLSearchParams(location.search).get('_vercel_share')||'';
  const waysAppIds=new Set();
  let ready=false;

  const appIdFromUrl=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const isWaysGame=g=>String(g?.sourceOfTruth||'')==='ways-editor'||String(g?.id||'').startsWith('game-ways-')||Array.isArray(g?.refs)&&g.refs.some(r=>String(r?.service||'')==='ways');

  function hrefFor(appid){
    const url=new URL('/',location.origin);
    url.searchParams.set('steam',appid);
    url.searchParams.set('from','scraps');
    if(share)url.searchParams.set('_vercel_share',share);
    return url.pathname+url.search;
  }

  function ensureStyle(){
    if(document.querySelector('#scrapbookWaysBridgeStyle'))return;
    const style=document.createElement('style');
    style.id='scrapbookWaysBridgeStyle';
    style.textContent=`.ways-play-link{font-weight:800!important;color:var(--red)!important;text-decoration:none}.ways-play-link:before{content:'▶';display:inline-block;margin-right:6px;font-size:.85em}`;
    document.head.appendChild(style);
  }

  function upsert(container){
    if(!ready||!container)return;
    const store=[...container.querySelectorAll('a[href]')].find(a=>appIdFromUrl(a.href));
    const appid=appIdFromUrl(store?.href);
    const existing=container.querySelector('.ways-play-link');
    if(!appid||!waysAppIds.has(appid)){
      existing?.remove();
      return;
    }
    if(existing){
      existing.href=hrefFor(appid);
      return;
    }
    const a=document.createElement('a');
    a.className='ways-play-link';
    a.href=hrefFor(appid);
    a.target='_blank';
    a.rel='noopener';
    a.dataset.crossToWays='scraps';
    a.dataset.steamAppid=appid;
    a.textContent='実際に遊んでいるところを見る ↗';
    container.appendChild(a);
  }

  function rewrite(){
    document.querySelectorAll('.card .links').forEach(upsert);
    upsert(document.querySelector('#modalLinks'));
  }

  async function load(){
    ensureStyle();
    try{
      const r=await fetch(CORE,{cache:'no-store'});
      const j=await r.json();
      for(const g of j?.games||[]){
        if(!isWaysGame(g))continue;
        const appid=appIdFromUrl(g?.storeUrl)||String((g?.refs||[]).find(x=>x?.service==='steam')?.externalId||'');
        if(/^\d+$/.test(appid))waysAppIds.add(appid);
      }
      ready=true;
      rewrite();
      const grid=document.querySelector('#grid');
      if(grid)new MutationObserver(()=>rewrite()).observe(grid,{childList:true,subtree:true});
      const modal=document.querySelector('#modalLinks');
      if(modal)new MutationObserver(()=>upsert(modal)).observe(modal,{childList:true,subtree:true});
    }catch{
      ready=false;
    }
  }

  load();
})();
