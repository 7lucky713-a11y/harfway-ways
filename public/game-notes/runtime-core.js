(() => {
  const state = {
    games: [], types: [], facets: [], notes: [], view: 'inbox', gameId: '', query: '',
    filters: { gameId: 'all', typeId: 'all', status: 'all', facets: {} },
    cross: { facetId: '', value: '', sort: 'games', route: 'all' },
    adminKey: sessionStorage.getItem('harfway_game_notes_key') || '', editing: null,
    draft: { facets: {}, media: [] }, originalMedia: [], uploadedThisSession: [], mediaUrls: new Map()
  };
  const LEGACY_FACET_IDS = new Set(['tags', 'characters', 'themes']);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gameById = (id) => state.games.find(x => x.id === id);
  const typeById = (id) => state.types.find(x => x.id === id);
  const facetById = (id) => state.facets.find(x => x.id === id);
  const visibleFacets = () => state.facets.filter(f => !LEGACY_FACET_IDS.has(f.id));
  const fmt = (v) => { try { return new Intl.DateTimeFormat('ja-JP', { month:'2-digit', day:'2-digit' }).format(new Date(v)); } catch { return '--'; } };
  const toast = (message, bad = false) => { const el = $('#toast'); el.textContent = message; el.style.background = bad ? '#d58d8d' : ''; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800); };
  const authHeaders = (extra = {}) => ({ ...extra, ...(state.adminKey ? { 'x-admin-key': state.adminKey } : {}) });
  const noteFacetValues = (note) => visibleFacets().flatMap(f => note?.facets?.[f.id] || []).filter(Boolean);
  const DESTINATIONS = ['seo','essay','zine','reference','b2b'];
  const DESTINATION_LABELS = {seo:'SEO',essay:'ESSAY',zine:'ZINE',reference:'REFERENCE',b2b:'B2B'};
  const destinationLabel = id => DESTINATION_LABELS[id] || String(id || '').toUpperCase();

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
    state.games = data.games || []; state.types = data.types || []; state.facets = data.facets || []; state.notes = data.notes || [];
    if (!state.types.length || data.facetConfigured === false) {
      await api('/api/game-notes', { method:'POST', body: JSON.stringify({ entity:'bootstrap' }) });
      return load();
    }
    if (!state.gameId || !gameById(state.gameId)) state.gameId = state.games[0]?.id || '';
    const visible = new Set(visibleFacets().map(f => f.id));
    for (const key of Object.keys(state.filters.facets)) if (!visible.has(key)) delete state.filters.facets[key];
    if (!state.cross.facetId || !visible.has(state.cross.facetId)) state.cross.facetId = visibleFacets()[0]?.id || '';
    renderAll(); hideLock();
  }

  function tagsHtml(values, accent = false) { return (values || []).map(v => `<span class="tag ${accent?'accent':''}">${esc(v)}</span>`).join(''); }
  function noteCard(n) {
    const g = gameById(n.gameId)?.name || '未登録ゲーム'; const t = typeById(n.typeId)?.name || '未分類';
    const all = noteFacetValues(n);
    return `<article class="card" data-note="${esc(n.id)}"><div class="note-meta"><span>${esc(t)}</span><span>${fmt(n.updatedAt||n.createdAt)}</span></div><h3>${esc(n.title||'無題')}</h3><p>${esc(n.body)}</p>${n.media?.length?`<span class="media-count">▣ ${n.media.length} media</span>`:''}<div class="tags">${tagsHtml(all.slice(0,6))}</div><div class="note-meta" style="margin-top:10px;margin-bottom:0"><span>${esc(g)}</span><span>${n.outputStatus==='candidate'?'OUTPUT CANDIDATE':n.outputStatus==='exported'?'USED':'STOCK'}</span></div></article>`;
  }
  function noteRow(n) {
    const g = gameById(n.gameId)?.name || '未登録'; const t = typeById(n.typeId)?.name || '未分類'; const all = noteFacetValues(n);
    return `<article class="library-item" data-note="${esc(n.id)}"><div class="kind">${esc(t)}</div><div class="game-name">${esc(g)}</div><div class="body"><h3>${esc(n.title||'無題')}</h3><p>${esc(n.body)}</p></div><div class="tags">${tagsHtml(all.slice(0,5))}</div><div class="right">${fmt(n.updatedAt||n.createdAt)}${n.media?.length?`<br>▣ ${n.media.length}`:''}</div></article>`;
  }

  function searchNotes() {
    let list = [...state.notes];
    if (state.filters.gameId !== 'all') list = list.filter(n => n.gameId === state.filters.gameId);
    if (state.filters.typeId !== 'all') list = list.filter(n => n.typeId === state.filters.typeId);
    if (state.filters.status !== 'all') list = list.filter(n => n.outputStatus === state.filters.status);
    for (const [facetId, selected] of Object.entries(state.filters.facets)) {
      if (!selected?.length) continue;
      list = list.filter(n => {
        const values = n.facets?.[facetId] || [];
        return selected.some(value => values.includes(value));
      });
    }
    const q = state.query.trim().toLocaleLowerCase('ja');
    if (q) list = list.filter(n => {
      const g = gameById(n.gameId)?.name || ''; const t = typeById(n.typeId)?.name || '';
      return [g,t,n.title,n.body,...noteFacetValues(n)].join(' ').toLocaleLowerCase('ja').includes(q);
    });
    return list;
  }

  function renderCounts() {
    $('#count-inbox').textContent = state.notes.length;
    $('#count-library').textContent = state.notes.length;
    $('#count-games').textContent = state.games.length;
    const unique = new Set(state.notes.flatMap(noteFacetValues)); $('#count-index').textContent = unique.size;
    $('#candidate-count').textContent = state.notes.filter(n => n.outputStatus === 'candidate').length;
    if ($('#count-crosscut')) $('#count-crosscut').textContent = crossGroups().length;
    if ($('#count-promotion')) $('#count-promotion').textContent = crossGroups().filter(g => Object.values(g.destinationCounts).some(Boolean)).length;
  }
  function fillSelect(select, items, selected = '', allLabel = '') {
    if (!select) return;
    const lead = allLabel ? `<option value="all">${esc(allLabel)}</option>` : '';
    select.innerHTML = lead + (items.length ? items.map(x => `<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('') : (!allLabel ? '<option value="">未登録</option>' : ''));
    if (allLabel && selected) select.value = selected;
  }
  function renderInbox() {
    fillSelect($('#quick-game'), state.games); fillSelect($('#quick-type'), state.types);
    $('#inbox-cards').innerHTML = state.notes.slice(0, 9).map(noteCard).join('') || '<div class="empty">まだ断片がありません。EDITORでゲームを追加して、最初の一件を残してください。</div>';
  }

  function facetValueCounts(facetId) {
    const map = new Map();
    state.notes.forEach(n => (n.facets?.[facetId] || []).forEach(v => map.set(v, (map.get(v) || 0) + 1)));
    return [...map.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'ja'));
  }
  function renderFilters() {
    fillSelect($('#filter-game'), state.games, state.filters.gameId, 'すべてのゲーム');
    fillSelect($('#filter-type'), state.types, state.filters.typeId, 'すべての種類');
    if ($('#filter-status')) $('#filter-status').value = state.filters.status;
    const root = $('#facet-filters');
    root.innerHTML = visibleFacets().map(f => {
      const selected = state.filters.facets[f.id] || [];
      const values = facetValueCounts(f.id);
      return `<div class="facet-filter-group"><b>${esc(f.name)}</b><div class="facet-filter-values">${values.length ? values.map(([v,n])=>`<button type="button" class="facet-filter-chip ${selected.includes(v)?'on':''}" data-filter-facet="${esc(f.id)}" data-filter-value="${esc(v)}">${esc(v)} <span>${n}</span></button>`).join('') : '<small>まだ値がありません</small>'}</div></div>`;
    }).join('') || '<div class="empty">EDITORでファセットを追加すると、ここから絞り込めます。</div>';
    const activeFacetCount = Object.values(state.filters.facets).reduce((n,v)=>n+(v?.length||0),0);
    const activeBase = [state.filters.gameId,state.filters.typeId,state.filters.status].filter(v=>v!=='all').length;
    $('#filter-active-count').textContent = activeFacetCount + activeBase;
  }
  function renderLibrary() {
    renderFilters();
    const list = searchNotes();
    $('#filter-result-count').textContent = `${list.length} / ${state.notes.length}件`;
    $('#library-list').innerHTML = list.map(noteRow).join('') || '<div class="empty">該当する断片がありません。</div>';
  }

  function renderGame() {
    $('#game-list').innerHTML = state.games.length ? state.games.map(g => { const c = state.notes.filter(n => n.gameId === g.id).length; return `<button class="game-choice ${g.id===state.gameId?'on':''}" data-game="${esc(g.id)}">${esc(g.name)}<small>${c} notes</small></button>`; }).join('') : '<div class="empty">ゲーム未登録</div>';
    const g = gameById(state.gameId); const notes = state.notes.filter(n => n.gameId === state.gameId);
    $('#game-title').textContent = g?.name || 'ゲームを選択'; $('#game-meta').textContent = g ? `${notes.length} fragments · PRIVATE` : 'EDITORからゲームを追加してください。';
    const values = new Set(notes.flatMap(noteFacetValues)); const media = notes.reduce((s,n)=>s+(n.media?.length||0),0); const cand = notes.filter(n=>n.outputStatus==='candidate').length;
    $('#game-stats').innerHTML = [['NOTES',notes.length],['MEDIA',media],['FACETS',values.size],['OUTPUT',cand]].map(([a,b])=>`<div class="stat">${a}<b>${b}</b></div>`).join('');
    $('#game-notes').innerHTML = notes.map(noteRow).join('') || '<div class="empty">このゲームの断片はまだありません。</div>';
  }

  function indexRows(facet, items) {
    const max = items[0]?.[1] || 1;
    return items.slice(0,30).map(([v,n]) => `<div class="index-row" data-index-facet="${esc(facet.id)}" data-index-value="${esc(v)}"><b>${esc(v)}</b><small>${n} notes</small><div class="bar"><i style="width:${Math.max(8,n/max*100)}%"></i></div></div>`).join('') || '<div class="empty">まだありません。</div>';
  }
  function renderIndex() {
    $('#facet-index').innerHTML = visibleFacets().map(f => `<div class="panel"><h2>${esc(f.name)}</h2><div>${indexRows(f, facetValueCounts(f.id))}</div></div>`).join('') || '<div class="empty">EDITORでファセットを追加してください。</div>';
  }


  function crossGroups() {
    const facetId = state.cross.facetId;
    if (!facetId) return [];
    const groups = new Map();
    state.notes.forEach(note => {
      (note.facets?.[facetId] || []).forEach(value => {
        if (!groups.has(value)) groups.set(value,{value,notes:[],games:new Set(),candidate:0,destinationCounts:Object.fromEntries(DESTINATIONS.map(x=>[x,0]))});
        const g=groups.get(value);g.notes.push(note);if(note.gameId)g.games.add(note.gameId);if(note.outputStatus==='candidate')g.candidate++;
        (note.destinations||[]).forEach(d=>{if(Object.prototype.hasOwnProperty.call(g.destinationCounts,d))g.destinationCounts[d]++});
      });
    });
    const list=[...groups.values()].map(g=>({...g,gameCount:g.games.size,noteCount:g.notes.length}));
    const key=state.cross.sort==='notes'?'noteCount':state.cross.sort==='candidate'?'candidate':'gameCount';
    return list.sort((a,b)=>b[key]-a[key]||b.noteCount-a.noteCount||a.value.localeCompare(b.value,'ja'));
  }
  function renderCrosscut() {
    const facets=visibleFacets(),select=$('#cross-facet');if(!select)return;
    fillSelect(select,facets,state.cross.facetId);
    const groups=crossGroups(); if (!state.cross.value || !groups.some(g=>g.value===state.cross.value)) state.cross.value=groups[0]?.value||'';
    const multi=groups.filter(g=>g.gameCount>=3).length, candidates=groups.reduce((n,g)=>n+g.candidate,0);
    $('#cross-summary').innerHTML=[['テーマ',groups.length],['3作品以上',multi],['候補メモ',candidates],['総メモ',groups.reduce((n,g)=>n+g.noteCount,0)]].map(([label,value])=>`<div><small>${label}</small><b>${value}</b></div>`).join('');
    $$('[data-cross-sort]').forEach(b=>b.classList.toggle('on',b.dataset.crossSort===state.cross.sort));
    $('#cross-grid').innerHTML=groups.length?groups.map(g=>`<article class="cross-card ${g.value===state.cross.value?'on':''}" data-cross-value="${esc(g.value)}"><div class="cross-card-head"><h3>${esc(g.value)}</h3><span>${g.gameCount} GAMES</span></div><div class="cross-metrics"><div><b>${g.noteCount}</b>NOTES</div><div><b>${g.candidate}</b>CAND.</div><div><b>${Object.values(g.destinationCounts).filter(Boolean).length}</b>ROUTES</div></div><div class="cross-games">${[...g.games].slice(0,4).map(id=>`<span>${esc(gameById(id)?.name||'未登録')}</span>`).join('')}</div></article>`).join(''):'<div class="empty">このファセットにはまだ横断できる値がありません。</div>';
    renderCrossDetail(groups.find(g=>g.value===state.cross.value));
  }
  function renderCrossDetail(group) {
    const root=$('#cross-detail');if(!root)return;if(!group){root.innerHTML='';return}
    const facet=facetById(state.cross.facetId);
    root.innerHTML=`<div class="cross-detail-head"><div><small>${esc(facet?.name||'FACET')} · ${group.gameCount}作品 / ${group.noteCount}メモ</small><h2>${esc(group.value)}</h2></div><button class="ghost" data-open-cross-library>元ノートを絞り込む</button></div><div class="cross-detail-body"><div class="cross-notes">${group.notes.slice(0,12).map(n=>`<article data-cross-note="${esc(n.id)}"><div><span>${esc(gameById(n.gameId)?.name||'未登録')}</span><span>·</span><span>${esc(typeById(n.typeId)?.name||'未分類')}</span></div><b>${esc(n.title||'無題')}</b><p>${esc(n.body)}</p></article>`).join('')}</div><aside class="cross-routes"><h3>この横串をどこへ送る？</h3><p>該当ノートへ出口候補を付けるだけで、自動公開はしません。</p>${DESTINATIONS.map(d=>{const count=group.destinationCounts[d]||0,full=count===group.noteCount&&group.noteCount>0;return `<button class="cross-route ${count?'on':''} ${full?'full':''}" data-cross-destination="${d}" data-enabled="${full?'false':'true'}"><b>${destinationLabel(d)}</b><span>${count}/${group.noteCount}</span></button>`}).join('')}</aside></div>`;
  }
  function renderPromotion() {
    const groups=crossGroups();
    $('#promotion-routes').innerHTML=['all',...DESTINATIONS].map(r=>`<button class="chip ${state.cross.route===r?'on':''}" data-promotion-route="${r}">${r==='all'?'ALL':destinationLabel(r)}</button>`).join('');
    const rows=[];
    groups.forEach(g=>DESTINATIONS.forEach(d=>{const count=g.destinationCounts[d]||0;if(count && (state.cross.route==='all'||state.cross.route===d))rows.push({group:g,destination:d,count})}));
    $('#promotion-list').innerHTML=rows.length?rows.map(x=>`<article class="promotion-row" data-promotion-value="${esc(x.group.value)}"><div class="promotion-kind">${destinationLabel(x.destination)}<span>${esc(facetById(state.cross.facetId)?.name||'FACET')}</span></div><div><b>${esc(x.group.value)}</b><p>${x.group.gameCount}作品 · ${x.group.noteCount}メモ · ${x.count}件が候補</p></div><button class="ghost">横串を見る</button></article>`).join(''):'<div class="empty">まだ昇格候補はありません。横串から必要なものだけ選んでください。</div>';
  }
  function selectedDestinations() { return $$('#note-destinations input:checked').map(x=>x.value).filter(v=>DESTINATIONS.includes(v)); }
  function setDestinationChecks(values=[]) { const set=new Set(values||[]); $$('#note-destinations input').forEach(x=>x.checked=set.has(x.value)); }

  function facetUsage(id) { return state.notes.filter(n => (n.facets?.[id] || []).length).length; }
  function renderEditor() {
    const usageGame = id => state.notes.filter(n=>n.gameId===id).length, usageType = id => state.notes.filter(n=>n.typeId===id).length;
    $('#editor-games').innerHTML = state.games.map(g=>`<div class="dict-item editable"><input value="${esc(g.name)}" data-game-name="${esc(g.id)}" aria-label="ゲーム名"><small>${usageGame(g.id)} notes</small><button class="dict-save" data-save-game="${esc(g.id)}">保存</button><button data-delete-dict="game" data-id="${esc(g.id)}">削除</button></div>`).join('') || '<div class="empty">ゲームを追加してください。</div>';
    $('#editor-types').innerHTML = state.types.map(t=>`<div class="dict-item editable"><input value="${esc(t.name)}" data-type-name="${esc(t.id)}" aria-label="種類名"><small>${usageType(t.id)} notes</small><button class="dict-save" data-save-type="${esc(t.id)}">保存</button><button data-delete-dict="type" data-id="${esc(t.id)}">削除</button></div>`).join('');
    $('#editor-facets').innerHTML = visibleFacets().map(f=>`<div class="facet-dict-item"><input value="${esc(f.name)}" data-facet-name="${esc(f.id)}" aria-label="ファセット名"><small>${facetUsage(f.id)} notes</small><button class="ghost" data-save-facet="${esc(f.id)}">保存</button><button class="facet-delete" data-delete-dict="facet" data-id="${esc(f.id)}">削除</button></div>`).join('') || '<div class="empty">分類軸を追加してください。</div>';
  }
  function renderAll() { renderCounts(); renderInbox(); renderLibrary(); renderGame(); renderCrosscut(); renderPromotion(); renderIndex(); renderEditor(); }
  function setView(name) { state.view = name; $$('.view').forEach(v => v.classList.toggle('show', v.id === `view-${name}`)); $$('.nav').forEach(v=>v.classList.toggle('on',v.dataset.view===name)); if(name==='library')renderLibrary(); if(name==='game')renderGame(); if(name==='crosscut')renderCrosscut(); if(name==='promotion')renderPromotion(); if(name==='index')renderIndex(); if(name==='editor')renderEditor(); }

  function emptyFacetDraft(noteFacets = {}) {
    const facets = {};
    for (const [id, values] of Object.entries(noteFacets || {})) facets[id] = [...(values || [])];
    return facets;
  }
  function resetDraft() {
    state.editing = null; state.originalMedia = []; state.uploadedThisSession = []; state.draft = { facets: emptyFacetDraft(), media: [] };
    $('#note-id').value=''; $('#note-title').value=''; $('#note-body').value=''; $('#note-status').value='private'; setDestinationChecks([]); $('#note-media').value=''; $('#delete-note').classList.add('hidden'); $('#note-dialog-title').textContent='断片を追加'; fillSelect($('#note-game'),state.games,state.gameId); fillSelect($('#note-type'),state.types,state.types[0]?.id||''); renderDraftFields();
  }
  function openNote(note = null, presetGame = '') {
    if (!state.games.length) { setView('editor'); toast('先にゲームを追加してください', true); return; }
    if (note) {
      state.editing = note.id; state.originalMedia = [...(note.media||[])]; state.uploadedThisSession = []; state.draft = { facets: emptyFacetDraft(note.facets || {}), media:[...(note.media||[])] };
      $('#note-id').value=note.id; $('#note-title').value=note.title||''; $('#note-body').value=note.body||''; $('#note-status').value=note.outputStatus||'private'; setDestinationChecks(note.destinations||[]); $('#note-dialog-title').textContent='断片を編集'; $('#delete-note').classList.remove('hidden'); fillSelect($('#note-game'),state.games,note.gameId); fillSelect($('#note-type'),state.types,note.typeId);
    } else { resetDraft(); if(presetGame) $('#note-game').value=presetGame; }
    renderDraftFields(); $('#note-overlay').classList.add('on'); $('#note-overlay').setAttribute('aria-hidden','false'); setTimeout(()=>$('#note-body').focus(),30);
  }
  async function deleteMediaKey(key) { try { await api('/api/game-notes-media',{method:'DELETE',body:JSON.stringify({key})}); } catch {} }
  function closeNote(cleanup = true) { $('#note-overlay').classList.remove('on'); $('#note-overlay').setAttribute('aria-hidden','true'); if(cleanup && state.uploadedThisSession.length){ const media=[...state.uploadedThisSession]; state.uploadedThisSession=[]; media.forEach(trashMediaAsset); } }
  function renderDraftFields() {
    const facets = visibleFacets();
    const selected = facets.filter(f => Object.prototype.hasOwnProperty.call(state.draft.facets, f.id));
    const available = facets.filter(f => !Object.prototype.hasOwnProperty.call(state.draft.facets, f.id));
    const picker = facets.length
      ? `<div class="full multi-field" style="padding:14px;border:1px solid var(--line);border-radius:10px;background:#151a17"><b>ファセット</b><span class="help">必要な分類軸だけ選んで追加します。</span><div class="multi-input"><select id="note-facet-picker" ${available.length?'':'disabled'}><option value="">${available.length?'追加するファセットを選択':'追加できるファセットはありません'}</option>${available.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select><button type="button" data-attach-facet ${available.length?'':'disabled'}>＋ 追加</button></div></div>`
      : '<div class="empty">ファセットはEDITORから自由に追加できます。</div>';
    const fields = selected.map(f => `<div class="full multi-field facet-field" data-facet-id="${esc(f.id)}"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><b>${esc(f.name)}</b><button type="button" class="ghost" data-remove-facet-field="${esc(f.id)}" style="padding:6px 9px;font-size:10px">外す</button></div><div class="multi-input"><input placeholder="1件ずつ入力" /><button type="button" data-add-facet-token="${esc(f.id)}">決定</button></div><div class="tokens">${(state.draft.facets[f.id]||[]).map((v,i)=>`<span class="token">${esc(v)}<button type="button" data-remove-facet-token="${esc(f.id)}" data-index="${i}">×</button></span>`).join('')}</div></div>`).join('');
    $('#note-facets').innerHTML = picker + fields;
    renderMediaList();
  }
  function attachFacetFromPicker() {
    const select = $('#note-facet-picker');
    const id = select?.value || '';
    if (!id || !visibleFacets().some(f => f.id === id)) return;
    state.draft.facets[id] ||= [];
    renderDraftFields();
    const input = $(`[data-facet-id="${CSS.escape(id)}"] input`, $('#note-facets'));
    input?.focus();
  }
  function addFacetToken(field) {
    const input = $('input', field); const value = input?.value.trim(); if(!value)return;
    const id = field.dataset.facetId; state.draft.facets[id] ||= [];
    if(!state.draft.facets[id].some(x=>x.toLocaleLowerCase('ja')===value.toLocaleLowerCase('ja'))) state.draft.facets[id].push(value);
    input.value=''; renderDraftFields(); const next=$(`[data-facet-id="${CSS.escape(id)}"] input`,$('#note-facets')); next?.focus();
  }

  async function mediaBlobUrl(item) {
    const cacheKey = item.assetId || item.key;
    if (state.mediaUrls.has(cacheKey)) return state.mediaUrls.get(cacheKey);
    const path = item.assetId
      ? `/api/media-library?action=file&id=${encodeURIComponent(item.assetId)}`
      : `/api/game-notes-media?action=file&key=${encodeURIComponent(item.key)}`;
    const res = await fetch(path, { headers: authHeaders(), cache:'no-store' });
    if (!res.ok) return '';
    const url = URL.createObjectURL(await res.blob()); state.mediaUrls.set(cacheKey,url); return url;
  }
  async function renderMediaList() {
    const root = $('#note-media-list');
    root.innerHTML = state.draft.media.map((m,i)=>`<div class="media-row"><div class="media-thumb" data-thumb="${i}">${m.kind==='video'?'VIDEO':'IMAGE'}</div><div><b>${esc(m.name||m.key.split('/').pop())}</b><small>${Math.round((m.size||0)/1024)} KB · ${m.assetId?'LIBRARY':'LEGACY'}</small><label class="media-public"><input type="checkbox" data-public-media="${i}" ${m.public?'checked':''}> 公開ページに含める</label></div><button type="button" data-remove-media="${i}">外す</button></div>`).join('');
    state.draft.media.forEach(async (m,i)=>{ const box=$(`[data-thumb="${i}"]`,root); if(!box)return; const url=await mediaBlobUrl(m); if(!url)return; box.innerHTML=m.kind==='video'?`<video muted playsinline src="${url}"></video>`:`<img src="${url}" alt="">`; });
  }
  async function uploadFile(file) {
    const start = await api('/api/game-notes-media?action=start',{method:'POST',body:JSON.stringify({fileName:file.name,contentType:file.type,size:file.size})});
    const parts=Math.ceil(file.size/start.chunkBytes);
    for(let p=1;p<=parts;p++){ const blob=file.slice((p-1)*start.chunkBytes,Math.min(file.size,p*start.chunkBytes)); await api('/api/game-notes-media',{method:'PUT',body:blob,headers:{'content-type':'application/octet-stream','x-upload-id':start.uploadId,'x-part-number':String(p),'x-content-type':file.type,'x-file-size':String(file.size)}}); }
    const done=await api('/api/game-notes-media?action=complete',{method:'POST',body:JSON.stringify({uploadId:start.uploadId,fileName:file.name,contentType:file.type,size:file.size,parts})});
    try {
      const gameId = $('#note-game')?.value || $('#quick-game')?.value || '';
      const gameName = gameById(gameId)?.name || '';
      const registered = await api('/api/media-library',{method:'POST',body:JSON.stringify({action:'register',key:done.media.key,name:file.name,mimeType:file.type,size:file.size,gameId,gameName})});
      return {...done.media,assetId:registered.asset.id,public:false,alt:registered.asset.alt||'',caption:registered.asset.caption||''};
    } catch (error) {
      await deleteMediaKey(done.media.key);
      throw error;
    }
  }
  async function ensureMediaAssets(media) {
    for (const item of media) {
      if (item.assetId) continue;
      const gameId = $('#note-game')?.value || '';
      const gameName = gameById(gameId)?.name || '';
      const registered = await api('/api/media-library',{method:'POST',body:JSON.stringify({action:'register',key:item.key,name:item.name||'',mimeType:item.type||'',size:item.size||0,gameId,gameName})});
      item.assetId = registered.asset.id;
      item.alt ||= registered.asset.alt || '';
      item.caption ||= registered.asset.caption || '';
      item.public = item.public === true;
    }
    return media;
  }
  async function trashMediaAsset(item) {
    if (item?.assetId) {
      try { await api('/api/media-library',{method:'POST',body:JSON.stringify({action:'trash',id:item.assetId})}); } catch {}
      return;
    }
    if (item?.key) await deleteMediaKey(item.key);
  }
  async function handleMediaFiles(files) {
    const selected=[...files].slice(0,Math.max(0,12-state.draft.media.length));
    for(const file of selected){ toast(`アップロード中: ${file.name}`); try{ const uploaded=await uploadFile(file); state.draft.media.push(uploaded); state.uploadedThisSession.push(uploaded); renderDraftFields(); }catch(e){ toast(`アップロード失敗: ${e.message}`,true); } }
    $('#note-media').value='';
  }

  let mediaPickerItems = [];
  async function loadMediaPicker() {
    const d = await api('/api/media-library');
    mediaPickerItems = (d.items||[]).filter(a=>a.status==='active'||a.status==='unregistered').filter(a=>a.kind==='image'||a.kind==='video');
    renderMediaPicker();
  }
  function renderMediaPicker() {
    const q = ($('#media-picker-search')?.value||'').toLowerCase();
    const rows = mediaPickerItems.filter(a=>!q||[a.name,a.r2Key,a.gameName,...(a.tags||[])].join(' ').toLowerCase().includes(q));
    const root=$('#media-picker-grid'); if(!root)return;
    root.innerHTML=rows.slice(0,160).map(a=>`<button type="button" class="media-pick-card" data-pick-key="${esc(a.r2Key)}"><span>${esc(String(a.kind).toUpperCase())}</span><b>${esc(a.name||a.r2Key)}</b><small>${esc(a.gameName||a.storagePurpose||'')}${a.registered?'':' · 未登録'}</small></button>`).join('')||'<div class="empty">素材がありません。</div>';
  }
  async function attachPickerAsset(key) {
    let a=mediaPickerItems.find(x=>x.r2Key===key); if(!a)return;
    if(!a.registered){const reg=await api('/api/media-library',{method:'POST',body:JSON.stringify({action:'register',key:a.r2Key,name:a.name,gameId:$('#note-game').value,gameName:gameById($('#note-game').value)?.name||''})});a=reg.asset}
    if(state.draft.media.length>=12){toast('添付できる素材は12件までです',true);return}
    if(state.draft.media.some(x=>(x.assetId&&x.assetId===a.id)||x.key===a.r2Key)){toast('この素材は添付済みです');return}
    state.draft.media.push({key:a.r2Key,assetId:a.id,type:a.mimeType||'',kind:a.kind,size:a.size||0,name:a.name||a.originalName||'',public:false,alt:a.alt||'',caption:a.caption||''});
    renderDraftFields(); toast('ライブラリから追加しました');
  }
  function openMediaPicker(){ $('#media-picker-overlay')?.classList.add('on'); $('#media-picker-overlay')?.setAttribute('aria-hidden','false'); loadMediaPicker().catch(e=>toast(e.message,true)); }
  function closeMediaPicker(){ $('#media-picker-overlay')?.classList.remove('on'); $('#media-picker-overlay')?.setAttribute('aria-hidden','true'); }

  async function saveQuick() {
    const gameId=$('#quick-game').value,typeId=$('#quick-type').value,body=$('#quick-body').value.trim();
    if(!gameId){setView('editor');toast('ゲームを追加してください',true);return}
    if(!typeId||!body){toast('種類とメモを入力してください',true);return}
    const mediaInput=$('#quick-media');
    const files=[...(mediaInput?.files||[])].slice(0,12);
    const uploaded=[];
    const saveButton=$('#quick-save');
    if(saveButton)saveButton.disabled=true;
    try{
      for(const file of files){
        toast(`アップロード中: ${file.name}`);
        uploaded.push(await uploadFile(file));
      }
      await api('/api/game-notes',{method:'POST',body:JSON.stringify({entity:'note',gameId,typeId,body,facets:{},media:uploaded,outputStatus:'private',destinations:[]})});
      $('#quick-body').value='';
      if(mediaInput)mediaInput.value='';
      await load();
      toast(files.length?`INBOXに保存しました（素材${files.length}件）`:'INBOXに保存しました');
    }catch(error){
      await Promise.all(uploaded.map(item=>trashMediaAsset(item)));
      throw error;
    }finally{
      if(saveButton)saveButton.disabled=false;
    }
  }
  async function saveNote(e) {
    e.preventDefault(); const body=$('#note-body').value.trim(); if(!body){toast('メモを入力してください',true);return}
    const existing=state.editing?state.notes.find(n=>n.id===state.editing):null;
    $('#save-note').disabled=true;
    try{
      await ensureMediaAssets(state.draft.media);
      const payload={entity:'note',id:$('#note-id').value||undefined,gameId:$('#note-game').value,typeId:$('#note-type').value,title:$('#note-title').value,body,facets:state.draft.facets,media:state.draft.media,outputStatus:$('#note-status').value,destinations:selectedDestinations(),createdAt:existing?.createdAt||undefined};
      await api('/api/game-notes',{method:payload.id?'PATCH':'POST',body:JSON.stringify(payload)});
      state.uploadedThisSession=[]; closeNote(false); await load(); toast(payload.id?'更新しました':'保存しました');
    }catch(e2){toast(e2.message,true)}finally{$('#save-note').disabled=false}
  }
  async function deleteNote() { if(!state.editing)return; if(!confirm('この断片を削除しますか？\n添付素材はMEDIA LIBRARYに残ります。'))return; await api('/api/game-notes',{method:'DELETE',body:JSON.stringify({entity:'note',id:state.editing})}); state.uploadedThisSession=[]; closeNote(false); await load(); toast('削除しました'); }
  async function addDictionary(entity,name,id=''){ await api('/api/game-notes',{method:id?'PATCH':'POST',body:JSON.stringify({entity,name,id:id||undefined})}); await load(); toast(`${entity==='game'?'ゲーム':entity==='type'?'種類':'ファセット'}を${id?'更新':'追加'}しました`); }
  async function deleteDictionary(entity,id){ try{await api('/api/game-notes',{method:'DELETE',body:JSON.stringify({entity,id})});await load();toast('削除しました')}catch(e){if(e.data?.error==='dictionary_in_use')toast(`${e.data.count}件のメモで使用中です`,true);else toast(e.message,true)} }
  function clearFilters() { state.filters = { gameId:'all', typeId:'all', status:'all', facets:{} }; state.query=''; $('#search').value=''; renderLibrary(); }

  $('#unlock-form').addEventListener('submit',async e=>{e.preventDefault();const key=$('#admin-key').value.trim();if(!key)return;state.adminKey=key;sessionStorage.setItem('harfway_game_notes_key',key);try{await load();$('#admin-key').value=''}catch(err){if(err.status!==401)toast(err.message,true)}});
  $('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
  $('#open-note').addEventListener('click',()=>openNote()); $('#quick-full').addEventListener('click',()=>openNote(null,$('#quick-game').value)); $('#quick-save').addEventListener('click',()=>saveQuick().catch(e=>toast(e.message,true))); $('#game-add').addEventListener('click',()=>openNote(null,state.gameId));
  $('#note-form').addEventListener('submit',saveNote); $('#delete-note').addEventListener('click',()=>deleteNote().catch(e=>toast(e.message,true))); $$('[data-close="note"]').forEach(b=>b.addEventListener('click',closeNote)); $('#note-overlay').addEventListener('click',e=>{if(e.target.id==='note-overlay')closeNote()});
  $('#note-facets').addEventListener('click',e=>{
    const attach=e.target.closest('[data-attach-facet]'); if(attach){attachFacetFromPicker();return}
    const drop=e.target.closest('[data-remove-facet-field]'); if(drop){delete state.draft.facets[drop.dataset.removeFacetField];renderDraftFields();return}
    const add=e.target.closest('[data-add-facet-token]'); if(add){const field=add.closest('[data-facet-id]');addFacetToken(field);return}
    const rem=e.target.closest('[data-remove-facet-token]'); if(rem){const list=state.draft.facets[rem.dataset.removeFacetToken]||[];list.splice(Number(rem.dataset.index),1);renderDraftFields();}
  });
  $('#note-facets').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input')){e.preventDefault();addFacetToken(e.target.closest('[data-facet-id]'));}});
  $('#note-form').addEventListener('click',e=>{const m=e.target.closest('[data-remove-media]');if(m){const item=state.draft.media.splice(Number(m.dataset.removeMedia),1)[0];const fresh=item&&state.uploadedThisSession.some(x=>x.key===item.key);if(fresh){state.uploadedThisSession=state.uploadedThisSession.filter(x=>x.key!==item.key);trashMediaAsset(item)}renderDraftFields()}});
  $('#note-form').addEventListener('change',e=>{const p=e.target.closest('[data-public-media]');if(p){const item=state.draft.media[Number(p.dataset.publicMedia)];if(item)item.public=p.checked}});
  $('#note-media').addEventListener('change',e=>handleMediaFiles(e.target.files));
  $('#open-media-library')?.addEventListener('click',openMediaPicker);
  $('#close-media-picker')?.addEventListener('click',closeMediaPicker);
  $('#media-picker-search')?.addEventListener('input',renderMediaPicker);
  $('#media-picker-grid')?.addEventListener('click',e=>{const b=e.target.closest('[data-pick-key]');if(!b)return;attachPickerAsset(b.dataset.pickKey).catch(err=>toast(err.message,true))});
  $('#media-picker-overlay')?.addEventListener('click',e=>{if(e.target.id==='media-picker-overlay')closeMediaPicker()});
  $('#library-list').addEventListener('click',e=>{const row=e.target.closest('[data-note]');if(row)openNote(state.notes.find(n=>n.id===row.dataset.note))}); $('#inbox-cards').addEventListener('click',e=>{const row=e.target.closest('[data-note]');if(row)openNote(state.notes.find(n=>n.id===row.dataset.note))}); $('#game-notes').addEventListener('click',e=>{const row=e.target.closest('[data-note]');if(row)openNote(state.notes.find(n=>n.id===row.dataset.note))});
  $('#game-list').addEventListener('click',e=>{const b=e.target.closest('[data-game]');if(!b)return;state.gameId=b.dataset.game;renderGame()});
  $('#search').addEventListener('input',e=>{state.query=e.target.value;setView('library');renderLibrary()});
  $('#filter-game').addEventListener('change',e=>{state.filters.gameId=e.target.value;renderLibrary()}); $('#filter-type').addEventListener('change',e=>{state.filters.typeId=e.target.value;renderLibrary()}); $('#filter-status').addEventListener('change',e=>{state.filters.status=e.target.value;renderLibrary()}); $('#clear-filters').addEventListener('click',clearFilters);
  $('#facet-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter-facet]');if(!b)return;const id=b.dataset.filterFacet,value=b.dataset.filterValue;const list=state.filters.facets[id]||[];state.filters.facets[id]=list.includes(value)?list.filter(v=>v!==value):[...list,value];renderLibrary()});

  $('#cross-facet')?.addEventListener('change',e=>{state.cross.facetId=e.target.value;state.cross.value='';renderCrosscut();renderPromotion();renderCounts()});
  $('#view-crosscut')?.addEventListener('click',async e=>{
    const sort=e.target.closest('[data-cross-sort]');if(sort){state.cross.sort=sort.dataset.crossSort;renderCrosscut();return}
    const card=e.target.closest('[data-cross-value]');if(card){state.cross.value=card.dataset.crossValue;renderCrosscut();return}
    const note=e.target.closest('[data-cross-note]');if(note){openNote(state.notes.find(n=>n.id===note.dataset.crossNote));return}
    const lib=e.target.closest('[data-open-cross-library]');if(lib){clearFilters();state.filters.facets[state.cross.facetId]=[state.cross.value];setView('library');renderLibrary();return}
    const route=e.target.closest('[data-cross-destination]');if(route){route.disabled=true;try{await api('/api/game-notes',{method:'PATCH',body:JSON.stringify({entity:'crosscut_destination',facetId:state.cross.facetId,value:state.cross.value,destination:route.dataset.crossDestination,enabled:route.dataset.enabled!=='false'})});await load();toast('出口候補を更新しました')}catch(err){toast(err.message,true)}finally{route.disabled=false}return}
  });
  $('#view-promotion')?.addEventListener('click',e=>{const route=e.target.closest('[data-promotion-route]');if(route){state.cross.route=route.dataset.promotionRoute;renderPromotion();return}const row=e.target.closest('[data-promotion-value]');if(row){state.cross.value=row.dataset.promotionValue;setView('crosscut');renderCrosscut();}});
  $('#candidate-filter').addEventListener('click',()=>{clearFilters();state.filters.status='candidate';setView('library');renderLibrary()});
  $('#dig').addEventListener('click',()=>{if(!state.notes.length)return;const n=state.notes[Math.floor(Math.random()*state.notes.length)];const pairs=visibleFacets().flatMap(f=>(n.facets?.[f.id]||[]).map(v=>[f.id,v]));if(pairs.length){const [id,v]=pairs[Math.floor(Math.random()*pairs.length)];clearFilters();state.filters.facets[id]=[v];setView('library');renderLibrary();toast(`「${v}」を掘り返しました`)}else{state.query=gameById(n.gameId)?.name||'';$('#search').value=state.query;setView('library');renderLibrary()}});
  $('#facet-index').addEventListener('click',e=>{const b=e.target.closest('[data-index-facet]');if(!b)return;clearFilters();state.filters.facets[b.dataset.indexFacet]=[b.dataset.indexValue];setView('library');renderLibrary()});
  $('#game-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#game-name'),name=input.value.trim();if(!name)return;try{await addDictionary('game',name);input.value=''}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名ゲームは登録済みです':err.message,true)}});
  $('#type-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#type-name'),name=input.value.trim();if(!name)return;try{await addDictionary('type',name);input.value=''}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名の種類は登録済みです':err.message,true)}});
  $('#facet-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#facet-name'),name=input.value.trim();if(!name)return;try{await addDictionary('facet',name);input.value=''}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名のファセットは登録済みです':err.message,true)}});
  $('#view-editor').addEventListener('click',async e=>{const saveGame=e.target.closest('[data-save-game]');if(saveGame){const id=saveGame.dataset.saveGame;const input=$(`[data-game-name="${CSS.escape(id)}"]`);const name=input?.value.trim();if(name)try{await addDictionary('game',name,id)}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名ゲームは登録済みです':err.message,true)}return}const saveType=e.target.closest('[data-save-type]');if(saveType){const id=saveType.dataset.saveType;const input=$(`[data-type-name="${CSS.escape(id)}"]`);const name=input?.value.trim();if(name)try{await addDictionary('type',name,id)}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名の種類は登録済みです':err.message,true)}return}const save=e.target.closest('[data-save-facet]');if(save){const id=save.dataset.saveFacet;const input=$(`[data-facet-name="${CSS.escape(id)}"]`);const name=input?.value.trim();if(name)try{await addDictionary('facet',name,id)}catch(err){toast(err.message==='duplicate_dictionary_value'?'同名のファセットは登録済みです':err.message,true)}return}const b=e.target.closest('[data-delete-dict]');if(!b)return;if(confirm('未使用なら削除します。よろしいですか？'))deleteDictionary(b.dataset.deleteDict,b.dataset.id)});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()} if(e.key==='Escape')closeNote()});

  load().catch(err=>{ if(err.status!==401){showLock('');$('#lock-message').textContent=`読み込みエラー: ${err.message}`;} });
})();
