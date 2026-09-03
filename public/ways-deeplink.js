(()=>{
  const params=new URLSearchParams(location.search);
  const gameId=String(params.get('game')||'').trim().replace(/^ways-/,'');
  const appid=String(params.get('steam')||'').trim();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const norm=s=>String(s||'').trim();
  const appIdFromUrl=url=>String(url||'').match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1]||'';

  const CAP_KEY='hw_my_harfway_save_cap_v1';
  const SAVED_KEY='hw_my_harfway_saved_v2';
  const OLD_SAVED_KEY='hw_my_harfway_saved_steam_v1';
  const SOURCE='ways';
  const CONTEXT='ways';
  const IS_PRODUCTION=location.hostname==='harfway-playback.vercel.app';
  const AUTH_ORIGIN=IS_PRODUCTION?'https://harfway-playlist-tv.vercel.app':location.origin;
  const AUTH_PATH=IS_PRODUCTION?'/my-harfway-authorize-v2.html':'/my-harfway-inline-preview-authorize.html';
  const CAP_ENDPOINT='/api/my-harfway/save-capability';
  const LIVE='/api/games-live';
  let pendingAuth=null;
  let liveEntries=[];
  let liveById=new Map();

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  function savedSet(){const raw=readJson(SAVED_KEY,[]);return new Set(Array.isArray(raw)?raw.map(String):[])}
  function oldSavedSet(){const raw=readJson(OLD_SAVED_KEY,[]);return new Set(Array.isArray(raw)?raw.map(String):[])}
  function isSaved(identity){return savedSet().has(identity.key)||(identity.steamAppid&&oldSavedSet().has(String(identity.steamAppid)))}
  function markSaved(identity,serverGameId=''){
    const s=savedSet();s.add(String(identity.key));if(serverGameId)s.add(String(serverGameId));writeJson(SAVED_KEY,[...s].slice(-2500));
    if(identity.steamAppid){const old=oldSavedSet();old.add(String(identity.steamAppid));writeJson(OLD_SAVED_KEY,[...old].slice(-1000))}
    refreshSavedButtons();
  }
  function clearCapability(){try{localStorage.removeItem(CAP_KEY)}catch{}}
  function capability(){const data=readJson(CAP_KEY,null);if(!data||typeof data!=='object'||typeof data.token!=='string')return null;if(data.source!==SOURCE||data.sourceOrigin!==location.origin)return null;const expires=new Date(data.expiresAt||0).getTime();if(!Number.isFinite(expires)||expires<=Date.now()+60_000){clearCapability();return null}return data}
  function storeCapability(message){const data={token:String(message.capabilityToken||''),expiresAt:String(message.expiresAt||''),source:SOURCE,sourceOrigin:location.origin};if(!data.token)return null;writeJson(CAP_KEY,data);return data}

  function resolveEntry(raw){
    if(!raw||typeof raw!=='object')return null;
    const id=String(raw.id||'').trim();
    return (id&&liveById.get(id))||raw;
  }
  function identityForEntry(raw){
    const entry=resolveEntry(raw);
    if(!entry?.id||!entry?.title)return null;
    const coreId=String(entry.coreId||'').trim();
    const steam=appIdFromUrl(entry.storeUrl||'');
    return {
      key:coreId||`ways:${entry.id}`,
      gameId:coreId,
      steamAppid:String(steam||''),
      sourceItemId:String(entry.id),
      title:String(entry.title||''),
      storeUrl:String(entry.storeUrl||''),
      canonical:Boolean(coreId)
    };
  }
  function fallbackEntry(title,storeUrl=''){
    const t=norm(title);if(!t)return null;
    const steam=appIdFromUrl(storeUrl);
    if(steam){const hit=liveEntries.find(e=>appIdFromUrl(e?.storeUrl)===steam);if(hit)return hit}
    const hits=liveEntries.filter(e=>norm(e?.title)===t);return hits.length===1?hits[0]:null;
  }
  function desktopEntry(){
    try{
      if(typeof filtered!=='undefined'&&typeof selected!=='undefined'&&Array.isArray(filtered)){
        const hit=filtered[Number(selected)];if(hit)return resolveEntry(hit);
      }
    }catch{}
    const title=document.querySelector('.side h2')?.textContent||'';
    const store=document.querySelector('#links a.store[href],#links a[href]')?.href||'';
    return fallbackEntry(title,store);
  }
  function mobileEntry(card){
    try{
      const i=Number(card?.dataset?.i);
      if(Number.isInteger(i)&&i>=0){
        const list=(typeof activeTag!=='undefined'&&activeTag&&typeof filtered!=='undefined'&&Array.isArray(filtered))?filtered:((typeof items!=='undefined'&&Array.isArray(items))?items:[]);
        const hit=list[i];if(hit)return resolveEntry(hit);
      }
    }catch{}
    const title=card?.querySelector('.m-meta h2')?.textContent||'';
    const store=card?.querySelector('.m-meta a[href]')?.href||'';
    return fallbackEntry(title,store);
  }

  function ensureStyle(){
    if(document.querySelector('#hwTakeHomeStyle'))return;
    const style=document.createElement('style');style.id='hwTakeHomeStyle';
    style.textContent=`.hw-take-home{position:relative;z-index:6;pointer-events:auto;touch-action:manipulation;border:1px solid #555a62;background:transparent;color:#fff;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer;transition:.15s;border-radius:0}.hw-take-home:hover{border-color:var(--accent,#efff35);color:var(--accent,#efff35)}.hw-take-home.is-saved{background:var(--accent,#efff35);border-color:var(--accent,#efff35);color:#111}.hw-take-home.is-busy{opacity:.55;pointer-events:none}.hw-save-toast{position:fixed;z-index:90;left:50%;bottom:24px;transform:translate(-50%,14px);background:#0d0f10ee;color:#f7f8f2;border:1px solid #efff35;padding:11px 14px;font-size:11px;font-weight:900;opacity:0;pointer-events:none;transition:.18s opacity,.18s transform;box-shadow:0 10px 40px #0008}.hw-save-toast.on{opacity:1;transform:translate(-50%,0)}@media(max-width:899px){.m-meta .hw-take-home{display:inline-block;margin-top:10px;margin-left:6px;border-radius:999px;padding:8px 11px;font-size:10px;background:#050505cc}.m-meta .hw-take-home.is-saved{background:var(--accent,#efff35);color:#111}.hw-save-toast{bottom:18px;width:min(88vw,360px);text-align:center}}`;
    document.head.appendChild(style);
  }
  function toast(text){let el=document.querySelector('#hwSaveToast');if(!el){el=document.createElement('div');el.id='hwSaveToast';el.className='hw-save-toast';document.body.appendChild(el)}el.textContent=text;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),1800)}
  function identityFromButton(button){return {key:String(button.dataset.key||''),gameId:String(button.dataset.game||''),steamAppid:String(button.dataset.steam||''),sourceItemId:String(button.dataset.sourceItem||''),title:String(button.dataset.title||''),storeUrl:String(button.dataset.store||''),canonical:button.dataset.canonical==='1'}}
  function setButtonState(button,identity,{busy=false}={}){const saved=isSaved(identity);button.classList.toggle('is-saved',saved);button.classList.toggle('is-busy',busy);button.textContent=busy?'保存中…':saved?'♥ 持ち帰り済み':'♡ 持ち帰る';button.setAttribute('aria-pressed',saved?'true':'false')}
  function refreshSavedButtons(){document.querySelectorAll('.hw-take-home[data-key]').forEach(button=>setButtonState(button,identityFromButton(button)))}
  function makeButton(identity){const button=document.createElement('button');button.type='button';button.className='hw-take-home';button.dataset.key=identity.key;button.dataset.game=identity.gameId;button.dataset.steam=identity.steamAppid;button.dataset.sourceItem=identity.sourceItemId;button.dataset.title=identity.title;button.dataset.store=identity.storeUrl;button.dataset.canonical=identity.canonical?'1':'0';button.setAttribute('aria-label','MY HARF-WAYに持ち帰る');setButtonState(button,identity);return button}
  function removeButtonAndOpenLink(existing){if(!existing)return;const next=existing.nextElementSibling;if(next?.classList?.contains('hw-my-harfway-open'))next.remove();existing.remove()}

  function decorateDesktop(){
    const links=document.querySelector('#links');if(!links)return;
    const identity=identityForEntry(desktopEntry());const existing=links.querySelector('.hw-take-home');
    if(!identity){removeButtonAndOpenLink(existing);return}
    if(existing&&existing.dataset.key===identity.key){setButtonState(existing,identity);return}
    removeButtonAndOpenLink(existing);
    const b=makeButton(identity);const store=links.querySelector('a.store[href]');if(store)store.insertAdjacentElement('afterend',b);else links.appendChild(b);
  }
  function decorateMobile(){
    document.querySelectorAll('.m-card').forEach(card=>{
      const meta=card.querySelector('.m-meta');if(!meta)return;
      const identity=identityForEntry(mobileEntry(card));const existing=meta.querySelector('.hw-take-home');
      if(!identity){removeButtonAndOpenLink(existing);return}
      if(existing&&existing.dataset.key===identity.key){setButtonState(existing,identity);return}
      removeButtonAndOpenLink(existing);
      const b=makeButton(identity);const store=meta.querySelector('a[href]');if(store)store.insertAdjacentElement('afterend',b);else meta.appendChild(b);
    });
  }
  function refreshDecorations(){decorateDesktop();decorateMobile()}

  function authUrl(identity){const url=new URL(AUTH_PATH,AUTH_ORIGIN);url.searchParams.set('source',SOURCE);url.searchParams.set('context',CONTEXT);url.searchParams.set('origin',location.origin);if(identity.gameId)url.searchParams.set('game',identity.gameId);if(identity.steamAppid)url.searchParams.set('steam',identity.steamAppid);url.searchParams.set('source_item',identity.sourceItemId);url.searchParams.set('title',identity.title);if(identity.storeUrl)url.searchParams.set('store',identity.storeUrl);return url.toString()}
  async function inlineSave(identity,cap,retryAuth=true){
    const buttons=[...document.querySelectorAll(`.hw-take-home[data-key="${CSS.escape(identity.key)}"]`)];buttons.forEach(b=>setButtonState(b,identity,{busy:true}));
    try{
      const response=await fetch(CAP_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cap.token}`},body:JSON.stringify({action:'save',gameId:identity.gameId,steamAppid:identity.steamAppid,sourceItemId:identity.sourceItemId,title:identity.title,storeUrl:identity.storeUrl,contextSource:CONTEXT}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data?.ok){markSaved(identity,data.game?.id||data.gameId||'');toast('MY HARF-WAYに持ち帰りました ✓');return true}
      if(retryAuth&&[401,403,410].includes(response.status)){clearCapability();buttons.forEach(b=>setButtonState(b,identity));return authorizeAndSave(identity)}
      throw new Error(data?.error||'save_failed');
    }catch{buttons.forEach(b=>setButtonState(b,identity));toast('持ち帰れませんでした。もう一度お試しください');return false}
  }
  function authorizeAndSave(identity){
    if(!IS_PRODUCTION){markSaved(identity);toast(`Preview：${identity.canonical?'CORE':'仮ID'}で持ち帰りました ✓`);return Promise.resolve(true)}
    if(pendingAuth)return pendingAuth.promise;
    let resolvePromise;const promise=new Promise(resolve=>{resolvePromise=resolve});
    const popup=window.open(authUrl(identity),'hwMyHarfwayAuthorize','popup=yes,width=520,height=720,resizable=yes,scrollbars=yes');
    if(!popup){toast('初回設定の小窓を開けませんでした');resolvePromise(false);return promise}
    const pending={identity,popup,resolve:resolvePromise,promise,timer:0};pendingAuth=pending;
    document.querySelectorAll(`.hw-take-home[data-key="${CSS.escape(identity.key)}"]`).forEach(b=>setButtonState(b,identity,{busy:true}));
    pending.timer=setInterval(()=>{if(pendingAuth!==pending)return;if(popup.closed){clearInterval(pending.timer);pendingAuth=null;refreshSavedButtons();resolvePromise(false)}},350);
    return promise;
  }
  window.addEventListener('message',event=>{
    if(event.origin!==AUTH_ORIGIN||!pendingAuth)return;
    const message=event.data;if(!message||message.type!=='hw-save-capability'||String(message.source||'')!==SOURCE||String(message.sourceOrigin||'')!==location.origin||String(message.contextSource||'')!==CONTEXT)return;
    if(String(message.sourceItemId||'')!==pendingAuth.identity.sourceItemId)return;
    const pending=pendingAuth;pendingAuth=null;clearInterval(pending.timer);const cap=storeCapability(message);
    if(message.saved)markSaved(pending.identity,String(message.gameId||''));if(message.saved)toast('MY HARF-WAYに持ち帰りました ✓');
    try{if(!pending.popup.closed)pending.popup.close()}catch{}pending.resolve(Boolean(cap&&message.saved));
  });
  function onTakeHomeButton(button){
    const identity=identityFromButton(button);if(!identity.key||button.classList.contains('is-busy'))return;
    if(isSaved(identity)){toast('すでに持ち帰り済みです ✓');return}
    const cap=capability();if(cap)inlineSave(identity,cap);else authorizeAndSave(identity);
  }
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.hw-take-home');if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();onTakeHomeButton(button);
  },true);

  async function loadLiveData(){
    try{const j=await fetch(LIVE,{cache:'no-store'}).then(r=>r.json());liveEntries=Array.isArray(j?.entries)?j.entries:[];liveById=new Map(liveEntries.map(e=>[String(e?.id||''),e]));}catch{liveEntries=[];liveById=new Map()}
    refreshDecorations();
  }
  function bootTakeHome(){
    ensureStyle();loadLiveData();refreshDecorations();
    let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refreshDecorations()})};
    new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','class']});
    setInterval(schedule,900);
  }

  async function targetTitle(){try{const r=await fetch(LIVE,{cache:'no-store'});const j=await r.json();const entries=j?.entries||[];const hit=gameId?entries.find(x=>norm(x?.id)===gameId):entries.find(x=>appIdFromUrl(x?.storeUrl)===appid);return norm(hit?.title)}catch{return ''}}
  async function openDesktop(title){for(let page=0;page<12;page++){const cards=[...document.querySelectorAll('.game')];const hit=cards.find(card=>norm(card.querySelector('.gtitle')?.textContent)===title);if(hit){hit.click();hit.scrollIntoView({behavior:'smooth',block:'nearest'});const v=document.querySelector('.video-frame video');if(v)setTimeout(()=>v.play().catch(()=>{}),60);return true}const more=document.querySelector('#shelfMore');if(!more)return false;more.click();await wait(180)}return false}
  async function openMobile(title){const feed=document.querySelector('#mfeed');if(!feed)return false;for(let turn=0;turn<40;turn++){const cards=[...feed.querySelectorAll('.m-card')];const hit=cards.find(card=>norm(card.querySelector('.m-meta h2')?.textContent)===title);if(hit){hit.scrollIntoView({behavior:'auto',block:'start'});await wait(180);const v=hit.querySelector('video');if(v){const src=v.dataset?.src;if(src&&!v.getAttribute('src'))v.src=src;v.play().catch(()=>{})}return true}const last=cards.at(-1);if(last)last.scrollIntoView({behavior:'auto',block:'start'});await wait(180)}return false}
  async function bootDeeplink(){if(!gameId&&!/^\d+$/.test(appid))return;const title=await targetTitle();if(!title)return;if(innerWidth>=900){for(let i=0;i<25&&!document.querySelector('.game');i++)await wait(120);await openDesktop(title)}else{for(let i=0;i<25&&!document.querySelector('.m-card');i++)await wait(120);await openMobile(title)}}

  bootTakeHome();
  bootDeeplink();
})();
