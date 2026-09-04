(()=>{
  const qs=new URLSearchParams(location.search);
  const share=qs.get('_vercel_share')||'';
  const STEAM_HOST='store.steampowered.com';
  const UTM_SOURCE='harfway';

  function decorateSteam(raw){
    try{
      const url=new URL(String(raw||''),location.href);
      if(url.hostname.toLowerCase()!==STEAM_HOST)return String(raw||'');
      url.searchParams.set('utm_source',UTM_SOURCE);
      return url.href;
    }catch{return String(raw||'')}
  }

  function rewriteSteamLinks(root=document){
    const anchors=[];
    if(root?.matches?.('a[href]'))anchors.push(root);
    root?.querySelectorAll?.('a[href]').forEach(a=>anchors.push(a));
    anchors.forEach(a=>{
      const raw=a.getAttribute('href');
      if(!raw)return;
      const next=decorateSteam(raw);
      if(next&&next!==raw)a.setAttribute('href',next);
    });
  }

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
    rewriteSteamLinks();
  }

  rewrite();
  document.addEventListener('click',event=>{
    const anchor=event.target?.closest?.('a[href]');
    if(anchor)rewriteSteamLinks(anchor);
  },true);

  const grid=document.querySelector('#grid');
  if(grid){
    new MutationObserver(()=>rewrite()).observe(grid,{childList:true,subtree:true});
  }
})();
