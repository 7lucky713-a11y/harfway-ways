(()=>{
  const storeKey='harfway-weekly-x-library-v1';
  let xPosts=[];
  try{xPosts=JSON.parse(localStorage.getItem(storeKey)||'[]');if(!Array.isArray(xPosts))xPosts=[]}catch{xPosts=[]}

  const style=document.createElement('style');
  style.textContent=`
  .x-source-card{border-color:#3f4650;background:linear-gradient(180deg,#111923,#0e1115)}
  .x-source-card:before{content:'X';position:absolute;z-index:3;left:9px;top:9px;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#f4f5f2;color:#090a0b;font:950 12px/1 ui-monospace,monospace}
  .x-source-card .thumb.x-thumb{height:92px;display:flex;align-items:flex-end;padding:14px;background:linear-gradient(135deg,#1f2933,#090b0e);font:950 11px/1 ui-monospace,monospace;letter-spacing:.12em;color:#f4f5f2}
  .x-source-url{font-size:9px;line-height:1.45;color:#7f8a95;word-break:break-all}
  .x-assign{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:4px}
  .x-assign .select{height:34px;font-size:9px}.x-assign .mini{white-space:nowrap}
  .x-assigned{display:inline-flex;margin-top:5px;padding:4px 6px;border:1px solid #65701d;border-radius:999px;color:#eaff38;font:900 8px/1 ui-monospace,monospace;letter-spacing:.06em}
  `;
  document.head.appendChild(style);

  const tabs=document.querySelector('.tabs');
  if(tabs&&!tabs.querySelector('[data-mode="xposts"]')){
    const b=document.createElement('button');b.className='tab';b.dataset.mode='xposts';b.textContent='X / TWITTER';tabs.appendChild(b);
  }
  const sourcegrid=document.querySelector('.sourcegrid');
  if(sourcegrid&&!document.getElementById('xPostCount')){
    const d=document.createElement('div');d.className='source';d.innerHTML='<span>X / Twitter</span><b id="xPostCount">0</b>';sourcegrid.appendChild(d);
  }

  const persist=()=>{localStorage.setItem(storeKey,JSON.stringify(xPosts));const c=document.getElementById('xPostCount');if(c)c.textContent=xPosts.length};
  const statusId=url=>String(url||'').match(/\/status\/(\d+)/)?.[1]||'';
  const validX=url=>/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(String(url||'').trim());
  const addPost=(url,title='',note='')=>{
    url=String(url||'').trim();if(!validX(url)){flash('X / Twitter の投稿URLを入れてください');return false}
    if(xPosts.some(p=>p.url===url)){flash('このX投稿は登録済みです');return false}
    xPosts.unshift({id:`x-${statusId(url)||Date.now()}`,url,title:String(title||'').trim()||`X POST ${statusId(url)?'#'+statusId(url).slice(-6):''}`,note:String(note||'').trim(),addedAt:new Date().toISOString(),assignedGameId:''});persist();return true;
  };
  const syncAssigned=()=>{
    let changed=false;
    try{gameIds.forEach(id=>{const url=String(gameEdit?.[id]?.xUrl||'').trim();if(validX(url)&&!xPosts.some(p=>p.url===url)){const g=item(id);xPosts.push({id:`x-${statusId(url)||Date.now()}`,url,title:g?.title||'X POST',note:'GAME LOGから取得',addedAt:new Date().toISOString(),assignedGameId:id});changed=true}})}catch{}
    if(changed)persist();
  };
  const allGameCandidates=()=>{
    const ways=items.filter(x=>x.type==='WAYS');
    const selectedCustom=gameIds.map(id=>item(id)).filter(x=>x&&x.type==='CUSTOM');
    const seen=new Set();
    return [...ways,...selectedCustom].filter(x=>x?.id&&!seen.has(x.id)&&(seen.add(x.id),true));
  };

  const baseBuildTypeFilter=buildTypeFilter;
  buildTypeFilter=function(){
    if(mode==='xposts'){const f=document.getElementById('typeFilter');if(f)f.innerHTML='<option value="">X / Twitter</option>';return}
    return baseBuildTypeFilter();
  };

  const baseRenderCards=renderCards;
  renderCards=function(){
    if(mode!=='xposts')return baseRenderCards();
    syncAssigned();persist();
    const q=String(document.getElementById('query')?.value||'').toLowerCase().trim();
    const list=xPosts.filter(p=>!q||`${p.title} ${p.note} ${p.url}`.toLowerCase().includes(q));
    const cards=document.getElementById('cards');if(!cards)return;
    if(!list.length){cards.innerHTML='<div class="empty">X投稿はまだありません。「＋ X POST追加」から投稿URLを登録できます。</div>';return}
    const candidates=allGameCandidates();
    cards.innerHTML=list.map(p=>{
      const options=candidates.length?'<option value="">対象ゲームを選択</option>'+candidates.map(g=>`<option value="${esc(g.id)}" ${p.assignedGameId===g.id?'selected':''}>${esc(g.title||g.id)}</option>`).join(''):'<option value="">WAYS候補を読み込み中…</option>';
      const assigned=p.assignedGameId?item(p.assignedGameId):null;
      return `<article class="card x-source-card"><div class="thumb x-thumb">X / TWITTER SOURCE</div><div class="cardbody"><div class="badges"><span class="badge">X POST</span><span class="badge">SOURCE LIBRARY</span></div><div class="title">${esc(p.title)}</div>${p.note?`<div class="summary">${esc(p.note)}</div>`:''}<div class="x-source-url">${esc(p.url)}</div>${assigned?`<div class="x-assigned">→ ${esc(assigned.title||'割当済み')}</div>`:''}<div class="x-assign"><select class="select" data-xgame="${esc(p.id)}">${options}</select><button class="mini primary" data-xassign="${esc(p.id)}">ゲームへ割当</button></div><div class="cardactions"><a class="mini" href="${esc(p.url)}" target="_blank" rel="noopener">OPEN ↗</a><button class="mini" data-xremove="${esc(p.id)}">削除</button></div></div></article>`;
    }).join('');
  };

  const baseAddCustom=addCustom;
  addCustom=function(){
    if(mode!=='xposts')return baseAddCustom();
    const ok=addPost(document.getElementById('customUrl')?.value,document.getElementById('customTitle')?.value,document.getElementById('customText')?.value);
    if(!ok)return;
    document.getElementById('customTitle').value='';document.getElementById('customText').value='';document.getElementById('customUrl').value='';renderAll();flash('X投稿を素材庫へ追加しました');
  };
  document.getElementById('addCustom').onclick=addCustom;

  const baseClear=document.getElementById('clearMode').onclick;
  document.getElementById('clearMode').onclick=()=>{if(mode==='xposts'){xPosts=[];persist();renderAll();flash('X投稿の素材庫を空にしました');return}baseClear?.()};

  const baseCardsClick=document.getElementById('cards').onclick;
  document.getElementById('cards').onclick=e=>{
    if(mode!=='xposts')return baseCardsClick?.call(document.getElementById('cards'),e);
    const assign=e.target.closest('[data-xassign]');
    if(assign){
      const p=xPosts.find(x=>x.id===assign.dataset.xassign),sel=document.querySelector(`[data-xgame="${CSS.escape(assign.dataset.xassign)}"]`),gid=sel?.value;
      if(!p||!gid){flash('対象ゲームを選んでください');return}
      if(!gameIds.includes(gid))gameIds.push(gid);
      gameEdit[gid]={...(gameEdit[gid]||{}),xUrl:p.url};
      gameTab[gid]='x';
      p.assignedGameId=gid;
      persist();
      renderGamesSelected();decorateGameTabs();renderPreview();renderCards();
      setTimeout(()=>{
        const field=document.querySelector(`#gameSelected [data-gfield="xUrl"][data-id="${CSS.escape(gid)}"]`);
        const target=field?.closest('.sel');
        target?.scrollIntoView({behavior:'smooth',block:'center'});
        field?.focus({preventScroll:true});
      },80);
      flash(`${item(gid)?.title||'ゲーム'} をGAME LOGへ追加してX投稿を割り当てました`);return;
    }
    const remove=e.target.closest('[data-xremove]');
    if(remove){xPosts=xPosts.filter(x=>x.id!==remove.dataset.xremove);persist();renderCards();return}
  };

  document.getElementById('query').oninput=()=>renderCards();
  document.getElementById('typeFilter').onchange=()=>renderCards();

  const updateModeUi=()=>{
    const add=document.getElementById('toggleCustom'),clear=document.getElementById('clearMode'),title=document.getElementById('customTitle'),url=document.getElementById('customUrl'),text=document.getElementById('customText'),auto=document.getElementById('autoFill');
    if(mode==='xposts'){
      if(add)add.textContent='＋ X POST追加';if(clear)clear.textContent='X一覧を空にする';if(auto)auto.style.display='none';
      if(title)title.placeholder='投稿メモ / ゲーム名（任意）';if(url)url.placeholder='https://x.com/.../status/...';if(text)text.placeholder='この投稿のメモ（任意）';
    }else{
      if(add)add.textContent='＋ 手動追加';if(clear)clear.textContent='この欄を空にする';if(auto)auto.style.display='';
      if(title)title.placeholder='タイトル';if(url)url.placeholder='URL（任意）';if(text)text.placeholder='説明文（任意）';
    }
    persist();
  };
  tabs?.addEventListener('click',()=>setTimeout(updateModeUi,0));
  setTimeout(()=>{syncAssigned();persist();if(mode==='xposts')renderAll()},900);
  persist();
})();
