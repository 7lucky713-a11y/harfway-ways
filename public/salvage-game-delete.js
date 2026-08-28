(()=>{
  const ADMIN_KEY='hw_salvager_admin_key';

  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function articleUrl(){return String(document.querySelector('#articleUrl')?.value||'').trim()}
  function gameId(card){
    const sub=card?.querySelector('.sub')?.textContent||'';
    const bits=sub.split('·').map(x=>x.trim()).filter(Boolean);
    return bits.at(-1)||'';
  }
  function gameTitle(card){return String(card?.querySelector('.title')?.textContent||'').trim()}
  function isSalvagerGame(id){return /^game-salvage-/i.test(String(id||''))}

  function toast(message,type='ok'){
    let el=document.querySelector('#salvageDeleteToast');
    if(!el){
      el=document.createElement('div');el.id='salvageDeleteToast';
      Object.assign(el.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'9999',maxWidth:'420px',padding:'12px 14px',borderRadius:'10px',fontSize:'12px',lineHeight:'1.55',boxShadow:'0 12px 40px #0009',transition:'opacity .2s'});
      document.body.appendChild(el);
    }
    el.style.background=type==='error'?'#351717':'#20281b';
    el.style.border=type==='error'?'1px solid #754343':'1px solid #46583a';
    el.style.color='#fff';el.textContent=message;el.style.opacity='1';
    clearTimeout(el._timer);el._timer=setTimeout(()=>{el.style.opacity='0'},3200);
  }

  async function apiDelete(id,title){
    const headers={'content-type':'application/json'};
    const admin=sessionStorage.getItem(ADMIN_KEY)||'';if(admin)headers['X-Admin-Key']=admin;
    const r=await fetch('/api/archive-delete-game',{
      method:'POST',headers,
      body:JSON.stringify({gameId:id,articleUrl:articleUrl(),sourceOfTruth:isSalvagerGame(id)?'archive-salvager':''})
    });
    let data={};try{data=await r.json()}catch{}
    if(r.status===401)throw new Error('管理キーを確認してください。');
    if(!r.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);
    return data;
  }

  function refreshAfterDelete(id){
    try{
      const selectedIds=[...document.querySelectorAll('#candidates input[type="checkbox"]:checked')]
        .map(cb=>gameId(cb.closest('.candidate'))).filter(x=>x&&x!==id);
      if(typeof state!=='undefined'){
        state.games=(state.games||[]).filter(g=>String(g?.id||'')!==id);
        state.candidates=(state.candidates||[]).filter(g=>String(g?.id||'')!==id);
      }
      if(typeof autoMatch==='function'){autoMatch(selectedIds);return true}
    }catch{}
    return false;
  }

  async function remove(card,button){
    const id=gameId(card),title=gameTitle(card);if(!id)return;
    const message=`「${title}」を誤登録として取り消しますか？\n\nSalvagerで新規作成したゲームなら、ゲーム本体とGAME LINKSを削除します。\n他コンテンツで使用中なら、この記事との紐付けだけ解除します。`;
    if(!window.confirm(message))return;
    button.disabled=true;const before=button.textContent;button.textContent='削除中…';
    try{
      const data=await apiDelete(id,title);
      if(data.deletedGame){
        if(!refreshAfterDelete(id))card.remove();
        toast(data.previewOnly?'Preview仮削除OK。本番DBは変更していません。':`「${title}」の誤登録を削除しました。`);
      }else if(data.unlinkedOnly){
        const cb=card.querySelector('input[type="checkbox"]');
        if(cb){cb.checked=false;cb.dispatchEvent(new Event('change',{bubbles:true}))}
        button.remove();
        toast(data.previewOnly?'Preview仮解除OK。本番DBは変更していません。':`「${title}」は共有中のため、この記事との紐付けだけ解除しました。`);
      }
    }catch(error){
      button.disabled=false;button.textContent=before;toast(error?.message||'削除に失敗しました。','error');
    }
  }

  function inject(){
    document.querySelectorAll('#candidates .candidate:not(.unresolved)').forEach(card=>{
      if(card.querySelector('.delete-mistake-game'))return;
      const id=gameId(card);if(!isSalvagerGame(id))return;
      const host=card.querySelector('.store-actions')||card.querySelector('.store-row');if(!host)return;
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn mini delete-mistake-game';btn.textContent='誤登録を削除';
      Object.assign(btn.style,{borderColor:'#704444',color:'#ffb7b7',background:'#241515'});
      btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();remove(card,btn)});
      host.appendChild(btn);
    });
  }

  const observer=new MutationObserver(()=>inject());
  function start(){const root=document.querySelector('#candidates');if(root)observer.observe(root,{childList:true,subtree:true});inject()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
