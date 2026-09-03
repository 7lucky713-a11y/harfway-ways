(()=>{
  const TARGET='https://harfway-playlist-tv.vercel.app/my-harfway.html';
  const SELECTOR='.hw-take-home,.hw-playback-take-home';
  const context=location.pathname.startsWith('/scrapbook')?'scraps':location.pathname.startsWith('/sales')?'sale':'ways';

  function ensureStyle(){
    if(document.querySelector('#hwMyHarfwayOpenStyle'))return;
    const style=document.createElement('style');
    style.id='hwMyHarfwayOpenStyle';
    style.textContent=`.hw-my-harfway-open{display:inline-flex;align-items:center;min-height:31px;margin-left:7px;padding:6px 9px;border-bottom:1px solid currentColor;color:#aeb6bc;font:850 9px/1.2 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;text-decoration:none;white-space:nowrap;transition:.15s color,.15s border-color}.hw-my-harfway-open:hover{color:var(--accent,#eaff35);border-color:var(--accent,#eaff35)}.hw-my-harfway-open[hidden]{display:none!important}@media(max-width:899px){.hw-my-harfway-open{margin:8px 0 0 6px;min-height:28px;padding:5px 7px;font-size:9px}.m-meta .hw-my-harfway-open{border-radius:999px;border:1px solid #555a62;background:#050505cc;color:#f4f5ef}}`;
    document.head.appendChild(style);
  }

  function isSaved(button){
    return button.classList.contains('is-saved')||/^♥/.test(String(button.textContent||'').trim());
  }

  function syncButton(button){
    if(!(button instanceof HTMLElement))return;
    let link=button.nextElementSibling?.classList?.contains('hw-my-harfway-open')?button.nextElementSibling:null;
    if(!link){
      link=document.createElement('a');
      link.className='hw-my-harfway-open';
      link.textContent='MY HARF-WAYを見る →';
      link.href=`${TARGET}?from=${encodeURIComponent(context)}`;
      link.setAttribute('aria-label','持ち帰ったゲームをMY HARF-WAYで見る');
      link.addEventListener('click',event=>event.stopPropagation());
      button.insertAdjacentElement('afterend',link);
    }
    link.hidden=!isSaved(button);
  }

  function scan(){document.querySelectorAll(SELECTOR).forEach(syncButton)}
  function boot(){
    ensureStyle();scan();
    let queued=false;
    const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan()})};
    new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    setInterval(scan,1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
