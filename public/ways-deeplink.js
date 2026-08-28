(()=>{
  const params=new URLSearchParams(location.search);
  const requested=String(params.get('steam')||'').trim();
  if(!/^\d+$/.test(requested))return;

  const state={requested,matched:false,index:-1,title:'',mode:innerWidth>=900?'desktop':'mobile'};
  window.HW_WAYS_DEEPLINK=state;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const appIdFromStore=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const sameTitle=(a,b)=>String(a||'').trim()===String(b||'').trim();

  async function getTarget(){
    try{
      const res=await fetch('/api/games-live',{cache:'no-store'});
      const json=await res.json();
      const entries=Array.isArray(json?.entries)?json.entries:[];
      const index=entries.findIndex(x=>appIdFromStore(x?.storeUrl)===requested);
      if(index<0)return null;
      return {index,entry:entries[index],count:entries.length};
    }catch{return null}
  }

  function desktopCard(index,title){
    const byTitle=[...document.querySelectorAll('.game')].find(card=>sameTitle(card.querySelector('.gtitle')?.textContent,title));
    return byTitle||document.querySelector(`.game[data-i="${index}"]`);
  }

  async function openDesktop(index,title){
    for(let turn=0;turn<12;turn++){
      const card=desktopCard(index,title);
      if(card){
        card.click();
        card.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
        return true;
      }
      const more=document.querySelector('#shelfMore');
      if(more&&!more.disabled)more.click();
      await wait(180);
    }
    return false;
  }

  function mobileCard(feed,index,title){
    const byTitle=[...feed.querySelectorAll('.m-card')].find(card=>sameTitle(card.querySelector('.m-meta h2')?.textContent,title));
    return byTitle||feed.querySelector(`.m-card[data-i="${index}"]`);
  }

  async function openMobile(index,title){
    const feed=document.querySelector('#mfeed');
    if(!feed)return false;
    for(let turn=0;turn<40;turn++){
      const card=mobileCard(feed,index,title);
      if(card){
        card.scrollIntoView({behavior:'auto',block:'start'});
        await wait(180);
        const video=card.querySelector('video');
        if(video){
          const src=video.dataset?.src;
          if(src&&!video.getAttribute('src'))video.src=src;
          video.muted=true;
          video.play().catch(()=>{});
        }
        return true;
      }
      const cards=[...feed.querySelectorAll('.m-card')];
      const last=cards.at(-1);
      if(last)last.scrollIntoView({behavior:'auto',block:'start'});
      else await wait(120);
      await wait(160);
    }
    return false;
  }

  async function boot(){
    const target=await getTarget();
    if(!target){state.reason='not_found';return}
    const title=String(target.entry?.title||'');
    state.index=target.index;
    state.title=title;
    state.matched=true;
    let ok=false;
    if(innerWidth>=900){
      for(let i=0;i<25&&!document.querySelector('.game');i++)await wait(120);
      ok=await openDesktop(target.index,title);
    }else{
      for(let i=0;i<25&&!document.querySelector('.m-card');i++)await wait(120);
      ok=await openMobile(target.index,title);
    }
    state.opened=ok;
    state.openedAt=ok?new Date().toISOString():null;
  }

  boot();
})();
