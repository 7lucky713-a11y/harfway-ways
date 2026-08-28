(()=>{
  const params=new URLSearchParams(location.search);
  const requested=String(params.get('steam')||'').trim();
  if(!/^\d+$/.test(requested))return;

  const state={requested,matched:false,index:-1,title:'',mode:innerWidth>=900?'desktop':'mobile'};
  window.HW_WAYS_DEEPLINK=state;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const appIdFromStore=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';

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

  async function openDesktop(index){
    for(let turn=0;turn<12;turn++){
      const card=document.querySelector(`.game[data-i="${index}"]`);
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

  async function openMobile(index){
    const feed=document.querySelector('#mfeed');
    if(!feed)return false;
    for(let turn=0;turn<40;turn++){
      const card=feed.querySelector(`.m-card[data-i="${index}"]`);
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
      const cards=[...feed.querySelectorAll('.m-card[data-i]')];
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
    state.index=target.index;
    state.title=String(target.entry?.title||'');
    state.matched=true;
    let ok=false;
    if(innerWidth>=900){
      for(let i=0;i<25&&!document.querySelector('.game');i++)await wait(120);
      ok=await openDesktop(target.index);
    }else{
      for(let i=0;i<25&&!document.querySelector('.m-card');i++)await wait(120);
      ok=await openMobile(target.index);
    }
    state.opened=ok;
    state.openedAt=ok?new Date().toISOString():null;
  }

  boot();
})();
