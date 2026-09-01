(() => {
  const SERVE = '/api/sale-ads-serve';
  const EVENT = '/api/sale-ads-event';
  const PLACEMENT = 'sale';
  const DEFAULT_EVERY = 6;
  const PROD_HOSTS = new Set(['harfway-playback.vercel.app','harfway-playback-harf-way.vercel.app']);
  const TRACK_ENABLED = PROD_HOSTS.has(location.hostname);
  const DEMO = new URLSearchParams(location.search).get('ads_demo') === '1';
  const contextTags = ['SALE WATCH','Steam Sale','セール','インディーゲーム'];
  const LAST_AD_KEY = `hwads_last_${PLACEMENT}`;
  let ad=null,everyN=DEFAULT_EVERY,observer=null,timer=null,counted=false,injecting=false;

  const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sid=()=>{let v=localStorage.getItem('hwads_sid');if(!v){v=(crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g,'');localStorage.setItem('hwads_sid',v)}return v};
  const lastAdId=()=>{try{const v=String(localStorage.getItem(LAST_AD_KEY)||'').trim().toLowerCase();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)?v:''}catch{return ''}};
  const rememberAd=(value)=>{if(!value||value.__demo||!value.id)return;try{localStorage.setItem(LAST_AD_KEY,String(value.id).toLowerCase())}catch{}};
  async function req(url,opt={}){const r=await fetch(url,{cache:'no-store',...opt}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw Error(d.error||d.message||`HTTP ${r.status}`);return d}
  async function record(type){if(!ad||ad.__demo||!TRACK_ENABLED)return null;try{return await req(EVENT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,campaignId:ad.id,placement:PLACEMENT,contextTags,sessionKey:sid()})})}catch{return null}}
  function demoAd(){return{id:'sale-watch-preview-demo',title:'セールを見ている人へ届けるPR枠',catchText:'SALE WATCHの流れに自然に差し込む、購入直前のプロモーション枠です。',description:'Preview sample / impression is not counted.',storeUrl:'#',targetTags:['PROMOTED','SALE WATCH'],mediaUrl:'',mediaMime:'',__demo:true}}

  function addStyles(){if(document.getElementById('sale-ads-style'))return;const s=document.createElement('style');s.id='sale-ads-style';s.textContent=`
    .sale-ad-card{border-color:#eaff35;background:linear-gradient(180deg,#171b12,#10120f);position:relative}
    .sale-ad-media{position:relative;aspect-ratio:16/9;overflow:hidden;background:radial-gradient(circle at 68% 24%,#526719,#11150c 58%,#090a08);display:grid;place-items:center}
    .sale-ad-media img,.sale-ad-media video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}
    .sale-ad-fallback{padding:24px;color:#eaff35;font:950 clamp(30px,4vw,56px)/.86 system-ui,sans-serif;letter-spacing:-.055em;text-align:left;width:100%}
    .sale-ad-badge{position:absolute;z-index:3;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;padding:7px 9px;border-radius:999px;background:#eaff35;color:#090a0c;font:950 9px/1 system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 4px 18px rgba(0,0,0,.28)}
    .sale-ad-body{padding:13px;display:flex;flex-direction:column;gap:12px;min-height:238px}.sale-ad-kicker{color:#eaff35;font:950 9px/1.2 system-ui,sans-serif;letter-spacing:.14em}
    .sale-ad-title{margin:0;font:950 22px/1.08 system-ui,sans-serif;letter-spacing:-.035em;color:#fff}.sale-ad-copy{margin:0;color:#bdc5ae;font:700 11px/1.7 system-ui,sans-serif}
    .sale-ad-tags{display:flex;gap:5px;flex-wrap:wrap}.sale-ad-tag{border:1px solid #4e5b2a;border-radius:999px;padding:4px 6px;color:#cfdc7c;font:800 8px/1.2 system-ui,sans-serif}
    .sale-ad-actions{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid #343a26}
    .sale-ad-store{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 10px;border-radius:8px;background:#eaff35;color:#08090b;text-decoration:none;font:950 9px/1 system-ui,sans-serif}
    .sale-ad-note{color:#7f8972;font:800 8px/1.35 system-ui,sans-serif;text-align:right}.sale-ad-note.preview{color:#ffd06d}
    @media(max-width:640px){.sale-ad-body{min-height:0}.sale-ad-title{font-size:21px}.sale-ad-fallback{font-size:42px}}
  `;document.head.appendChild(s)}
  function mediaHtml(a){if(!a.mediaUrl)return '<div class="sale-ad-fallback">PROMOTED<br>GAME</div>';if((a.mediaMime||'').startsWith('video/'))return `<video muted autoplay loop playsinline preload="metadata" src="${esc(a.mediaUrl)}"></video>`;return `<img src="${esc(a.mediaUrl)}" alt="" loading="lazy">`}
  function cardHtml(){const tags=Array.isArray(ad?.targetTags)?ad.targetTags.slice(0,4):[];const store=ad?.storeUrl&&ad.storeUrl!=='#'?`<a class="sale-ad-store" data-sale-ad-store href="${esc(ad.storeUrl)}" target="_blank" rel="noopener">ストアで見る ↗</a>`:'<span></span>';const note=(!TRACK_ENABLED||ad?.__demo)?'<span class="sale-ad-note preview">PREVIEW / NOT COUNTED</span>':'<span class="sale-ad-note">SPONSORED</span>';return `<article class="card sale-ad-card" data-sale-ad="1"><div class="sale-ad-media">${mediaHtml(ad)}<span class="sale-ad-badge">PR / SPONSORED</span></div><div class="sale-ad-body"><div class="sale-ad-kicker">HARF-WAY / SALE WATCH PR</div><h2 class="sale-ad-title">${esc(ad?.title||'PROMOTED')}</h2><p class="sale-ad-copy">${esc(ad?.catchText||ad?.description||'')}</p>${tags.length?`<div class="sale-ad-tags">${tags.map((t)=>`<span class="sale-ad-tag"># ${esc(t)}</span>`).join('')}</div>`:''}<div class="sale-ad-actions">${store}${note}</div></div></article>`}
  function observeImpression(card){observer?.disconnect();if(timer)clearTimeout(timer);timer=null;if(!card||counted)return;observer=new IntersectionObserver((entries)=>{for(const entry of entries){if(counted)return;if(entry.intersectionRatio>=.5){if(!timer)timer=setTimeout(async()=>{timer=null;if(counted||!card.isConnected)return;if(!TRACK_ENABLED||ad?.__demo){counted=true;return}const result=await record('impression');if(result?.result?.accepted===false){card.remove();return}counted=true},1000)}else if(timer){clearTimeout(timer);timer=null}}},{threshold:[0,.5,1]});observer.observe(card)}
  function inject(){if(injecting||!ad)return;const grid=document.querySelector('#grid');if(!grid||grid.querySelector('[data-sale-ad]'))return;const cards=[...grid.querySelectorAll(':scope > .card:not(.sale-ad-card)')];if(cards.length<everyN)return;injecting=true;try{cards[everyN-1].insertAdjacentHTML('afterend',cardHtml());const card=grid.querySelector('[data-sale-ad]');card?.querySelector('[data-sale-ad-store]')?.addEventListener('click',()=>{record('click');record('store_visit')},true);observeImpression(card)}finally{injecting=false}}
  function watchGrid(){const grid=document.querySelector('#grid');if(!grid)return;new MutationObserver(()=>queueMicrotask(inject)).observe(grid,{childList:true});inject()}
  async function boot(){addStyles();try{const params=new URLSearchParams({placement:PLACEMENT,tags:contextTags.join(','),sid:sid()});const previous=lastAdId();if(previous)params.set('avoid',previous);const d=await req(`${SERVE}?${params.toString()}`);everyN=Math.max(1,Number(d.rule?.everyNItems||DEFAULT_EVERY));ad=d.ad||(DEMO?demoAd():null);rememberAd(ad)}catch{ad=DEMO?demoAd():null}watchGrid()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
