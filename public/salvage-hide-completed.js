(()=>{
  const KEY='hw_salvage_show_completed';
  let showCompleted=sessionStorage.getItem(KEY)==='1';
  const queue=()=>document.querySelector('#queue');

  function ensureToggle(){
    const q=queue(); if(!q) return;
    const parent=q.parentElement; if(!parent) return;
    let btn=document.querySelector('#toggleCompletedSaved');
    if(!btn){
      btn=document.createElement('button');
      btn.id='toggleCompletedSaved';
      btn.type='button';
      btn.className='btn mini';
      btn.style.cssText='width:100%;margin:0 0 10px;';
      btn.addEventListener('click',()=>{
        showCompleted=!showCompleted;
        sessionStorage.setItem(KEY,showCompleted?'1':'0');
        apply();
      });
      parent.insertBefore(btn,q);
    }
    btn.textContent=showCompleted?'完了済みを隠す':'完了済みも表示';
  }

  function isCompletedLinked(el){
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    const match=text.match(/(\d+)\s+games?/i);
    const gameCount=match?Number(match[1]):0;
    const completed=/\b(done|reviewed|published)\b/i.test(text);
    return gameCount>0 && completed;
  }

  function apply(){
    ensureToggle();
    const q=queue(); if(!q) return;
    [...q.querySelectorAll('.queue-item')].forEach(el=>{
      el.style.display=(!showCompleted && isCompletedLinked(el))?'none':'';
    });
    const items=[...q.querySelectorAll('.queue-item')];
    const visible=items.filter(el=>el.style.display!=='none');
    let empty=document.querySelector('#queueFilteredEmpty');
    if(items.length && !visible.length){
      if(!empty){
        empty=document.createElement('div');
        empty.id='queueFilteredEmpty';
        empty.className='empty';
        empty.textContent='作業待ちの記事はありません。';
        q.appendChild(empty);
      }
    }else if(empty){
      empty.remove();
    }
    const btn=document.querySelector('#toggleCompletedSaved');
    if(btn)btn.textContent=showCompleted?'完了済みを隠す':'完了済みも表示';
  }

  const observer=new MutationObserver(()=>apply());
  function start(){
    const q=queue();
    if(q)observer.observe(q,{childList:true,subtree:true,characterData:true});
    apply();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
