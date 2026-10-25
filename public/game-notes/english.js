(() => {
  const API = '/api/game-notes-english';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const state = {
    cards: [], games: [], adminKey: sessionStorage.getItem('harfway_game_notes_key') || '',
    revealed: false, busy: false, editingId: '', libraryGameId: 'all'
  };

  async function request(method = 'GET', body) {
    const headers = { ...(state.adminKey ? { 'x-admin-key': state.adminKey } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
    const response = await fetch(API, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) showLock(data.error);
    if (!response.ok) throw Object.assign(new Error(data.error || `http_${response.status}`), { status: response.status });
    return data;
  }

  function showLock(message = '') {
    $('#lock').classList.remove('hidden');
    $('#lock-message').textContent = message === 'invalid_admin_key' ? '管理キーが一致しません。' : '管理キーを入力してください。';
  }

  function status(message, error = false) {
    const el = $('#form-status');
    el.textContent = message;
    el.classList.toggle('error', error);
  }

  function dayKey(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  const gameName = id => state.games.find(game => game.id === id)?.name || '未登録のゲーム';
  const dueCards = () => state.cards.filter(card => card.meaning && Number.isFinite(Date.parse(card.nextReviewAt)) && Date.parse(card.nextReviewAt) <= Date.now())
    .sort((a, b) => String(a.nextReviewAt).localeCompare(String(b.nextReviewAt)));

  function renderSummary() {
    const today = dayKey(new Date());
    const count = state.cards.filter(card => dayKey(card.createdAt) === today).length;
    $('#today-count').textContent = `${count} / 3`;
    $('#due-count').textContent = dueCards().length;
    $('#total-count').textContent = state.cards.length;
  }

  function renderWeek() {
    const studied = new Set(state.cards.flatMap(card => Array.isArray(card.history) ? card.history : []).map(dayKey).filter(Boolean));
    const today = new Date();
    const entries = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = dayKey(day);
      entries.push(`<div class="day ${studied.has(key) ? 'on' : ''}" title="${key}"><small>${['日','月','火','水','木','金','土'][day.getDay()]}</small><b>${day.getDate()}</b></div>`);
    }
    $('#week-row').innerHTML = entries.join('');
  }

  function renderReview() {
    const due = dueCards();
    const root = $('#review-content');
    if (!due.length) {
      root.innerHTML = '<div class="empty">今のところ復習待ちはありません。ゲームを楽しんで、気になる英文を追加しよう。<br>新しい英文は翌日から復習できます。</div>';
      return;
    }
    const card = due[0];
    root.innerHTML = `
      <div class="review-label"><span class="badge">${due.length}件待ち</span><span>${esc(gameName(card.gameId))}</span></div>
      <div class="review-english" lang="en">${esc(card.english)}</div>
      ${state.revealed ? `
        <div class="review-answer"><b>調べた意味</b><span>${esc(card.meaning)}</span>${card.guess ? `<b style="margin-top:12px">最初の予想</b><span>${esc(card.guess)}</span>` : ''}${card.context ? `<b style="margin-top:12px">場面</b><span>${esc(card.context)}</span>` : ''}</div>
        <div class="review-actions"><button type="button" class="ghost" data-review="false" data-id="${esc(card.id)}">まだ覚えていない</button><button type="button" class="primary" data-review="true" data-id="${esc(card.id)}">覚えた！</button></div>
      ` : '<button type="button" class="primary" id="reveal-answer">意味を確認する</button>'}
    `;
  }

  function renderLibrary() {
    const root = $('#card-list');
    const cards = state.cards
      .filter(card => state.libraryGameId === 'all' || card.gameId === state.libraryGameId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 150);
    if (!cards.length) {
      root.innerHTML = '<div class="empty">まだ英語メモがありません。遊んでいて気になった一文から始めよう。</div>';
      return;
    }
    root.innerHTML = cards.map(card => `<article class="item">
      <div><small>${esc(gameName(card.gameId))} · ${esc(dayKey(card.createdAt))}</small><h3 lang="en">${esc(card.english)}</h3><p>${esc(card.meaning)}</p>${card.context ? `<small>${esc(card.context)}</small>` : ''}</div>
      <div class="item-actions"><button type="button" class="ghost" data-edit="${esc(card.id)}">編集</button><button type="button" class="danger" data-delete="${esc(card.id)}">削除</button></div>
    </article>`).join('');
  }

  function render() {
    renderSummary();
    renderWeek();
    renderReview();
    renderLibrary();
  }

  function fillGames() {
    const wanted = new URLSearchParams(location.search).get('game');
    const selected = state.games.some(game => game.id === wanted) ? wanted : state.games[0]?.id || '';
    $('#card-game').innerHTML = state.games.map(game => `<option value="${esc(game.id)}">${esc(game.name)}</option>`).join('') || '<option value="">ゲームを先に登録してください</option>';
    $('#card-game').value = selected;
    $('#save-card').disabled = !state.games.length;
    $('#library-game').innerHTML = '<option value="all">すべてのゲーム</option>' + state.games.map(game => `<option value="${esc(game.id)}">${esc(game.name)}</option>`).join('');
    state.libraryGameId = selected || 'all';
    $('#library-game').value = state.libraryGameId;
    if (!state.games.length) status('GAME NOTESのEDITORでゲームを先に登録してください。', true);
  }

  async function load() {
    const data = await request();
    state.cards = data.cards || [];
    state.games = data.games || [];
    fillGames();
    render();
    $('#lock').classList.add('hidden');
  }

  function resetForm() {
    const selected = $('#card-game').value;
    $('#card-form').reset();
    $('#card-id').value = '';
    $('#card-game').value = selected;
    state.editingId = '';
    $('#form-title').textContent = '新しい英文を残す';
    $('#save-card').textContent = '英文を保存する';
    $('#cancel-edit').classList.add('hidden');
  }

  function replaceCard(card) {
    state.cards = [card, ...state.cards.filter(item => item.id !== card.id)];
  }

  $('#unlock-form').addEventListener('submit', async event => {
    event.preventDefault();
    state.adminKey = $('#admin-key').value.trim();
    if (!state.adminKey) return;
    sessionStorage.setItem('harfway_game_notes_key', state.adminKey);
    try { await load(); $('#admin-key').value = ''; } catch (error) { $('#lock-message').textContent = error.message; }
  });

  $('#card-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (state.busy) return;
    const payload = {
      gameId: $('#card-game').value,
      english: $('#card-english').value.trim(),
      guess: $('#card-guess').value.trim(),
      meaning: $('#card-meaning').value.trim(),
      context: $('#card-context').value.trim()
    };
    state.busy = true;
    $('#save-card').disabled = true;
    try {
      const editing = Boolean(state.editingId);
      const data = await request(editing ? 'PATCH' : 'POST', editing ? { action: 'edit', id: state.editingId, ...payload } : payload);
      replaceCard(data.card);
      resetForm();
      render();
      status(editing ? '英文を更新しました。' : '保存しました。最初の復習は翌日です。');
    } catch (error) {
      status(`保存できませんでした：${error.message}`, true);
    } finally {
      state.busy = false;
      $('#save-card').disabled = !state.games.length;
    }
  });

  $('#cancel-edit').addEventListener('click', () => { resetForm(); status(''); });
  $('#card-game').addEventListener('change', event => {
    const url = new URL(location.href);
    url.searchParams.set('game', event.target.value);
    history.replaceState(null, '', url);
  });
  $('#library-game').addEventListener('change', event => { state.libraryGameId = event.target.value; renderLibrary(); });
  $('#card-list').addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const card = state.cards.find(item => item.id === edit.dataset.edit);
      if (!card) return;
      state.editingId = card.id;
      $('#card-id').value = card.id;
      $('#card-game').value = card.gameId;
      $('#card-english').value = card.english;
      $('#card-guess').value = card.guess;
      $('#card-meaning').value = card.meaning;
      $('#card-context').value = card.context;
      $('#form-title').textContent = '英文を編集する';
      $('#save-card').textContent = '変更を保存する';
      $('#cancel-edit').classList.remove('hidden');
      $('#add-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const remove = event.target.closest('[data-delete]');
    if (!remove || state.busy || !confirm('この英文を削除しますか？ 復習履歴も非表示になります。')) return;
    state.busy = true;
    try {
      await request('DELETE', { id: remove.dataset.delete });
      state.cards = state.cards.filter(item => item.id !== remove.dataset.delete);
      if (state.editingId === remove.dataset.delete) resetForm();
      state.revealed = false;
      render();
      status('英文を削除しました。');
    } catch (error) { status(`削除できませんでした：${error.message}`, true); }
    finally { state.busy = false; }
  });

  $('#review-content').addEventListener('click', async event => {
    if (event.target.closest('#reveal-answer')) { state.revealed = true; renderReview(); return; }
    const button = event.target.closest('[data-review]');
    if (!button || state.busy) return;
    state.busy = true;
    button.disabled = true;
    try {
      const data = await request('PATCH', { action: 'review', id: button.dataset.id, remembered: button.dataset.review === 'true' });
      replaceCard(data.card);
      state.revealed = false;
      render();
      status('復習を記録しました。');
    } catch (error) {
      status(`復習を保存できませんでした：${error.message}`, true);
      button.disabled = false;
    } finally { state.busy = false; }
  });

  load().catch(error => {
    showLock();
    $('#lock-message').textContent = error.status === 503 ? 'Preview用の保存先が未設定です。' : `読み込みに失敗しました：${error.message}`;
  });
})();
