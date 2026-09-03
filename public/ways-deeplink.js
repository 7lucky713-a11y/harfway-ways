(()=>{
  const params=new URLSearchParams(location.search);
  const gameId=String(params.get('game')||'').trim().replace(/^ways-/,'');
  const appid=String(params.get('steam')||'').trim();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const appIdFromUrl=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const norm=s=>String(s||'').trim();

  const CAP_KEY='hw_my_harfway_save_cap_v1';
  const SAVED_KEY='hw_my_harfway_saved_steam_v1';
  const SOURCE='ways';
  const IS_PRODUCTION=location.hostname==='harfway-playback.vercel.app';
  const AUTH_ORIGIN=IS_PRODUCTION?'https://harfway-playlist-tv.vercel.app':location.origin;
  const AUTH_PATH=IS_PRODUCTION?'/my-harfway-authorize.html':'/my-harfway-inline-preview-authorize.html';
  const CAP_ENDPOINT='/api/my-harfway/save-capability';
  let pendingAuth=null;

  function readJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}
  }
  function writeJson(key,value){
    try{localStorage.setItem(key,JSON.stringify(value))}catch{}
  }
  function capability(){
    const data=readJson(CAP_KEY,null);
    if(!data||typeof data!=='object'||typeof data.token!=='string')return null;
    if(data.source!==SOURCE||data.sourceOrigin!==location.origin)return null;
    const expires=new Date(data.expiresAt||0).getTime();
    if(!Number.isFinite(expires)||expires<=Date.now()+60_000){
      try{localStorage.removeItem(CAP_KEY)}catch{}
      return null;
    }
    return data;
  }
  function storeCapability(message){
    const data={
      token:String(message.capabilityToken||''),
      expiresAt:String(message.expiresAt||''),
      source:SOURCE,
      sourceOrigin:location.origin
    };
    if(!data.token)return null;
    writeJson(CAP_KEY,data);
    return data;
  }
  function savedSet(){
    const raw=readJson(SAVED_KEY,[]);
    return new Set(Array.isArray(raw)?raw.map(String):[]);
  }
  function markSaved(steamAppid){
    const set=savedSet();set.add(String(steamAppid));writeJson(SAVED_KEY,[...set].slice(-1000));refreshSavedButtons();
  }
  function isSaved(steamAppid){return savedSet().has(String(steamAppid))}
  function clearCapability(){try{localStorage.removeItem(CAP_KEY)}catch{}}

  function ensureStyle(){
    if(document.querySelector('#hwTakeHomeStyle'))return;
    const style=document.createElement('style');
    style.id='hwTakeHomeStyle';
    style.textContent=`
      .hw-take-home{border:1px solid #555a62;background:transparent;color:#fff;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer;transition:.15s;border-radius:0}
      .hw-take-home:hover{border-color:var(--accent,#efff35);color:var(--accent,#efff35)}
      .hw-take-home.is-saved{background:var(--accent,#efff35);border-color:var(--accent,#efff35);color:#111}
      .hw-take-home.is-busy{opacity:.55;pointer-events:none}
      .hw-save-toast{position:fixed;z-index:90;left:50%;bottom:24px;transform:translate(-50%,14px);background:#0d0f10ee;color:#f7f8f2;border:1px solid #efff35;padding:11px 14px;font-size:11px;font-weight:900;opacity:0;pointer-events:none;transition:.18s opacity,.18s transform;box-shadow:0 10px 40px #0008}
      .hw-save-toast.on{opacity:1;transform:translate(-50%,0)}
      @media(max-width:899px){
        .m-meta .hw-take-home{display:inline-block;margin-top:10px;margin-left:6px;border-radius:999px;padding:8px 11px;font-size:10px;background:#050505cc}
        .m-meta .hw-take-home.is-saved{background:var(--accent,#efff35);color:#111}
        .hw-save-toast{bottom:18px;width:min(88vw,360px);text-align:center}
      }
    `;
    document.head.appendChild(style);
  }

  function toast(text){
    let el=document.querySelector('#hwSaveToast');
    if(!el){el=document.createElement('div');el.id='hwSaveToast';el.className='hw-save-toast';document.body.appendChild(el)}
    el.textContent=text;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),1800);
  }

  function setButtonState(button,steamAppid,{busy=false}={}){
    const saved=isSaved(steamAppid);
    button.classList.toggle('is-saved',saved);
    button.classList.toggle('is-busy',busy);
    const label=busy?'保存中…':saved?'♥ 持ち帰り済み':'♡ 持ち帰る';
    if(button.textContent!==label)button.textContent=label;
    button.setAttribute('aria-pressed',saved?'true':'false');
  }

  function refreshSavedButtons(){
    document.querySelectorAll('.hw-take-home[data-steam]').forEach(button=>setButtonState(button,button.dataset.steam));
  }

  async function inlineSave(steamAppid,cap,retryAuth=true){
    const buttons=[...document.querySelectorAll(`.hw-take-home[data-steam="${CSS.escape(String(steamAppid))}"]`)];
    buttons.forEach(b=>setButtonState(b,steamAppid,{busy:true}));
    try{
      const response=await fetch(CAP_ENDPOINT,{
        method:'POST',
        headers:{'content-type':'application/json','authorization':`Bearer ${cap.token}`},
        body:JSON.stringify({action:'save',steamAppid:String(steamAppid)}),
        cache:'no-store'
      });
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data?.ok){
        markSaved(steamAppid);toast('MY HARF-WAYに持ち帰りました ✓');return true;
      }
      if(retryAuth&&[401,403,410].includes(response.status)){
        clearCapability();
        buttons.forEach(b=>setButtonState(b,steamAppid));
        return authorizeAndSave(steamAppid);
      }
      throw new Error(data?.error||'save_failed');
    }catch(error){
      buttons.forEach(b=>setButtonState(b,steamAppid));
      toast('持ち帰れませんでした。もう一度お試しください');
      return false;
    }
  }

  function authorizeUrl(steamAppid){
    const url=new URL(AUTH_PATH,AUTH_ORIGIN);
    url.searchParams.set('source',SOURCE);
    url.searchParams.set('origin',location.origin);
    url.searchParams.set('steam',String(steamAppid));
    return url.toString();
  }

  function authorizeAndSave(steamAppid){
    if(pendingAuth)return pendingAuth.promise;
    let resolvePromise;
    const promise=new Promise(resolve=>{resolvePromise=resolve});
    const popup=window.open(
      authorizeUrl(steamAppid),
      'hwMyHarfwayAuthorize',
      'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes'
    );
    if(!popup){toast('初回設定の小窓を開けませんでした');resolvePromise(false);return promise}

    const pending={steamAppid:String(steamAppid),popup,resolve:resolvePromise,promise,timer:0};
    pendingAuth=pending;
    const buttons=[...document.querySelectorAll(`.hw-take-home[data-steam="${CSS.escape(String(steamAppid))}"]`)];
    buttons.forEach(b=>setButtonState(b,steamAppid,{busy:true}));

    pending.timer=setInterval(()=>{
      if(!pendingAuth||pendingAuth!==pending)return;
      if(popup.closed){
        clearInterval(pending.timer);pendingAuth=null;buttons.forEach(b=>setButtonState(b,steamAppid));resolvePromise(false);
      }
    },350);
    return promise;
  }

  window.addEventListener('message',event=>{
    if(event.origin!==AUTH_ORIGIN)return;
    const message=event.data;
    if(!message||message.type!=='hw-save-capability'||!pendingAuth)return;
    if(String(message.source||'')!==SOURCE||String(message.sourceOrigin||'')!==location.origin)return;
    if(String(message.steamAppid||'')!==String(pendingAuth.steamAppid))return;

    const pending=pendingAuth;pendingAuth=null;clearInterval(pending.timer);
    const cap=storeCapability(message);
    if(message.saved)markSaved(pending.steamAppid);
    if(message.saved)toast('MY HARF-WAYに持ち帰りました ✓');
    try{if(!pending.popup.closed)pending.popup.close()}catch{}
    pending.resolve(Boolean(cap&&message.saved));
  });

  function onTakeHomeClick(event){
    event.preventDefault();event.stopPropagation();
    const button=event.currentTarget;
    const steamAppid=String(button.dataset.steam||'');
    if(!steamAppid||button.classList.contains('is-busy'))return;
    if(isSaved(steamAppid)){toast('すでに持ち帰り済みです ✓');return}
    const cap=capability();
    if(cap)inlineSave(steamAppid,cap);
    else authorizeAndSave(steamAppid);
  }

  function makeButton(steamAppid){
    const button=document.createElement('button');
    button.type='button';button.className='hw-take-home';button.dataset.steam=String(steamAppid);
    button.setAttribute('aria-label','MY HARF-WAYに持ち帰る');
    button.addEventListener('click',onTakeHomeClick);
    setButtonState(button,steamAppid);
    return button;
  }

  function decorateDesktop(){
    const links=document.querySelector('#links');if(!links)return;
    const store=links.querySelector('a.store[href*="store.steampowered.com/app/"]');
    const existing=links.querySelector('.hw-take-home');
    if(!store){existing?.remove();return}
    const steamAppid=appIdFromUrl(store.href);if(!steamAppid){existing?.remove();return}
    if(existing&&existing.dataset.steam===steamAppid){setButtonState(existing,steamAppid);return}
    existing?.remove();store.insertAdjacentElement('afterend',makeButton(steamAppid));
  }

  function decorateMobile(){
    document.querySelectorAll('.m-card').forEach(card=>{
      const meta=card.querySelector('.m-meta');if(!meta)return;
      const store=meta.querySelector('a[href*="store.steampowered.com/app/"]');
      const existing=meta.querySelector('.hw-take-home');
      if(!store){existing?.remove();return}
      const steamAppid=appIdFromUrl(store.href);if(!steamAppid){existing?.remove();return}
      if(existing&&existing.dataset.steam===steamAppid){setButtonState(existing,steamAppid);return}
      existing?.remove();store.insertAdjacentElement('afterend',makeButton(steamAppid));
    });
  }

  function bootTakeHome(){
    ensureStyle();decorateDesktop();decorateMobile();
    let scheduled=false;
    const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorateDesktop();decorateMobile()})};
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
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

  async function bootDeeplink(){
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

  bootTakeHome();
  bootDeeplink();
})();
