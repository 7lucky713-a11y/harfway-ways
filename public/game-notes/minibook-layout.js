(()=>{
  if(window.__MINIBOOK_LAYOUT_LAYER__) return;
  window.__MINIBOOK_LAYOUT_LAYER__=true;

  const ASPECT=257/182;
  const MAX_WIDTH=680;
  const MIN_WIDTH=190;
  const RESERVED_Y=120;
  let forcedScale=null;
  let current={readerWidth:MAX_WIDTH,capacityScale:1,compact:false};
  let raf=0;

  const clamp=(min,max,v)=>Math.max(min,Math.min(max,v));

  function viewport(){
    const vv=window.visualViewport;
    return {
      width:Math.max(1,Number(vv?.width||window.innerWidth||MAX_WIDTH)),
      height:Math.max(1,Number(vv?.height||window.innerHeight||900))
    };
  }

  function measure(){
    const reader=document.querySelector('.reader');
    const preview=document.querySelector('.preview');
    const vp=viewport();
    const previewWidth=Math.max(1,(preview?.clientWidth||vp.width)-14);
    const byHeight=Math.max(MIN_WIDTH,(vp.height-RESERVED_Y)/ASPECT);
    const readerWidth=clamp(MIN_WIDTH,MAX_WIDTH,Math.min(previewWidth,vp.width-14,byHeight));
    const ratio=clamp(MIN_WIDTH/MAX_WIDTH,1,readerWidth/MAX_WIDTH);
    const naturalScale=clamp(.34,1,Math.pow(ratio,1.35));
    const capacityScale=forcedScale==null?naturalScale:clamp(.28,1,forcedScale);
    const compact=capacityScale<.86;

    if(reader){
      reader.style.width=readerWidth.toFixed(1)+'px';
      reader.style.maxWidth='100%';
    }

    return {readerWidth,capacityScale,compact,viewportWidth:vp.width,viewportHeight:vp.height};
  }

  function publish(next){
    const changed=Math.abs(next.readerWidth-current.readerWidth)>2 || Math.abs(next.capacityScale-current.capacityScale)>.025 || next.compact!==current.compact;
    current=next;
    window.__MINIBOOK_LAYOUT__={...current};
    document.documentElement.dataset.miniLayout=current.compact?'compact':'regular';
    if(changed) window.dispatchEvent(new CustomEvent('minibook:layoutchange',{detail:{...current}}));
  }

  function refresh(){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>publish(measure()));
  }

  window.__MINIBOOK_LAYOUT_API__={
    get:()=>({...current}),
    refresh,
    setCapacityScale:value=>{forcedScale=Number.isFinite(Number(value))?Number(value):null;refresh()},
    clearCapacityScale:()=>{forcedScale=null;refresh()}
  };

  window.addEventListener('resize',refresh,{passive:true});
  window.visualViewport?.addEventListener('resize',refresh,{passive:true});
  window.visualViewport?.addEventListener('scroll',refresh,{passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
})();
