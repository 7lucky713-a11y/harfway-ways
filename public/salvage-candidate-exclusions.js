(()=>{
  const STORAGE_KEY='hw_salvager_candidate_exclusions_v1';
  const ADMIN_KEY='hw_salvager_admin_key';
  const nativeFetch=window.fetch.bind(window);

  function loadMap(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return {}}
  }
  function saveMap(map){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(map))}catch{}
  }
  function currentUrl(){return String(document.querySelector('#articleUrl')?.value||'').trim()}
  function idsFor(url){const map=loadMap();return new Set(Array.isArray(map[url])?map[url]:[])}
  function writeIds(url,set){if(!url)return;const map=loadMap();map[url]=[...set];saveMap(map)}
  function gameIdFromCheckbox(cb){
    const sub=cb.closest('.candidate')?.querySelector('.sub')?.textContent||'';
    const bits=sub.split('·').map(x=>x.trim()).filter(Boolean);
    return bits.length?bits[bits.length-1]:'';
  }
  function applyExcluded(){
    const url=currentUrl();if(!url)return;
    const excluded=idsFor(url);
    document.querySelectorAll('#candidates input[type="checkbox"]').forEach(cb=>{
      const id=gameIdFromCheckbox(cb);
      if(id&&excluded.has(id))cb.checked=false;
    });
  }
  function hydrateFromMetadata(url,metadata){
    if(!url||!metadata||!Array.isArray(metadata.excludedGameIds))return;
    writeIds(url,new Set(metadata.excludedGameIds.filter(Boolean)));
    setTimeout(applyExcluded,0);
  }
  async function persistDecisions(url){
    if(!url)return;
    const excluded=[...idsFor(url)];
    const headers={'content-type':'application/json'};
    const admin=sessionStorage.getItem(ADMIN_KEY)||'';
    if(admin)headers['X-Admin-Key']=admin;
    try{
      await nativeFetch('/api/archive-candidate-decisions',{
        method:'POST',headers,body:JSON.stringify({url,excludedGameIds:excluded})
      });
    }catch{}
  }

  document.addEventListener('change',e=>{
    const cb=e.target;
    if(!(cb instanceof HTMLInputElement)||cb.type!=='checkbox'||!cb.closest('#candidates'))return;
    const id=gameIdFromCheckbox(cb),url=currentUrl();if(!id||!url)return;
    const excluded=idsFor(url);
    if(cb.checked)excluded.delete(id);else excluded.add(id);
    writeIds(url,excluded);
  });

  const observer=new MutationObserver(()=>applyExcluded());
  function startObserver(){const root=document.querySelector('#candidates');if(root)observer.observe(root,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{startObserver();applyExcluded()});else{startObserver();applyExcluded()}

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:String(input?.url||'');
    const method=String(init?.method||'GET').toUpperCase();
    const response=await nativeFetch(input,init);

    if(method==='GET'&&url.includes('/api/archive-items?')&&url.includes('url=')){
      try{
        const data=await response.clone().json();
        if(data?.item?.url)hydrateFromMetadata(data.item.url,data.item.metadata||{});
      }catch{}
    }

    if(method==='POST'&&url.includes('/api/archive-save')){
      try{
        const data=await response.clone().json();
        if(data?.ok){
          let articleUrl=currentUrl();
          try{const body=JSON.parse(String(init?.body||'{}'));articleUrl=body?.article?.url||articleUrl}catch{}
          persistDecisions(articleUrl);
        }
      }catch{}
    }
    return response;
  };
})();
