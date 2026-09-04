(()=>{
  const SOURCE='harfway';
  const STEAM_HOST='store.steampowered.com';

  function decorate(raw){
    try{
      const url=new URL(String(raw||''),location.href);
      if(url.hostname.toLowerCase()!==STEAM_HOST)return String(raw||'');
      url.searchParams.set('utm_source',SOURCE);
      url.searchParams.delete('utm_medium');
      return url.href;
    }catch{return String(raw||'')}
  }

  function rewrite(anchor){
    if(!anchor||!anchor.getAttribute)return;
    const raw=anchor.getAttribute('href');
    if(!raw)return;
    const next=decorate(raw);
    if(next&&next!==raw)anchor.setAttribute('href',next);
  }

  function scan(root=document){
    if(root?.matches?.('a[href]'))rewrite(root);
    root?.querySelectorAll?.('a[href]').forEach(rewrite);
  }

  scan();
  document.addEventListener('click',event=>{
    const anchor=event.target?.closest?.('a[href]');
    if(anchor)rewrite(anchor);
  },true);

  new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes')rewrite(record.target);
      for(const node of record.addedNodes||[])if(node.nodeType===1)scan(node);
    }
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href']});

  window.HARFWAY_STEAM_UTM={decorate,source:SOURCE};
})();
