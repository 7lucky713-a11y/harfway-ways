(()=>{
  const CAP_KEY='hw_my_harfway_save_cap_v1';
  const SAVED_KEY='hw_my_harfway_saved_steam_v1';
  const CAP_ENDPOINT='/api/my-harfway/save-capability';
  const CORE='/api/core/games?limit=500';
  const AUTH_ORIGIN='https://harfway-playlist-tv.vercel.app';
  const AUTH_PATH='/my-harfway-authorize.html';
  const SOURCE='ways'; // legacy capability name = playback origin
  const CONTEXT=location.pathname.startsWith('/scrapbook')?'scraps':location.pathname.startsWith('/sales')?'sale':'';
  const IS_PRODUCTION=location.hostname==='harfway-playback.vercel.app';
  const coreAppIds=new Set();
  let coreReady=false,pendingAuth=null,scanQueued=false;

  if(!CONTEXT)return;

  const appIdFromUrl=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';
  const steamFromGame=g=>appIdFromUrl(g?.storeUrl)||String((g?.refs||[]).find(r=>r?.service==='steam')?.externalId||'');
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}};
  const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};

  function savedSet(){
    const raw=readJson(SAVED_KEY,[]);
    return new Set(Array.isArray(raw)?raw.map(String):[]);
  }
  function isSaved(appid){return savedSet().has(String(appid))}
  function markSaved(appid){const s=savedSet();s.add(String(appid));writeJson(SAVED_KEY,[...s].slice(-1000));refresh()}
  function clearCapability(){try{localStorage.removeItem(CAP_KEY)}catch{}}
  function capability(){
    const data=readJson(CAP_KEY,null);
    if(!data||typeof data!=='object'||typeof data.token!=='string')return null;
    if(data.source!==SOURCE||data.sourceOrigin!==location.origin)return null;
    const expires=new Date(data.expiresAt||0).getTime();
    if(!Number.isFinite(expires)||expires<=Date.now()+60_000){clearCapability();return null}
    return data;
  }
  function storeCapability(message){
    const data={token:String(message.capabilityToken||''),expiresAt:String(message.expiresAt||''),source:SOURCE,sourceOrigin:location.origin};
    if(!data.token)return null;
    writeJson(CAP_KEY,data);return data;
  }

  function ensureStyle(){
    if(document.querySelector('#hwPlaybackTakeHomeStyle'))return;
    const style=document.createElement('style');
    style.id='hwPlaybackTakeHomeStyle';
    style.textContent=`
      .hw-playback-take-home{appearance:none;border:1px solid #4a5058;background:#111418;color:#f4f5ef;min-height:31px;padding:6px 10px;border-radius:7px;font:900 9px/1.2 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;cursor:pointer;transition:.15s border-color,.15s color,.15s background,.15s transform}
      .hw-playback-take-home:hover{border-color:#eaff35;color:#eaff35;transform:translateY(-1px)}
      .hw-playback-take-home.is-saved{background:#eaff35;border-color:#eaff35;color:#090a0c}
      .hw-playback-take-home.is-busy{opacity:.55;pointer-events:none}
      .hw-save-toast{position:fixed;z-index:9999;left:50%;bottom:24px;transform:translate(-50%,12px);opacity:0;pointer-events:none;background:#0b0d0fee;border:1px solid #eaff35;color:#f4f5ef;padding:11px 14px;font:900 11px/1.4 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;box-shadow:0 12px 40px #0008;transition:.18s opacity,.18s transform}
      .hw-save-toast.on{opacity:1;transform:translate(-50%,0)}
      #modalLinks .hw-playback-take-home{margin-left:6px}
    `;
    document.head.appendChild(style);
  }

  function toast(text){
    let el=document.querySelector('#hwPlaybackSaveToast');
    if(!el){el=document.createElement('div');el.id='hwPlaybackSaveToast';el.className='hw-save-toast';document.body.appendChild(el)}
    el.textContent=text;el.classList.add('on');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('on'),1800);
  }

  function setState(button,appid,{busy=false}={}){
    const saved=isSaved(appid);
    button.classList.toggle('is-saved',saved);button.classList.toggle('is-busy',busy);
    button.textContent=busy?'保存中…':saved?'♥ 持ち帰り済み':'♡ 持ち帰る';
    button.setAttribute('aria-pressed',saved?'true':'false');
  }
  function refresh(){document.querySelectorAll('.hw-playback-take-home[data-steam]').forEach(b=>setState(b,b.dataset.steam))}

  function makeButton(appid){
    const b=document.createElement('button');
    b.type='button';b.className='hw-playback-take-home';b.dataset.steam=String(appid);b.dataset.hwTakeHome=CONTEXT;
    b.setAttribute('aria-label','MY HARF-WAYに持ち帰る');setState(b,appid);return b;
  }

  function upsert(container){
    if(!coreReady||!container)return;
    const store=[...container.querySelectorAll('a[href]')].find(a=>appIdFromUrl(a.href));
    const appid=appIdFromUrl(store?.href);
    let b=container.querySelector('.hw-playback-take-home');
    if(!appid||!coreAppIds.has(appid)){b?.remove();return}
    if(b&&b.dataset.steam===appid){setState(b,appid);return}
    b?.remove();b=makeButton(appid);store.insertAdjacentElement('afterend',b);
  }

  function scan(){
    if(!coreReady)return;
    if(CONTEXT==='sale')document.querySelectorAll('.card .links').forEach(upsert);
    else{
      document.querySelectorAll('.card .links').forEach(upsert);
      upsert(document.querySelector('#modalLinks'));
    }
  }
  function scheduleScan(){if(scanQueued)return;scanQueued=true;requestAnimationFrame(()=>{scanQueued=false;scan()})}

  function authUrl(appid){
    const u=new URL(AUTH_PATH,AUTH_ORIGIN);
    u.searchParams.set('source',SOURCE);
    u.searchParams.set('context',CONTEXT);
    u.searchParams.set('origin',location.origin);
    u.searchParams.set('steam',String(appid));
    return u.toString();
  }

  async function inlineSave(appid,cap,retry=true){
    const buttons=[...document.querySelectorAll(`.hw-playback-take-home[data-steam="${CSS.escape(String(appid))}"]`)];
    buttons.forEach(b=>setState(b,appid,{busy:true}));
    try{
      const r=await fetch(CAP_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cap.token}`},body:JSON.stringify({action:'save',steamAppid:String(appid),contextSource:CONTEXT}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(r.ok&&data?.ok){markSaved(appid);toast('MY HARF-WAYに持ち帰りました ✓');return true}
      if(retry&&[401,403,410].includes(r.status)){clearCapability();buttons.forEach(b=>setState(b,appid));return authorizeAndSave(appid)}
      throw new Error(data?.error||'save_failed');
    }catch{
      buttons.forEach(b=>setState(b,appid));toast('持ち帰れませんでした。もう一度お試しください');return false;
    }
  }

  function authorizeAndSave(appid){
    if(!IS_PRODUCTION){markSaved(appid);toast('Preview：持ち帰り動作を確認しました ✓');return Promise.resolve(true)}
    if(pendingAuth)return pendingAuth.promise;
    let resolvePromise;const promise=new Promise(resolve=>{resolvePromise=resolve});
    const popup=window.open(authUrl(appid),'hwMyHarfwayAuthorize','popup=yes,width=520,height=720,resizable=yes,scrollbars=yes');
    if(!popup){toast('初回設定の小窓を開けませんでした');resolvePromise(false);return promise}
    const pending={appid:String(appid),popup,promise,resolve:resolvePromise,timer:0};pendingAuth=pending;
    document.querySelectorAll(`.hw-playback-take-home[data-steam="${CSS.escape(String(appid))}"]`).forEach(b=>setState(b,appid,{busy:true}));
    pending.timer=setInterval(()=>{
      if(pendingAuth!==pending)return;
      if(popup.closed){clearInterval(pending.timer);pendingAuth=null;refresh();resolvePromise(false)}
    },350);
    return promise;
  }

  window.addEventListener('message',event=>{
    if(event.origin!==AUTH_ORIGIN||!pendingAuth)return;
    const m=event.data;
    if(!m||m.type!=='hw-save-capability'||String(m.source||'')!==SOURCE||String(m.sourceOrigin||'')!==location.origin)return;
    if(m.contextSource&&String(m.contextSource)!==CONTEXT)return;
    if(String(m.steamAppid||'')!==pendingAuth.appid)return;
    const pending=pendingAuth;pendingAuth=null;clearInterval(pending.timer);
    const cap=storeCapability(m);if(m.saved)markSaved(pending.appid);if(m.saved)toast('MY HARF-WAYに持ち帰りました ✓');
    try{if(!pending.popup.closed)pending.popup.close()}catch{}
    pending.resolve(Boolean(cap&&m.saved));
  });

  document.addEventListener('click',event=>{
    const b=event.target.closest('.hw-playback-take-home');if(!b)return;
    event.preventDefault();event.stopPropagation();
    const appid=String(b.dataset.steam||'');if(!appid||b.classList.contains('is-busy'))return;
    if(isSaved(appid)){toast('すでに持ち帰り済みです ✓');return}
    if(!IS_PRODUCTION){authorizeAndSave(appid);return}
    const cap=capability();if(cap)inlineSave(appid,cap);else authorizeAndSave(appid);
  });

  async function boot(){
    ensureStyle();
    try{
      const r=await fetch(CORE,{cache:'no-store'}),j=await r.json();
      for(const g of j?.games||[]){const appid=steamFromGame(g);if(/^\d+$/.test(appid))coreAppIds.add(appid)}
      coreReady=true;scan();
      const root=CONTEXT==='sale'?document.querySelector('#grid'):document.body;
      if(root)new MutationObserver(scheduleScan).observe(root,{childList:true,subtree:true,attributes:CONTEXT==='scraps',attributeFilter:CONTEXT==='scraps'?['href']:undefined});
    }catch{coreReady=false}
  }
  boot();
})();
