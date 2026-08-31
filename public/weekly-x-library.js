(()=>{
  const storeKey='harfway-weekly-x-library-v4';
  const sectionKey='harfway-weekly-game-sections-v1';
  let xPosts=[];
  try{xPosts=JSON.parse(localStorage.getItem(storeKey)||localStorage.getItem('harfway-weekly-x-library-v3')||localStorage.getItem('harfway-weekly-x-library-v2')||localStorage.getItem('harfway-weekly-x-library-v1')||'[]');if(!Array.isArray(xPosts))xPosts=[]}catch{xPosts=[]}
  let sectionLabels={x:'Xで紹介した動画',ways:'WAYSで紹介した動画',other:'その他の紹介'};
  try{sectionLabels={...sectionLabels,...JSON.parse(localStorage.getItem(sectionKey)||'{}')}}catch{}

  const sectionCss=`
  .hw-game-section{display:flex;align-items:center;gap:12px;margin:38px 0 12px;padding:13px 15px;border:1px solid #111;font-weight:950;letter-spacing:-.02em}
  .hw-game-section-num{font:950 10px/1 ui-monospace,monospace;letter-spacing:.12em}
  .hw-game-section-label{font-size:20px;line-height:1.25}
  .hw-game-section-x{background:#111;color:#fff}.hw-game-section-ways{background:#eaff38;color:#111}.hw-game-section-other{background:#e9e9e9;color:#111}
  `;
  const style=document.createElement('style');
  style.textContent=`
  .x-source-card{position:relative;border-color:#3f4650;background:linear-gradient(180deg,#111923,#0e1115)}
  .x-source-card:before{content:'X';position:absolute;z-index:3;left:9px;top:9px;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#f4f5f2;color:#090a0b;font:950 12px/1 ui-monospace,monospace}
  .x-source-card .thumb.x-thumb{height:92px;display:flex;align-items:flex-end;padding:14px;background:linear-gradient(135deg,#1f2933,#090b0e);font:950 11px/1 ui-monospace,monospace;letter-spacing:.12em;color:#f4f5f2}
  .x-source-url{font-size:9px;line-height:1.45;color:#7f8a95;word-break:break-all}.x-independent{display:inline-flex;margin-top:5px;padding:4px 6px;border:1px solid #4c5661;border-radius:999px;color:#b9c2ca;font:900 8px/1 ui-monospace,monospace;letter-spacing:.06em}.x-independent.on{border-color:#65701d;color:#eaff38}.x-version{display:inline-flex;margin-left:6px;padding:3px 5px;border-radius:999px;background:#25300d;color:#eaff38;font:900 7px/1 ui-monospace,monospace;letter-spacing:.08em}
  .game-section-settings{margin:0 0 10px;padding:10px;border:1px dashed #3a444f;border-radius:10px;background:#0b0e12}.game-section-settings-title{margin-bottom:8px;font:900 9px/1 ui-monospace,monospace;letter-spacing:.12em;color:#eaff38}.game-section-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.game-section-control{display:grid;grid-template-columns:82px minmax(0,1fr);gap:7px;align-items:center;margin:9px 0 0}.game-section-control label{font-size:9px;color:#8f99a4}.game-section-control .select{height:34px;font-size:10px}
  ${sectionCss}`;
  document.head.appendChild(style);

  const tabs=document.querySelector('.tabs');
  if(tabs&&!tabs.querySelector('[data-mode="xposts"]')){const b=document.createElement('button');b.className='tab';b.dataset.mode='xposts';b.innerHTML='X / TWITTER <span class="x-version">独立</span>';tabs.appendChild(b)}
  const sourcegrid=document.querySelector('.sourcegrid');
  if(sourcegrid&&!document.getElementById('xPostCount')){const d=document.createElement('div');d.className='source';d.innerHTML='<span>X / Twitter</span><b id="xPostCount">0</b>';sourcegrid.appendChild(d)}

  const persist=()=>{localStorage.setItem(storeKey,JSON.stringify(xPosts));localStorage.setItem(sectionKey,JSON.stringify(sectionLabels));const c=document.getElementById('xPostCount');if(c)c.textContent=xPosts.length};
  const statusId=url=>String(url||'').match(/\/status\/(\d+)/)?.[1]||'';
  const validX=url=>/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(String(url||'').trim());
  const addPost=(url,title='',note='')=>{url=String(url||'').trim();if(!validX(url)){flash('X / Twitter の投稿URLを入れてください');return false}if(xPosts.some(p=>p.url===url)){flash('このX投稿は登録済みです');return false}xPosts.unshift({id:`x-${statusId(url)||Date.now()}`,url,title:String(title||'').trim()||`X POST ${statusId(url)?'#'+statusId(url).slice(-6):''}`,note:String(note||'').trim(),addedAt:new Date().toISOString(),newsItemId:''});persist();return true};

  const sectionOf=id=>{const explicit=gameEdit?.[id]?.section;if(['x','ways','other'].includes(explicit))return explicit;const x=item(id);if(x?.source==='X / TWITTER'||String(id).startsWith('xnews-'))return 'x';if(x?.type==='WAYS')return 'ways';return 'other'};
  const normalizeSections=()=>{const p={x:0,ways:1,other:2};gameIds=gameIds.map((id,i)=>({id,i,s:sectionOf(id)})).sort((a,b)=>p[a.s]-p[b.s]||a.i-b.i).map(x=>x.id)};
  const sectionNumber=s=>s==='x'?'01':s==='ways'?'02':'03';
  const sectionMarker=s=>`<div class="hw-game-section hw-game-section-${s}"><span class="hw-game-section-num">${sectionNumber(s)}</span><div class="hw-game-section-label">${esc(sectionLabels[s]||'紹介動画')}</div></div>`;

  const baseHtml=html;
  html=function(){normalizeSections();let out=baseHtml();let i=0,last='';const ids=[...gameIds];return out.replace(/<article class="hw-game">/g,m=>{const s=sectionOf(ids[i++]);const marker=s!==last?sectionMarker(s):'';last=s;return marker+m})};

  const baseRenderGamesSelected=renderGamesSelected;
  renderGamesSelected=function(){normalizeSections();baseRenderGamesSelected();const box=document.getElementById('gameSelected');if(!box)return;let settings=document.getElementById('gameSectionSettings');if(!settings){settings=document.createElement('div');settings.id='gameSectionSettings';settings.className='game-section-settings';settings.innerHTML=`<div class="game-section-settings-title">GAME LOG 区切り設定</div><div class="game-section-settings-grid"><input class="input smallinput" data-section-label="x" value="${esc(sectionLabels.x)}"><input class="input smallinput" data-section-label="ways" value="${esc(sectionLabels.ways)}"></div>`;box.parentElement?.insertBefore(settings,box)}
    box.querySelectorAll('.sel').forEach(sel=>{const any=sel.querySelector('[data-gfield]');if(!any)return;const id=any.dataset.id;if(sel.querySelector('[data-gsection]'))return;const row=document.createElement('div');row.className='game-section-control';row.innerHTML=`<label>動画の区切り</label><select class="select" data-gsection="${esc(id)}"><option value="x" ${sectionOf(id)==='x'?'selected':''}>① ${esc(sectionLabels.x)}</option><option value="ways" ${sectionOf(id)==='ways'?'selected':''}>② ${esc(sectionLabels.ways)}</option><option value="other" ${sectionOf(id)==='other'?'selected':''}>その他</option></select>`;const firstGrid=sel.querySelector(':scope > .editgrid');sel.insertBefore(row,firstGrid)})};

  document.addEventListener('input',e=>{const label=e.target.closest?.('[data-section-label]');if(!label)return;sectionLabels[label.dataset.sectionLabel]=label.value||'';persist();renderPreview()});
  document.getElementById('gameSelected')?.addEventListener('change',e=>{const sel=e.target.closest?.('[data-gsection]');if(!sel)return;const id=sel.dataset.gsection;gameEdit[id]={...(gameEdit[id]||{}),section:sel.value};normalizeSections();renderAll()});

  const baseBuildTypeFilter=buildTypeFilter;
  buildTypeFilter=function(){if(mode==='xposts'){const f=document.getElementById('typeFilter');if(f)f.innerHTML='<option value="">X / Twitter</option>';return}return baseBuildTypeFilter()};
  const baseRenderCards=renderCards;
  renderCards=function(){if(mode!=='xposts')return baseRenderCards();persist();const q=String(document.getElementById('query')?.value||'').toLowerCase().trim();const list=xPosts.filter(p=>!q||`${p.title} ${p.note} ${p.url}`.toLowerCase().includes(q));const cards=document.getElementById('cards');if(!cards)return;if(!list.length){cards.innerHTML='<div class="empty">X投稿はまだありません。「＋ X POST追加」から投稿URLを登録できます。</div>';return}cards.innerHTML=list.map(p=>{const active=!!(p.newsItemId&&gameIds.includes(p.newsItemId));return `<article class="card x-source-card"><div class="thumb x-thumb">X / TWITTER SOURCE · INDEPENDENT</div><div class="cardbody"><div class="badges"><span class="badge">X POST</span><span class="badge">SOURCE LIBRARY</span></div><div class="title">${esc(p.title)}</div>${p.note?`<div class="summary">${esc(p.note)}</div>`:''}<div class="x-source-url">${esc(p.url)}</div><div class="x-independent ${active?'on':''}">${active?'● ① X紹介へ追加済み':'WAYS / DBとは独立'}</div><div class="cardactions"><a class="mini" href="${esc(p.url)}" target="_blank" rel="noopener">OPEN ↗</a><button class="mini primary" data-xnews="${esc(p.id)}">${active?'ニュース内を開く':'＋ ニュースに追加'}</button><button class="mini" data-xremove="${esc(p.id)}">削除</button></div></div></article>`}).join('')};

  const baseAddCustom=addCustom;
  addCustom=function(){if(mode!=='xposts')return baseAddCustom();const ok=addPost(document.getElementById('customUrl')?.value,document.getElementById('customTitle')?.value,document.getElementById('customText')?.value);if(!ok)return;document.getElementById('customTitle').value='';document.getElementById('customText').value='';document.getElementById('customUrl').value='';renderAll();flash('X投稿を素材庫へ追加しました')};document.getElementById('addCustom').onclick=addCustom;
  const baseClear=document.getElementById('clearMode').onclick;document.getElementById('clearMode').onclick=()=>{if(mode==='xposts'){xPosts=[];persist();renderAll();flash('X投稿の素材庫を空にしました');return}baseClear?.()};

  function addXPostToNews(postId){const p=xPosts.find(x=>x.id===postId);if(!p)return;try{let id=p.newsItemId;if(!id||!items.some(x=>x.id===id)){id=`xnews-${p.id}`;items=[{id,title:p.title||'X POST',summary:p.note||'',url:'',image:'',type:'CUSTOM',source:'X / TWITTER',weeklyVerified:true},...items.filter(x=>x.id!==id)];p.newsItemId=id}if(!gameIds.includes(id))gameIds.push(id);gameEdit[id]={...(gameEdit[id]||{}),title:p.title||'X POST',text:p.note||'',xUrl:p.url,dbUrl:'',section:'x'};try{gameTab[id]='x'}catch{}normalizeSections();persist();renderAll();setTimeout(()=>{const field=document.querySelector(`#gameSelected [data-gfield="xUrl"][data-id="${CSS.escape(id)}"]`);const card=field?.closest('.sel');const xTab=card?.querySelector('[data-gtab="x"]');if(xTab)xTab.click();card?.scrollIntoView({behavior:'smooth',block:'center'})},100);flash(`${p.title||'X投稿'} を① ${sectionLabels.x}へ追加しました`)}catch(err){flash(`追加に失敗: ${String(err?.message||err)}`)}}

  const baseCardsClick=document.getElementById('cards').onclick;
  document.getElementById('cards').onclick=e=>{if(mode!=='xposts')return baseCardsClick?.call(document.getElementById('cards'),e);const add=e.target.closest('[data-xnews]');if(add){addXPostToNews(add.dataset.xnews);return}const remove=e.target.closest('[data-xremove]');if(remove){xPosts=xPosts.filter(x=>x.id!==remove.dataset.xremove);persist();renderCards();return}};
  document.getElementById('query').oninput=()=>renderCards();document.getElementById('typeFilter').onchange=()=>renderCards();

  const updateModeUi=()=>{const add=document.getElementById('toggleCustom'),clear=document.getElementById('clearMode'),title=document.getElementById('customTitle'),url=document.getElementById('customUrl'),text=document.getElementById('customText'),auto=document.getElementById('autoFill');if(mode==='xposts'){if(add)add.textContent='＋ X POST追加';if(clear)clear.textContent='X一覧を空にする';if(auto)auto.style.display='none';if(title)title.placeholder='ゲーム名 / 投稿タイトル（任意）';if(url)url.placeholder='https://x.com/.../status/...';if(text)text.placeholder='この投稿のメモ（任意）'}else{if(add)add.textContent='＋ 手動追加';if(clear)clear.textContent='この欄を空にする';if(auto)auto.style.display='';if(title)title.placeholder='タイトル';if(url)url.placeholder='URL（任意）';if(text)text.placeholder='説明文（任意）'}persist()};tabs?.addEventListener('click',()=>setTimeout(updateModeUi,0));

  const twitterScript='<scr'+'ipt async src="https://platform.twitter.com/widgets.js" charset="utf-8"></scr'+'ipt>';
  document.getElementById('copyBundle').onclick=()=>copy(`<style>${wpCss}${sectionCss}</style>${html()}${twitterScript}`,'HTML + CSSをコピーしました');
  document.getElementById('copyHtml').onclick=()=>copy(`${html()}${twitterScript}`,'HTMLをコピーしました');
  persist();
})();