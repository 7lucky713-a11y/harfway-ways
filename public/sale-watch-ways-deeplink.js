(()=>{
  const qs=new URLSearchParams(location.search);
  const share=qs.get('_vercel_share')||'';

  function rewrite(){
    document.querySelectorAll('a[data-kind="ways"][data-game-id]').forEach(a=>{
      const appid=String(a.dataset.gameId||'').trim();
      if(!/^\d+$/.test(appid))return;

      const url=new URL('/',location.origin);
      url.searchParams.set('steam',appid);
      url.searchParams.set('from','sale-watch');
      if(share)url.searchParams.set('_vercel_share',share);
      const nextHref=url.pathname+url.search;

      if(a.getAttribute('href')!==nextHref)a.setAttribute('href',nextHref);
      if(a.textContent!=='実際に遊んでいるところを見る ↗')a.textContent='実際に遊んでいるところを見る ↗';
      a.dataset.deeplink='steam-appid';
    });
  }

  rewrite();
  const grid=document.querySelector('#grid');
  if(grid){
    new MutationObserver(()=>rewrite()).observe(grid,{childList:true});
  }
})();
