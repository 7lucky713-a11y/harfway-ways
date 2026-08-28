(()=>{
  const shareToken=new URLSearchParams(location.search).get('_vercel_share')||'';
  const rewrite=()=>{
    document.querySelectorAll('a[data-kind="ways"][data-game-id]').forEach(link=>{
      const appid=String(link.dataset.gameId||'').trim();
      if(!/^\d+$/.test(appid))return;
      const url=new URL('/',location.origin);
      url.searchParams.set('steam',appid);
      url.searchParams.set('from','sale-watch');
      if(shareToken)url.searchParams.set('_vercel_share',shareToken);
      link.href=url.pathname+url.search;
      link.textContent='WAYSで再生 ↗';
      link.dataset.deeplink='steam-appid';
    });
  };
  const grid=document.querySelector('#grid');
  rewrite();
  if(grid)new MutationObserver(rewrite).observe(grid,{childList:true,subtree:true});
  window.HW_SALE_WATCH_WAYS_DEEPLINK={enabled:true,rewrite};
})();
