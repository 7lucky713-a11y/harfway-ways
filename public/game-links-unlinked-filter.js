(()=>{
  const STORE_SERVICES=new Set(['steam','nintendo','playstation','xbox','itch','dlsite','booth','google_play','app_store','epic','gog','gamejolt','unityroom','novelgame','freem','official','web']);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const searchForm=document.querySelector('#searchForm');
  const results=document.querySelector('#results');
  const status=document.querySelector('#status');
  if(!searchForm||!results||!status)return;

  const bar=document.createElement('div');
  bar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:-6px 0 16px';
  bar.innerHTML='<button id="unlinkedFilter" type="button" class="btn">リンク未登録のみ</button><span id="unlinkedCount" style="font-size:11px;color:#8f8b82"></span>';
  searchForm.insertAdjacentElement('afterend',bar);
  const button=bar.querySelector('#unlinkedFilter');
  const count=bar.querySelector('#unlinkedCount');
  let active=false;

  function storeRefs(game){
    return (game?.refs||[]).filter(ref=>{
      const service=String(ref?.service||'');
      const url=String(ref?.externalUrl||ref?.external_url||'').trim();
      return STORE_SERVICES.has(service)&&url;
    });
  }
  function isUnlinked(game){
    return !String(game?.storeUrl||game?.store_url||'').trim()&&!storeRefs(game).length;
  }
  function render(games){
    status.innerHTML=`<span class="ok">● リンク未登録 ${games.length}件</span><br>store_url と作品リンクがどちらも空のゲームだけ表示しています。`;
    count.textContent=`${games.length}件`;
    results.innerHTML=games.map(g=>`<div class="card"><div class="title">${esc(g.title)}</div><div class="meta">ID: ${esc(g.id)}<br>メイン: 未登録<br>登録リンク: 0件</div><div class="resolved">LINK REQUIRED</div><br><a class="btn" href="/salvage/store-edit/?id=${encodeURIComponent(g.id)}&filter=unlinked">リンクを追加</a></div>`).join('')||'<div class="empty">リンク未登録のゲームはありません。</div>';
  }
  async function load(){
    button.disabled=true;button.textContent='抽出中…';status.textContent='リンク未登録ゲームを抽出しています…';
    try{
      const r=await fetch('/api/core/games?limit=500&t='+Date.now(),{cache:'no-store'}),j=await r.json();
      if(!r.ok||!j.ok||!Array.isArray(j.games))throw new Error(j.error||'core_games_failed');
      const games=j.games.filter(isUnlinked).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'ja'));
      active=true;button.textContent='リンク未登録のみ ✓';button.style.borderColor='#d8d1c2';button.style.background='#2b2923';render(games);
    }catch(e){status.innerHTML=`<span class="warn">● フィルター失敗</span><br>${esc(e.message)}`;count.textContent='';}
    finally{button.disabled=false}
  }
  function clear(){
    active=false;button.textContent='リンク未登録のみ';button.style.borderColor='';button.style.background='';count.textContent='';results.innerHTML='';status.textContent='ゲーム名または作品ページURLを入力してください。';
  }
  button.addEventListener('click',()=>active?clear():load());
  if(new URLSearchParams(location.search).get('filter')==='unlinked'&&!new URLSearchParams(location.search).get('id'))load();
})();
