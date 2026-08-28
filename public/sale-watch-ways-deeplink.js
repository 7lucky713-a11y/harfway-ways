(()=>{
  const shareToken=new URLSearchParams(location.search).get('_vercel_share')||'';
  const waysIds=new Set();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  const waysUrl=appid=>{
    const url=new URL('/',location.origin);
    url.searchParams.set('steam',appid);
    url.searchParams.set('from','sale-watch');
    if(shareToken)url.searchParams.set('_vercel_share',shareToken);
    return url.pathname+url.search;
  };

  function rewriteWaysLinks(){
    document.querySelectorAll('a[data-kind="ways"][data-game-id]').forEach(link=>{
      const appid=String(link.dataset.gameId||'').trim();
      if(!waysIds.has(appid))return;
      link.href=waysUrl(appid);
      link.textContent='WAYSで再生 ↗';
      link.dataset.deeplink='steam-appid';
    });
  }

  function addWaysQuickButton(){
    const quick=document.querySelector('.quick');
    if(!quick||quick.querySelector('[data-quick="ways"]'))return;
    const btn=document.createElement('button');
    btn.dataset.quick='ways';
    btn.textContent='WAYS';
    btn.addEventListener('click',()=>{
      const source=document.querySelector('#source');
      const filter=document.querySelector('#filter');
      if(source)source.value='ways';
      if(filter)filter.value='all';
      document.querySelectorAll('[data-quick]').forEach(b=>b.classList.toggle('active',b===btn));
      try{render()}catch{}
    });
    const scrap=quick.querySelector('[data-quick="scrap"]');
    if(scrap?.nextSibling)quick.insertBefore(btn,scrap.nextSibling);else quick.appendChild(btn);
  }

  async function applyWaysFlags(){
    for(let i=0;i<60;i++){
      try{
        if(Array.isArray(games)&&games.length){
          let matched=0;
          for(const game of games){
            const appid=String(game?.appid||'');
            if(!waysIds.has(appid))continue;
            game.sources=[...new Set([...(game.sources||[]),'ways'])];
            matched++;
          }
          try{render()}catch{}
          rewriteWaysLinks();
          window.HW_SALE_WATCH_WAYS_INDEX={loaded:true,indexed:waysIds.size,matched};
          return;
        }
      }catch{}
      await wait(100);
    }
  }

  async function loadWaysIndex(){
    try{
      const res=await fetch('/api/ways-index');
      const json=await res.json();
      if(!res.ok||!json?.ok)return;
      for(const id of json.appids||[])waysIds.add(String(id));
      addWaysQuickButton();
      await applyWaysFlags();
    }catch{}
  }

  const grid=document.querySelector('#grid');
  if(grid)new MutationObserver(rewriteWaysLinks).observe(grid,{childList:true,subtree:true});
  addWaysQuickButton();
  if('requestIdleCallback' in window)requestIdleCallback(loadWaysIndex,{timeout:1200});
  else setTimeout(loadWaysIndex,350);
})();
