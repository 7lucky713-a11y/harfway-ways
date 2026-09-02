(()=>{
  const params=new URLSearchParams(location.search);
  const gameId=String(params.get('game')||'').trim().replace(/^ways-/,'');
  const appid=String(params.get('steam')||'').trim();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const appIdFromUrl=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const norm=s=>String(s||'').trim();

  const BRIDGE_PROD='https://harfway-playlist-tv.vercel.app/my-harfway-save.html';
  const BRIDGE_PREVIEW='https://harfway-playlist-tv-git-preview-my-harfway-save-fe6455-harf-way.vercel.app/my-harfway-save.html';

  function bridgeBase(){
    return location.hostname==='harfway-playback.vercel.app' ? BRIDGE_PROD : BRIDGE_PREVIEW;
  }

  function bridgeUrl(storeUrl){
    const steam=appIdFromUrl(storeUrl);
    if(!steam)return '';
    const u=new URL(bridgeBase());
    u.searchParams.set('steam',steam);
    u.searchParams.set('source','ways');
    u.searchParams.set('return',location.href);
    return u.toString();
  }

  function ensureStyle(){
    if(document.querySelector('#waysMyHarfwayStyle'))return;
    const style=document.createElement('style');
    style.id='waysMyHarfwayStyle';
    style.textContent=`
      .ways-my-save{display:inline-flex!important;align-items:center;justify-content:center;gap:5px;border:1px solid #efff35!important;background:#111214!important;color:#efff35!important;text-decoration:none!important;font-weight:950!important;white-space:nowrap}
      .ways-my-save:hover{background:#efff35!important;color:#111!important}
      @media(min-width:900px){#links .ways-my-save{padding:9px 11px;font-size:10px}}
      @media(max-width:899px){.m-meta .ways-my-save{margin-left:6px;background:#080909dd!important;color:#efff35!important;border:1px solid #efff35!important;border-radius:999px!important;padding:8px 11px!important;font-size:10px!important}.m-meta .ways-my-save:hover{background:#efff35!important;color:#111!important}}
    `;
    document.head.appendChild(style);
  }

  function syncDesktopSave(){
    const links=document.querySelector('#links');
    if(!links)return;
    const store=links.querySelector('a.store');
    const href=bridgeUrl(store?.href||'');
    let save=links.querySelector('.ways-my-save');
    if(!href){save?.remove();return}
    if(!save){
      save=document.createElement('a');
      save.className='ways-my-save';
      save.textContent='♡ 持ち帰る';
      links.appendChild(save);
    }
    if(save.href!==href)save.href=href;
    save.removeAttribute('target');
    save.removeAttribute('rel');
    save.setAttribute('aria-label','MY HARF-WAYへ持ち帰る');
  }

  function syncMobileSave(){
    document.querySelectorAll('.m-card').forEach(card=>{
      const meta=card.querySelector('.m-meta');
      if(!meta)return;
      const store=[...meta.querySelectorAll('a')].find(a=>appIdFromUrl(a.href));
      const href=bridgeUrl(store?.href||'');
      let save=meta.querySelector('.ways-my-save');
      if(!href){save?.remove();return}
      if(!save){
        save=document.createElement('a');
        save.className='ways-my-save';
        save.textContent='♡ 持ち帰る';
        meta.appendChild(save);
      }
      if(save.href!==href)save.href=href;
      save.removeAttribute('target');
      save.removeAttribute('rel');
      save.setAttribute('aria-label','MY HARF-WAYへ持ち帰る');
    });
  }

  function installSaveBridge(){
    ensureStyle();
    syncDesktopSave();
    syncMobileSave();
    const desktop=document.querySelector('#links');
    if(desktop){
      const observer=new MutationObserver(syncDesktopSave);
      observer.observe(desktop,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
    }
    const mobile=document.querySelector('#mfeed');
    if(mobile){
      const observer=new MutationObserver(syncMobileSave);
      observer.observe(mobile,{childList:true,subtree:true});
    }
  }

  async function targetTitle(){
    try{
      const r=await fetch('/api/games-live',{cache:'no-store'});
      const j=await r.json();
      const entries=j?.entries||[];
      const hit=gameId
        ? entries.find(x=>norm(x?.id)===gameId)
        : entries.find(x=>appIdFromUrl(x?.storeUrl)===appid);
      return norm(hit?.title);
    }catch{return ''}
  }

  async function openDesktop(title){
    for(let page=0;page<12;page++){
      const cards=[...document.querySelectorAll('.game')];
      const hit=cards.find(card=>norm(card.querySelector('.gtitle')?.textContent)===title);
      if(hit){
        hit.click();
        hit.scrollIntoView({behavior:'smooth',block:'nearest'});
        const v=document.querySelector('.video-frame video');
        if(v)setTimeout(()=>v.play().catch(()=>{}),60);
        return true
      }
      const more=document.querySelector('#shelfMore');
      if(!more)return false;
      more.click();
      await wait(180);
    }
    return false;
  }

  async function openMobile(title){
    const feed=document.querySelector('#mfeed');
    if(!feed)return false;
    for(let turn=0;turn<40;turn++){
      const cards=[...feed.querySelectorAll('.m-card')];
      const hit=cards.find(card=>norm(card.querySelector('.m-meta h2')?.textContent)===title);
      if(hit){
        hit.scrollIntoView({behavior:'auto',block:'start'});
        await wait(180);
        const v=hit.querySelector('video');
        if(v){const src=v.dataset?.src;if(src&&!v.getAttribute('src'))v.src=src;v.play().catch(()=>{})}
        return true
      }
      const last=cards.at(-1);
      if(last)last.scrollIntoView({behavior:'auto',block:'start'});
      await wait(180);
    }
    return false;
  }

  async function openDeepLink(){
    if(!gameId&&!/^\d+$/.test(appid))return;
    const title=await targetTitle();
    if(!title)return;
    if(innerWidth>=900){
      for(let i=0;i<25&&!document.querySelector('.game');i++)await wait(120);
      await openDesktop(title);
    }else{
      for(let i=0;i<25&&!document.querySelector('.m-card');i++)await wait(120);
      await openMobile(title);
    }
  }

  async function boot(){
    for(let i=0;i<30&&!document.querySelector('#links')&&!document.querySelector('#mfeed');i++)await wait(100);
    installSaveBridge();
    await openDeepLink();
  }
  boot();
})();
