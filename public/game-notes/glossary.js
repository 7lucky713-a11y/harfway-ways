(() => {
  const API = '/api/game-notes-glossary';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { games: [], entries: [], relatedTerms: [] };

  const key = () => sessionStorage.getItem('harfway_game_notes_key') || '';
  const headers = (extra = {}) => ({ ...extra, ...(key() ? { 'x-admin-key': key() } : {}) });
  const gameName = (id) => id ? (state.games.find(g => g.id === id)?.name || '未登録ゲーム') : '共通 / ゲーム横断';
  const statusLabel = (value) => value === 'published' ? 'PUBLIC' : value === 'candidate' ? '公開候補' : 'PRIVATE';

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

  function filteredEntries() {
    const q = ($('#search').value || '').trim().toLocaleLowerCase('ja');
    const game = $('#game-filter').value || 'all';
    return state.entries.filter(entry => {
      if (game === 'common' && entry.gameId) return false;
      if (game !== 'all' && game !== 'common' && entry.gameId !== game) return false;
      if (!q) return true;
      const haystack = [entry.term, entry.description, gameName(entry.gameId), ...(entry.relatedTerms || [])].join(' ').toLocaleLowerCase('ja');
      return haystack.includes(q);
    });
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
      const publicationState = entry.publicationState || 'private';
      const action = publicationState === 'candidate'
        ? `<button class="publish" type="button" data-publish="${esc(entry.id)}">公開する</button>`
        : publicationState === 'published'
          ? `<button class="unpublish" type="button" data-unpublish="${esc(entry.id)}">公開停止</button>`
          : '';
      return `
      <article class="card" data-entry="${esc(entry.id)}">
        <div class="card-head">
          <div><div class="pills"><span class="game-pill">${esc(gameName(entry.gameId))}</span><span class="state-pill ${esc(publicationState)}">${esc(statusLabel(publicationState))}</span></div><h2>${esc(entry.term)}</h2></div>
          <button class="edit" type="button" data-edit="${esc(entry.id)}">編集</button>
        </div>
        <p>${esc(entry.description)}</p>
        ${(entry.relatedTerms || []).length ? `<div class="related">${entry.relatedTerms.map(v => `<button type="button" class="chip" data-search-related="${esc(v)}">↔ ${esc(v)}</button>`).join('')}</div>` : ''}
        ${action ? `<div class="publication-actions">${action}${publicationState === 'published' ? `<a href="/game-wiki/?entry=${encodeURIComponent(entry.id)}" target="_blank" rel="noopener">公開ページを見る ↗</a>` : ''}</div>` : ''}
      </article>`;
    }).join('');
  }

  function renderRelated() {
    $('#related-chips').innerHTML = state.relatedTerms.map((v, i) => `<button type="button" data-related-remove="${i}">${esc(v)} ×</button>`).join('');
  }

  function addRelated(value = $('#related-input').value) {
    const v = String(value || '').trim().slice(0, 100);
    if (!v) return;
    if (!state.relatedTerms.some(x => x.toLocaleLowerCase('ja') === v.toLocaleLowerCase('ja'))) state.relatedTerms.push(v);
    $('#related-input').value = '';
    renderRelated();
  }

  function openEditor(entry = null) {
    $('#entry-id').value = entry?.id || '';
    $('#term').value = entry?.term || '';
    $('#game').value = entry?.gameId || '';
    $('#description').value = entry?.description || '';
    $('#publication-candidate').checked = entry?.publicationState === 'candidate';
    $('#publication-candidate').disabled = entry?.publicationState === 'published';
    $('#publication-note').textContent = entry?.publicationState === 'published'
      ? '現在公開中です。保存しても公開状態は維持されます。公開を止める場合は一覧の「公開停止」を使います。'
      : '公開候補にしても外部には出ません。一覧から「公開する」を押した時だけ公開されます。';
    state.relatedTerms = [...(entry?.relatedTerms || [])];
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
    $('#publication-candidate').disabled = false;
    state.relatedTerms = [];
    renderRelated();
  }

  async function load() {
    try {
      const data = await request();
      state.games = Array.isArray(data.games) ? data.games : [];
      state.entries = Array.isArray(data.entries) ? data.entries : [];
      fillGames();
      render();
      hideLock();
    } catch (error) {
      if (error.message !== 'unauthorized') toast('読み込みに失敗しました');
    }
  }

  async function publicationAction(id, action) {
    const verb = action === 'publish' ? '公開' : '公開停止';
    if (!confirm(`この用語を${verb}しますか？`)) return;
    try {
      const data = await request('', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action })
      });
      const index = state.entries.findIndex(x => x.id === data.item.id);
      if (index >= 0) state.entries[index] = data.item;
      render();
      toast(action === 'publish' ? '公開Wikiに反映しました' : '公開を停止しました');
    } catch (error) {
      if (error.message === 'candidate_required_before_publish') toast('先に「公開候補」として保存してください');
      else if (error.message !== 'unauthorized') toast(`${verb}できませんでした`);
    }
  }

  $('#open-entry').addEventListener('click', () => openEditor());
  $('#close-entry').addEventListener('click', closeEditor);
  $('#cancel-entry').addEventListener('click', closeEditor);
  $('#entry-overlay').addEventListener('click', e => { if (e.target === $('#entry-overlay')) closeEditor(); });
  $('#search').addEventListener('input', render);
  $('#game-filter').addEventListener('change', render);
  $('#add-related').addEventListener('click', () => addRelated());
  $('#related-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addRelated(); } });
  $('#related-chips').addEventListener('click', e => {
    const button = e.target.closest('[data-related-remove]');
    if (!button) return;
    state.relatedTerms.splice(Number(button.dataset.relatedRemove), 1);
    renderRelated();
  });
  $('#entry-grid').addEventListener('click', e => {
    const related = e.target.closest('[data-search-related]');
    if (related) {
      $('#search').value = related.dataset.searchRelated || '';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const publish = e.target.closest('[data-publish]');
    if (publish) return publicationAction(publish.dataset.publish, 'publish');
    const unpublish = e.target.closest('[data-unpublish]');
    if (unpublish) return publicationAction(unpublish.dataset.unpublish, 'unpublish');
    const button = e.target.closest('[data-edit]');
    if (!button) return;
    const entry = state.entries.find(x => x.id === button.dataset.edit);
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
      relatedTerms: state.relatedTerms,
      publicationCandidate: $('#publication-candidate').checked
    };
    try {
      const data = await request('', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const item = data.item;
      const index = state.entries.findIndex(x => x.id === item.id);
      if (index >= 0) state.entries[index] = item; else state.entries.push(item);
      state.entries.sort((a, b) => a.term.localeCompare(b.term, 'ja'));
      closeEditor();
      render();
      toast(id ? '更新しました' : '用語を追加しました');
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
      state.entries = state.entries.filter(x => x.id !== id);
      closeEditor();
      render();
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

  load();
})();
