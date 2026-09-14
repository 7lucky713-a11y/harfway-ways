(() => {
  const API = '/api/game-notes-glossary';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { games: [], entries: [], notes: [], selectedRelatedIds: [] };

  const key = () => sessionStorage.getItem('harfway_game_notes_key') || '';
  const headers = (extra = {}) => ({ ...extra, ...(key() ? { 'x-admin-key': key() } : {}) });
  const gameName = (id) => id ? (state.games.find(g => g.id === id)?.name || '未登録ゲーム') : '共通 / ゲーム横断';
  const entryById = (id) => state.entries.find(entry => entry.id === id) || null;
  const relationNames = (entry) => (entry.relatedEntryIds || []).map(id => entryById(id)?.term).filter(Boolean);
  const fmt = (value) => {
    try { return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value)); }
    catch { return ''; }
  };

  function installStyles() {
    if ($('#glossary-note-link-styles')) return;
    const style = document.createElement('style');
    style.id = 'glossary-note-link-styles';
    style.textContent = `
      .related-notes{margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
      .related-notes-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.related-notes-head b{font:850 10px ui-monospace,monospace;letter-spacing:.08em;color:#8f9d92}.related-notes-head span{font-size:10px;color:#6f7a71}
      .related-note-list{display:grid;gap:7px}.related-note{display:grid;grid-template-columns:78px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#111512;text-decoration:none;color:inherit}
      .related-note:hover{border-color:rgba(223,242,56,.4);background:#151b17}.related-note time{font:750 10px ui-monospace,monospace;color:#78847b}.related-note strong{font-size:12px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.related-note em{font-style:normal;color:#dff238;font-size:12px}
      .related-note-more{margin-top:8px;font-size:10px;color:#77827a}
      @media(max-width:650px){.related-note{grid-template-columns:1fr auto}.related-note time{grid-column:1/-1}.related-note strong{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('on'), 2200);
  }

  function showLock(message = '') {
    $('#lock').classList.add('on');
    if (message) $('#lock-message').textContent = message;
  }
  function hideLock() { $('#lock').classList.remove('on'); }

  async function request(path = '', options = {}) {
    const init = { ...options, headers: headers(options.headers || {}), cache: 'no-store' };
    const res = await fetch(`${API}${path}`, init);
    if (res.status === 401) {
      showLock('管理キーを入力してください。');
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { data, status: res.status });
    return data;
  }

  function fillGames() {
    const filter = $('#game-filter');
    const form = $('#game');
    const currentFilter = filter.value || 'all';
    const currentForm = form.value || '';
    filter.innerHTML = '<option value="all">すべてのゲーム</option><option value="common">共通 / ゲーム横断</option>' + state.games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    form.innerHTML = '<option value="">共通 / ゲーム横断</option>' + state.games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    if ([...filter.options].some(o => o.value === currentFilter)) filter.value = currentFilter;
    if ([...form.options].some(o => o.value === currentForm)) form.value = currentForm;
  }

  function notesForEntry(entry) {
    return state.notes
      .filter(note => Array.isArray(note.glossaryEntryIds) && note.glossaryEntryIds.includes(entry.id))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function filteredEntries() {
    const q = ($('#search').value || '').trim().toLocaleLowerCase('ja');
    const game = $('#game-filter').value || 'all';
    return state.entries.filter(entry => {
      if (game === 'common' && entry.gameId) return false;
      if (game !== 'all' && game !== 'common' && entry.gameId !== game) return false;
      if (!q) return true;
      const noteTitles = notesForEntry(entry).map(note => note.title || '');
      const haystack = [entry.term, entry.description, gameName(entry.gameId), ...relationNames(entry), ...(entry.relatedTerms || []), ...noteTitles].join(' ').toLocaleLowerCase('ja');
      return haystack.includes(q);
    });
  }

  function relatedMarkup(entry) {
    const linked = (entry.relatedEntryIds || []).map(id => {
      const target = entryById(id);
      return target ? `<button type="button" class="chip linked" data-open-related="${esc(target.id)}">↔ ${esc(target.term)}</button>` : '';
    }).join('');
    const legacy = (entry.relatedTerms || []).map(term => `<span class="chip legacy">${esc(term)}</span>`).join('');
    return linked + legacy;
  }

  function relatedNotesMarkup(entry) {
    const notes = notesForEntry(entry);
    if (!notes.length) return '';
    const visible = notes.slice(0, 6);
    return `
      <div class="related-notes">
        <div class="related-notes-head"><b>RELATED NOTES</b><span>${notes.length}件</span></div>
        <div class="related-note-list">${visible.map(note => `<a class="related-note" href="/game-notes/?note=${encodeURIComponent(note.id)}"><time>${esc(fmt(note.createdAt))}</time><strong>${esc(note.title || '無題')}</strong><em>→</em></a>`).join('')}</div>
        ${notes.length > visible.length ? `<div class="related-note-more">ほか ${notes.length - visible.length}件</div>` : ''}
      </div>`;
  }

  function render() {
    const entries = filteredEntries();
    $('#entry-count').textContent = entries.length;
    const grid = $('#entry-grid');
    if (!entries.length) {
      grid.innerHTML = `<div class="empty"><b>${state.entries.length ? '条件に合う用語がありません' : 'まだ用語がありません'}</b>${state.entries.length ? '検索条件を変えてみてください。' : '右上の「＋ 用語を追加」から、必要な言葉だけ置いていけます。'}</div>`;
      return;
    }
    grid.innerHTML = entries.map(entry => {
      const related = relatedMarkup(entry);
      const noteLinks = relatedNotesMarkup(entry);
      return `
      <article class="card" data-entry="${esc(entry.id)}">
        <div class="card-head">
          <div><span class="game-pill">${esc(gameName(entry.gameId))}</span><h2>${esc(entry.term)}</h2></div>
          <button class="edit" type="button" data-edit="${esc(entry.id)}">編集</button>
        </div>
        <p>${esc(entry.description)}</p>
        ${related ? `<div class="related">${related}</div>` : ''}
        ${noteLinks}
      </article>`;
    }).join('');
  }

  function renderRelatedPicker() {
    const picker = $('#related-picker');
    const currentId = $('#entry-id').value || '';
    const selected = new Set(state.selectedRelatedIds);
    const currentGame = $('#game').value || '';
    const candidates = state.entries
      .filter(entry => entry.id !== currentId && !selected.has(entry.id))
      .sort((a, b) => {
        const aSame = a.gameId === currentGame ? 0 : 1;
        const bSame = b.gameId === currentGame ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return a.term.localeCompare(b.term, 'ja');
      });
    picker.innerHTML = '<option value="">既存Glossaryから選択</option>' + candidates.map(entry => `<option value="${esc(entry.id)}">${esc(entry.term)} — ${esc(gameName(entry.gameId))}</option>`).join('');
    $('#add-related').disabled = !candidates.length;
  }

  function renderRelated() {
    $('#related-chips').innerHTML = state.selectedRelatedIds.map(id => {
      const target = entryById(id);
      return target ? `<button type="button" data-related-remove="${esc(id)}">${esc(target.term)} ×</button>` : '';
    }).join('');
    renderRelatedPicker();
  }

  function addRelated() {
    const id = $('#related-picker').value || '';
    if (!id || state.selectedRelatedIds.includes(id)) return;
    state.selectedRelatedIds.push(id);
    renderRelated();
  }

  function openEditor(entry = null) {
    $('#entry-id').value = entry?.id || '';
    $('#term').value = entry?.term || '';
    $('#game').value = entry?.gameId || '';
    $('#description').value = entry?.description || '';
    state.selectedRelatedIds = [...(entry?.relatedEntryIds || [])];
    renderRelated();
    $('#delete-entry').classList.toggle('hidden', !entry);
    $('#dialog-title').textContent = entry ? '用語を編集' : '用語を追加';
    $('#entry-overlay').classList.add('on');
    $('#entry-overlay').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#term').focus(), 0);
  }

  function closeEditor() {
    $('#entry-overlay').classList.remove('on');
    $('#entry-overlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    $('#entry-form').reset();
    state.selectedRelatedIds = [];
    renderRelated();
  }

  function focusEntry(id, push = true) {
    const entry = entryById(id);
    if (!entry) return;
    $('#search').value = '';
    $('#game-filter').value = 'all';
    render();
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-entry="${CSS.escape(id)}"]`);
      if (!card) return;
      document.querySelectorAll('.card.focused').forEach(node => node.classList.remove('focused'));
      card.classList.add('focused');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (push) history.pushState({ entry: id }, '', `/game-notes/glossary/?entry=${encodeURIComponent(id)}`);
  }

  async function load() {
    try {
      const data = await request();
      state.games = Array.isArray(data.games) ? data.games : [];
      state.entries = Array.isArray(data.entries) ? data.entries : [];
      state.notes = Array.isArray(data.notes) ? data.notes : [];
      fillGames();
      render();
      hideLock();
      const entryId = new URLSearchParams(location.search).get('entry');
      if (entryId) focusEntry(entryId, false);
    } catch (error) {
      if (error.message !== 'unauthorized') toast('読み込みに失敗しました');
    }
  }

  installStyles();
  $('#open-entry').addEventListener('click', () => openEditor());
  $('#close-entry').addEventListener('click', closeEditor);
  $('#cancel-entry').addEventListener('click', closeEditor);
  $('#entry-overlay').addEventListener('click', e => { if (e.target === $('#entry-overlay')) closeEditor(); });
  $('#search').addEventListener('input', render);
  $('#game-filter').addEventListener('change', render);
  $('#game').addEventListener('change', renderRelatedPicker);
  $('#add-related').addEventListener('click', addRelated);
  $('#related-chips').addEventListener('click', e => {
    const button = e.target.closest('[data-related-remove]');
    if (!button) return;
    state.selectedRelatedIds = state.selectedRelatedIds.filter(id => id !== button.dataset.relatedRemove);
    renderRelated();
  });
  $('#entry-grid').addEventListener('click', e => {
    const related = e.target.closest('[data-open-related]');
    if (related) return focusEntry(related.dataset.openRelated, true);
    const button = e.target.closest('[data-edit]');
    if (!button) return;
    const entry = entryById(button.dataset.edit);
    if (entry) openEditor(entry);
  });

  $('#entry-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#entry-id').value || '';
    const payload = {
      id: id || undefined,
      term: $('#term').value,
      gameId: $('#game').value,
      description: $('#description').value,
      relatedEntryIds: state.selectedRelatedIds
    };
    try {
      await request('', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      closeEditor();
      await load();
      toast(id ? '更新しました。関連語も双方向で同期しました' : '用語を追加しました');
    } catch (error) {
      if (error.message === 'duplicate_glossary_term') toast('同じゲームに同名の用語があります');
      else if (error.message !== 'unauthorized') toast('保存できませんでした');
    }
  });

  $('#delete-entry').addEventListener('click', async () => {
    const id = $('#entry-id').value;
    if (!id || !confirm('この用語を削除しますか？')) return;
    try {
      await request('', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      closeEditor();
      history.replaceState({}, '', '/game-notes/glossary/');
      await load();
      toast('削除しました');
    } catch (error) {
      if (error.message !== 'unauthorized') toast('削除できませんでした');
    }
  });

  $('#unlock-form').addEventListener('submit', async e => {
    e.preventDefault();
    const value = $('#admin-key').value.trim();
    if (value) sessionStorage.setItem('harfway_game_notes_key', value);
    await load();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#entry-overlay').classList.contains('on')) closeEditor();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); }
  });
  addEventListener('popstate', () => {
    const entryId = new URLSearchParams(location.search).get('entry');
    if (entryId) focusEntry(entryId, false);
  });

  load();
})();
