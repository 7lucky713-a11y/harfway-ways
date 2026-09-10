(() => {
  const state = { games: [], types: [], notes: [], view: 'inbox', typeFilter: 'all', gameId: '', query: '', adminKey: sessionStorage.getItem('harfway_game_notes_key') || '', editing: null, draft: { tags: [], characters: [], themes: [], media: [] }, originalMedia: [], uploadedThisSession: [], mediaUrls: new Map() };
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gameById = (id) => state.games.find(x => x.id === id);
  const typeById = (id) => state.types.find(x => x.id === id);
  const fmt = (v) => { try { return new Intl.DateTimeFormat('ja-JP', { month:'2-digit', day:'2-digit' }).format(new Date(v)); } catch { return '--'; } };
  const toast = (message, bad = false) => { const el = $('#toast'); el.textContent = message; el.style.background = bad ? '#d58d8d' : ''; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800); };
  const authHeaders = (extra = {}) => ({ ...extra, ...(state.adminKey ? { 'x-admin-key': state.adminKey } : {}) });

  async function api(path, options = {}) {
    const headers = authHeaders(options.body && !(options.body instanceof Blob) ? { 'content-type': 'application/json' } : {});
    const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json().catch(() => ({}));
    if (res.status === 401) { showLock(data?.error || 'admin_key_required'); throw Object.assign(new Error(data?.error || 'unauthorized'), { status: 401 }); }
    if (!res.ok) throw Object.assign(new Error(data?.error || `http_${res.status}`), { status: res.status, data });
    return data;
  }
  function showLock(message = '') { $('#lock-overlay').classList.add('locked'); $('#lock-message').textContent = message === 'invalid_admin_key' ? '管理キーが一致しません。' : 'HARF-WAY管理キーを入力してください。'; }
  function hideLock() { $('#lock-overlay').classList.remove('locked'); }

  async function load() {
    const data = await api('/api/game-notes');
    state.games = data.games || []; state.types = data.types || []; state.notes = data.notes || [];
    if (!state.types.length) { await api('/api/game-notes', { method:'POST', body: JSON.stringify({ entity:'bootstrap' }) }); return load(); }
    if (!state.gameId || !gameById(state.gameId)) state.gameId = state.games[0]?.id || '';
    renderAll(); hideLock();
  }

  function tagsHtml(values, accent = false) { return (values || []).map(v => `<span class="tag ${accent?'accent':''}">${esc(v)}</span>`).join(''); }
  function noteCard(n) {
    const g = gameById(n.gameId)?.name || '未登録ゲーム'; const t = typeById(n.typeId)?.name || '未分類';
    const all = [...(n.tags||[]), ...(n.characters||[]), ...(n.themes||[])];
    return `<article class="card" data-note="${esc(n.id)}"><div class="note-meta"><span>${esc(t)}</span><span>${fmt(n.updatedAt||n.createdAt)}</span></div><h3>${esc(n.title||'無題')}</h3><p>${esc(n.body)}</p>${n.media?.length?`<span class="media-count">▣ ${n.media.length} media</span>`:''}<div class="tags">${tagsHtml(all.slice(0,6))}</div><div class="note-meta" style="margin-top:10px;margin-bottom:0"><span>${esc(g)}</span><span>${n.outputStatus==='candidate'?'OUTPUT CANDIDATE':n.outputStatus==='exported'?'USED':'PRIVATE'}</span></div></article>`;
  }
  function noteRow(n) {
    const g = gameById(n.gameId)?.name || '未登録'; const t = typeById(n.typeId)?.name || '未分類'; const all = [...(n.tags||[]), ...(n.characters||[]), ...(n.themes||[])];
    return `<article class="library-item" data-note="${esc(n.id)}"><div class="kind">${esc(t)}</div><div class="game-name">${esc(g)}</div><div class="body"><h3>${esc(n.title||'無題')}</h3><p>${esc(n.body)}</p></div><div class="tags">${tagsHtml(all.slice(0,5))}</div><div class="right">${fmt(n.updatedAt||n.createdAt)}${n.media?.length?`<br>▣ ${n.media.length}`:''}</div></article>`;
  }
  function searchNotes() {
    let list = [...state.notes];
    if (state.typeFilter !== 'all') list = list.filter(n => n.typeId === state.typeFilter);
    const q = state.query.trim().toLocaleLowerCase('ja');
    if (q) list = list.filter(n => {
      const g = gameById(n.gameId)?.name || ''; const t = typeById(n.typeId)?.name || '';
      return [g,t,n.title,n.body,...(n.tags||[]),...(n.characters||[]),...(n.themes||[])].join(' ').toLocaleLowerCase('ja').includes(q);
    });
    return list;
  }
  function renderCounts() {
    $('#count-inbox').textContent = state.notes.length;
    $('#count-library').textContent = state.notes.length;
    $('#count-games').textContent = state.games.length;
    const unique = new Set(state.notes.flatMap(n => [...(n.tags||[]),...(n.characters||[]),...(n.themes||[])])); $('#count-index').textContent = unique.size;
    const candidates = state.notes.filter(n => n.outputStatus === 'candidate').length; $('#candidate-count').textContent = candidates;
  }
  function fillSelect(select, items, selected = '') {
    select.innerHTML = items.length ? items.map(x => `<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('') : '<option value="">未登録</option>';
  }
  function renderInbox() {
    fillSelect($('#quick-game'), state.games); fillSelect($('#quick-type'), state.types);
    $('#inbox-cards').innerHTML = state.notes.slice(0, 9).map(noteCard).join('') || '<div class="empty">まだ断片がありません。EDITORでゲームを追加して、最初の一件を残してください。</div>';
  }
  function renderLibrary() {
    $('#type-filters').innerHTML = `<button class="chip ${state.typeFilter==='all'?'on':''}" data-type-filter="all">ALL</button>` + state.types.map(t => `<button class="chip ${state.typeFilter===t.id?'on':''}" data-type-filter="${esc(t.id)}">${esc(t.name)}</button>`).join('');
    const list = searchNotes(); $('#library-list').innerHTML = list.map(noteRow).join('') || '<div class="empty">該当する断片がありません。</div>';
  }
  function renderGame() {
    $('#game-list').innerHTML = state.games.length ? state.games.map(g => { const c = state.notes.filter(n => n.gameId === g.id).length; return `<button class="game-choice ${g.id===state.gameId?'on':''}" data-game="${esc(g.id)}">${esc(g.name)}<small>${c} notes</small></button>`; }).join('') : '<div class="empty">ゲーム未登録</div>';
    const g = gameById(state.gameId); const notes = state.notes.filter(n => n.gameId === state.gameId);
    $('#game-title').textContent = g?.name || 'ゲームを選択'; $('#game-meta').textContent = g ? `${notes.length} fragments · PRIVATE` : 'EDITORからゲームを追加してください。';
    const tags = new Set(notes.flatMap(n => n.tags||[])); const media = notes.reduce((s,n)=>s+(n.media?.length||0),0); const cand = notes.filter(n=>n.outputStatus==='candidate').length;
    $('#game-stats').innerHTML = [['NOTES',notes.length],['MEDIA',media],['TAGS',tags.size],['OUTPUT',cand]].map(([a,b])=>`<div class="stat">${a}<b>${b}</b></div>`).join('');
    $('#game-notes').innerHTML = notes.map(noteRow).join('') || '<div class="empty">このゲームの断片はまだありません。</div>';
  }
  function aggregate(field) { const m = new Map(); state.notes.forEach(n => (n[field]||[]).forEach(v => m.set(v,(m.get(v)||0)+1))); return [...m.entries()].sort((a,b)=>b[1]-a[1]); }
  function indexRows(items) { const max = items[0]?.[1] || 1; return items.slice(0,20).map(([v,n]) => `<div class="index-row" data-index="${esc(v)}"><b>${esc(v)}</b><small>${n} notes</small><div class="bar"><i style="width:${Math.max(8,n/max*100)}%"></i></div></div>`).join('') || '<div class="empty">まだありません。</div>'; }
  function renderIndex() { $('#index-tags').innerHTML = indexRows(aggregate('tags')); $('#index-characters').innerHTML = indexRows(aggregate('characters')); $('#index-themes').innerHTML = aggregate('themes').slice(0,30).map(([v,n])=>`<button class="interest" data-index="${esc(v)}">${esc(v)} <span>${n}</span></button>`).join('') || '<div class="empty">まだありません。</div>'; }
  function renderEditor() {
    const usageGame = id => state.notes.filter(n=>n.gameId===id).length, usageType = id => state.notes.filter(n=>n.typeId===id).length;
    $('#editor-games').innerHTML = state.games.map(g=>`<div class="dict-item"><b>${esc(g.name)}</b><small>${usageGame(g.id)} notes</small><button data-delete-dict="game" data-id="${esc(g.id)}">削除</button></div>`).join('') || '<div class="empty">ゲームを追加してください。</div>';
    $('#editor-types').innerHTML = state.types.map(t=>`<div class="dict-item"><b>${esc(t.name)}</b><small>${usageType(t.id)} notes</small><button data-delete-dict="type" data-id="${esc(t.id)}">削除</button></div>`).join('');
  }
  function renderAll() { renderCounts(); renderInbox(); renderLibrary(); renderGame(); renderIndex(); renderEditor(); }
  function setView(name) { state.view = name; $$('.view').forEach(v => v.classList.toggle('show', v.id === `view-${name}`)); $$('.nav').forEach(v=>v.classList.toggle('on',v.dataset.view===name)); if(name==='library') renderLibrary(); if(name==='game')renderGame(); if(name==='index')renderIndex(); if(name==='editor')renderEditor(); }

  function resetDraft() { state.editing = null; state.originalMedia = []; state.uploadedThisSession = []; state.draft = { tags:[], characters:[], themes:[], media:[] }; $('#note-id').value=''; $('#note-title').value=''; $('#note-body').value=''; $('#note-status').value='private'; $('#note-media').value=''; $('#delete-note').classList.add('hidden'); $('#note-dialog-title').textContent='断片を追加'; fillSelect($('#note-game'),state.games,state.gameId); fillSelect($('#note-type'),state.types,state.types[0]?.id||''); renderDraftFields(); }
  function openNote(note = null, presetGame = '') {
    if (!state.games.length) { setView('editor'); toast('先にゲームを追加してください', true); return; }
    if (note) {
      state.editing = note.id; state.originalMedia = [...(note.media||[])]; state.uploadedThisSession = []; state.draft = { tags:[...(note.tags||[])], characters:[...(note.characters||[])], themes:[...(note.themes||[])], media:[...(note.media||[])] };
      $('#note-id').value=note.id; $('#note-title').value=note.title||''; $('#note-body').value=note.body||''; $('#note-status').value=note.outputStatus||'private'; $('#note-dialog-title').textContent='断片を編集'; $('#delete-note').classList.remove('hidden'); fillSelect($('#note-game'),state.games,note.gameId); fillSelect($('#note-type'),state.types,note.typeId);
    } else { resetDraft(); if(presetGame) $('#note-game').value=presetGame; }
    renderDraftFields(); $('#note-overlay').classList.add('on'); $('#note-overlay').setAttribute('aria-hidden','false'); setTimeout(()=>$('#note-body').focus(),30);
  }
  async function deleteMediaKey(key) { try { await api('/api/game-notes-media',{method:'DELETE',body:JSON.stringify({key})}); } catch {} }
  function closeNote(cleanup = true) { $('#note-overlay').classList.remove('on'); $('#note-overlay').setAttribute('aria-hidden','true'); if(cleanup && state.uploadedThisSession.length){ const keys=[...state.uploadedThisSession]; state.uploadedThisSession=[]; keys.forEach(deleteMediaKey); } }
  function renderDraftFields() {
    $$('.multi-field').forEach(field => { const key = field.dataset.multi; $('.tokens',field).innerHTML = state.draft[key].map((v,i)=>`<span class="token">${esc(v)}<button type="button" data-remove-token="${key}" data-index="${i}">×</button></span>`).join(''); });
    renderMediaList();
  }
  function addToken(field) { const input = $('input',field); const value=input.value.trim(); if(!value)return; const key=field.dataset.multi; if(!state.draft[key].some(x=>x.toLocaleLowerCase('ja')===value.toLocaleLowerCase('ja'))) state.draft[key].push(value); input.value=''; renderDraftFields(); input.focus(); }

  async function mediaBlobUrl(item) {
    if (state.mediaUrls.has(item.key)) return state.mediaUrls.get(item.key);
    const res = await fetch(`/api/game-notes-media?action=file&key=${encodeURIComponent(item.key)}`, { headers: authHeaders(), cache:'no-store' });
    if (!res.ok) return '';
    const url = URL.createObjectURL(await res.blob()); state.mediaUrls.set(item.key,url); return url;
  }
  async function renderMediaList() {
    const root = $('#note-media-list'); root.innerHTML = state.draft.media.map((m,i)=>`<div class="media-row"><div class="media-thumb" data-thumb="${i}">${m.kind==='video'?'VIDEO':'IMAGE'}</div><div><b>${esc(m.name||m.key.split('/').pop())}</b><small>${Math.round((m.size||0)/1024)} KB</small></div><button type="button" data-remove-media="${i}">削除</button></div>`).join('');
    state.draft.media.forEach(async (m,i)=>{ const box=$(`[data-thumb="${i}"]`,root); if(!box)return; const url=await mediaBlobUrl(m); if(!url)return; box.innerHTML=m.kind==='video'?`<video muted playsinline src="${url}"></video>`:`<img src="${url}" alt="">`; });
  }
  async function uploadFile(file) {
    const start = await api('/api/game-notes-media?action=start',{method:'POST',body:JSON.stringify({fileName:file.name,contentType:file.type,size:file.size})});
    const parts=Math.ceil(file.size/start.chunkBytes);
    for(let p=1;p<=parts;p++){ const blob=file.slice((p-1)*start.chunkBytes,Math.min(file.size,p*start.chunkBytes)); await api('/api/game-notes-media',{method:'PUT',body:blob,headers:{'content-type':'application/octet-stream','x-upload-id':start.uploadId,'x-part-number':String(p),'x-content-type':file.type,'x-file-size':String(file.size)}}); }
    const done=await api('/api/game-notes-media?action=complete',{method:'POST',body:JSON.stringify({uploadId:start.uploadId,fileName:file.name,contentType:file.type,size:file.size,parts})});
    return done.media;
  }
  async function handleMediaFiles(files) {
    const selected=[...files].slice(0,Math.max(0,12-state.draft.media.length));
    for(const file of selected){ toast(`アップロード中: ${file.name}`); try{ const uploaded=await uploadFile(file); state.draft.media.push(uploaded); state.uploadedThisSession.push(uploaded.key); renderDraftFields(); }catch(e){ toast(`アップロード失敗: ${e.message}`,true); } }
    $('#note-media').value='';
  }

  async function saveQuick() {
    const gameId=$('#quick-game').value,typeId=$('#quick-type').value,body=$('#quick-body').value.trim(); if(!gameId){setView('editor');toast('ゲームを追加してください',true);return} if(!typeId||!body){toast('種類とメモを入力してください',true);return}
    await api('/api/game-notes',{method:'POST',body:JSON.stringify({entity:'note',gameId,typeId,body,tags:[],characters:[],themes:[],media:[],outputStatus:'private'})}); $('#quick-body').value=''; await load(); toast('INBOXに保存しました');
  }
  async function saveNote(e) {
    e.preventDefault(); const body=$('#note-body').value.trim(); if(!body){toast('メモを入力してください',true);return}
    const existing=state.editing?state.notes.find(n=>n.id===state.editing):null; const payload={entity:'note',id:$('#note-id').value||undefined,gameId:$('#note-game').value,typeId:$('#note-type').value,title:$('#note-title').value,body,tags:state.draft.tags,characters:state.draft.characters,themes:state.draft.themes,media:state.draft.media,outputStatus:$('#note-status').value,createdAt:existing?.createdAt||undefined};
    $('#save-note').disabled=true; try{await api('/api/game-notes',{method:payload.id?'PATCH':'POST',body:JSON.stringify(payload)}); const removed=state.originalMedia.filter(m=>!state.draft.media.some(x=>x.key===m.key)).map(m=>m.key); state.uploadedThisSession=[]; closeNote(false); removed.forEach(deleteMediaKey); await load(); toast(payload.id?'更新しました':'保存しました');}catch(e2){toast(e2.message,true)}finally{$('#save-note').disabled=false}
  }
  async function deleteNote() { if(!state.editing)return; if(!confirm('この断片を削除しますか？'))return; const media=[...state.draft.media]; await api('/api/game-notes',{method:'DELETE',body:JSON.stringify({entity:'note',id:state.editing})}); state.uploadedThisSession=[]; closeNote(false); media.forEach(m=>deleteMediaKey(m.key)); await load(); toast('削除しました'); }
  async function addDictionary(entity,name){ await api('/api/game-notes',{method:'POST',body:JSON.stringify({entity,name})}); await load(); toast(`${entity==='game'?'ゲーム':'種類'}を追加しました`); }
  async function deleteDictionary(entity,id){ try{await api('/api/game-notes',{method:'DELETE',body:JSON.stringify({entity,id})});await load();toast('削除しました')}catch(e){if(e.data?.error==='dictionary_in_use')toast(`${e.data.count}件のメモで使用中です`,true);else toast(e.message,true)} }

  $('#unlock-form').addEventListener('submit',async e=>{e.preventDefault();const key=$('#admin-key').value.trim();if(!key)return;state.adminKey=key;sessionStorage.setItem('harfway_game_notes_key',key);try{await load();$('#admin-key').value=''}catch(err){if(err.status!==401)toast(err.message,true)}});
  $('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
  $('#open-note').addEventListener('click',()=>openNote()); $('#quick-full').addEventListener('click',()=>openNote(null,$('#quick-game').value)); $('#quick-save').addEventListener('click',()=>saveQuick().catch(e=>toast(e.message,true))); $('#game-add').addEventListener('click',()=>openNote(null,state.gameId));
  $('#note-form').addEventListener('submit',saveNote); $('#delete-note').addEventListener('click',()=>deleteNote().catch(e=>toast(e.message,true))); $$('[data-close="note"]').forEach(b=>b.addEventListener('click',closeNote)); $('#note-overlay').addEventListener('click',e=>{if(e.target.id==='note-overlay')closeNote()});
  $$('.multi-field').forEach(field=>{ $('.multi-input button',field).addEventListener('click',()=>addToken(field)); $('.multi-input input',field).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addToken(field)}}); });
  $('#note-form').addEventListener('click',e=>{const b=e.target.closest('[data-remove-token]');if(b){state.draft[b.dataset.removeToken].splice(Number(b.dataset.index),1);renderDraftFields()} const m=e.target.closest('[data-remove-media]');if(m){const item=state.draft.media.splice(Number(m.dataset.removeMedia),1)[0];if(item&&state.uploadedThisSession.includes(item.key)){state.uploadedThisSession=state.uploadedThisSession.filter(k=>k!==item.key);deleteMediaKey(item.key)}renderDraftFields()}});
  $('#note-media').addEventListener('change',e=>handleMediaFiles(e.target.files));
  $('#type-filters').addEventListener('click',e=>{const b=e.target.closest('[data-type-filter]');if(!b)return;state.typeFilter=b.dataset.typeFilter;renderLibrary()});
  $('#library-list').addEventListener('click',e=>{const row=e.target.closest('[data-note]');if(row)openNote(state.notes.find(n=>n.id===row.dataset.note))}); $('#inbox-cards').addEventListener('click',e=>{const row=e.target.closest('[data-note]');if(row)openNote(state.notes.find(n=>n.id===row.dataset.note))}); $('#game-notes').addEventListener('click',e=>{const row=e.target.closest('[data-note]');if(row)openNote(state.notes.find(n=>n.id===row.dataset.note))});
  $('#game-list').addEventListener('click',e=>{const b=e.target.closest('[data-game]');if(!b)return;state.gameId=b.dataset.game;renderGame()});
  $('#search').addEventListener('input',e=>{state.query=e.target.value;setView('library');renderLibrary()});
  $('#candidate-filter').addEventListener('click',()=>{state.query='';state.typeFilter='all';setView('library');const list=state.notes.filter(n=>n.outputStatus==='candidate');$('#library-list').innerHTML=list.map(noteRow).join('')||'<div class="empty">出力候補はありません。</div>'});
  $('#dig').addEventListener('click',()=>{if(!state.notes.length)return;const n=state.notes[Math.floor(Math.random()*state.notes.length)];const q=n.tags?.[0]||n.themes?.[0]||n.characters?.[0]||gameById(n.gameId)?.name||'';state.query=q;$('#search').value=q;setView('library');renderLibrary();toast(`「${q}」を掘り返しました`)});
  $('#index-tags').addEventListener('click',indexClick); $('#index-characters').addEventListener('click',indexClick); $('#index-themes').addEventListener('click',indexClick); function indexClick(e){const b=e.target.closest('[data-index]');if(!b)return;state.query=b.dataset.index;$('#search').value=state.query;setView('library');renderLibrary()}
  $('#game-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#game-name'),name=input.value.trim();if(!name)return;try{await addDictionary('game',name);input.value=''}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名ゲームは登録済みです':err.message,true)}});
  $('#type-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#type-name'),name=input.value.trim();if(!name)return;try{await addDictionary('type',name);input.value=''}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名の種類は登録済みです':err.message,true)}});
  $('#view-editor').addEventListener('click',e=>{const b=e.target.closest('[data-delete-dict]');if(!b)return;if(confirm('未使用なら削除します。よろしいですか？'))deleteDictionary(b.dataset.deleteDict,b.dataset.id)});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()} if(e.key==='Escape')closeNote()});

  load().catch(err=>{ if(err.status!==401){showLock('');$('#lock-message').textContent=`読み込みエラー: ${err.message}`;} });
})();
