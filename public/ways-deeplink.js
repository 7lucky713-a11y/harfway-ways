(()=>{
  const params=new URLSearchParams(location.search);
  const gameId=String(params.get('game')||'').trim().replace(/^ways-/,'');
  const appid=String(params.get('steam')||'').trim();
  if(!gameId&&!/^\d+$/.test(appid))return;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const appIdFromUrl=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const norm=s=>String(s||'').trim();

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

  async function boot(){
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
  boot();
})();
