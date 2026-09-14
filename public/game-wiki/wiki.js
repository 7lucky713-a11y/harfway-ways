(() => {
  const API = '/api/game-wiki';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { entries: [] };

  const gameName = (entry) => entry.gameName || '共通 / ゲーム横断';
  const normalize = (v) => String(v || '').trim().toLocaleLowerCase('ja');

  function entryByTerm(term, sourceEntry = null) {
    const key = normalize(term);
    if (!key) return null;
    const sameGame = state.entries.find(entry => normalize(entry.term) === key && sourceEntry?.gameId && entry.gameId === sourceEntry.gameId);
    if (sameGame) return sameGame;
    return state.entries.find(entry => normalize(entry.term) === key && !entry.gameId)
      || state.entries.find(entry => normalize(entry.term) === key)
      || null;
  }

  function fillGameFilter() {
    const select = $('#game-filter');
    const current = select.value || 'all';
    const games = [...new Map(state.entries.filter(e => e.gameId).map(e => [e.gameId, gameName(e)])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ja'));
    select.innerHTML = '<option value="all">すべてのゲーム</option><option value="common">共通 / ゲーム横断</option>'
      + games.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function filteredEntries() {
    const q = normalize($('#search').value);
    const game = $('#game-filter').value || 'all';
    return state.entries.filter(entry => {
      if (game === 'common' && entry.gameId) return false;
      if (game !== 'all' && game !== 'common' && entry.gameId !== game) return false;
      if (!q) return true;
      const haystack = normalize([entry.term, entry.description, gameName(entry), ...(entry.relatedTerms || [])].join(' '));
      return haystack.includes(q);
    });
  }

  function relatedMarkup(entry) {
    return (entry.relatedTerms || []).map(term => {
      const target = entryByTerm(term, entry);
      if (target) return `<button class="related linked" type="button" data-entry-link="${esc(target.id)}">${esc(term)} ↗</button>`;
      return `<span class="related">${esc(term)}</span>`;
    }).join('');
  }

  function openEntry(id, push = true) {
    const entry = state.entries.find(item => item.id === id);
    if (!entry) return closeEntry(push);
    $('#wiki-list').classList.add('detail-mode');
    $('#detail').classList.add('show');
    $('#detail').innerHTML = `
      <button class="detail-back" type="button" id="detail-back">← 用語一覧へ</button>
      <article class="entry-article">
        <div class="article-meta"><span>${esc(gameName(entry))}</span><span>HARF-WAY GAME WIKI</span></div>
        <h1>${esc(entry.term)}</h1>
        <div class="article-copy">${esc(entry.description)}</div>
        ${(entry.relatedTerms || []).length ? `<section class="connections"><small>RELATED / 関連語</small><div>${relatedMarkup(entry)}</div></section>` : ''}
      </article>`;
    $('#detail-back').addEventListener('click', () => closeEntry(true));
    $('#detail').querySelectorAll('[data-entry-link]').forEach(button => button.addEventListener('click', () => openEntry(button.dataset.entryLink, true)));
    if (push) history.pushState({ entry: id }, '', `/game-wiki/?entry=${encodeURIComponent(id)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeEntry(push = true) {
    $('#detail').classList.remove('show');
    $('#detail').innerHTML = '';
    $('#wiki-list').classList.remove('detail-mode');
    if (push) history.pushState({}, '', '/game-wiki/');
  }

  function renderList() {
    const entries = filteredEntries();
    $('#entry-count').textContent = entries.length;
    const grid = $('#entry-grid');
    if (!entries.length) {
      grid.innerHTML = `<div class="empty"><b>${state.entries.length ? '条件に合う用語がありません' : '公開されている用語はまだありません'}</b>${state.entries.length ? '検索条件を変えてみてください。' : 'Private Glossaryから明示的に公開した用語だけ、ここに並びます。'}</div>`;
      return;
    }
    grid.innerHTML = entries.map(entry => `
      <article class="term-card" tabindex="0" data-open-entry="${esc(entry.id)}">
        <div class="term-meta"><span>${esc(gameName(entry))}</span></div>
        <h2>${esc(entry.term)}</h2>
        <p>${esc(entry.description)}</p>
        ${(entry.relatedTerms || []).length ? `<div class="term-related">${(entry.relatedTerms || []).slice(0, 4).map(v => `<span>${esc(v)}</span>`).join('')}</div>` : ''}
        <div class="read-more">読む →</div>
      </article>`).join('');
  }

  async function load() {
    const res = await fetch(API, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'load_failed');
    state.entries = Array.isArray(data.entries) ? data.entries : [];
    fillGameFilter();
    renderList();
    const entryId = new URLSearchParams(location.search).get('entry');
    if (entryId) openEntry(entryId, false);
  }

  $('#search').addEventListener('input', renderList);
  $('#game-filter').addEventListener('change', renderList);
  $('#entry-grid').addEventListener('click', e => {
    const card = e.target.closest('[data-open-entry]');
    if (card) openEntry(card.dataset.openEntry, true);
  });
  $('#entry-grid').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-open-entry]');
    if (!card) return;
    e.preventDefault();
    openEntry(card.dataset.openEntry, true);
  });
  addEventListener('popstate', () => {
    const entryId = new URLSearchParams(location.search).get('entry');
    if (entryId) openEntry(entryId, false); else closeEntry(false);
  });

  load().catch(() => {
    $('#entry-grid').innerHTML = '<div class="empty"><b>Wikiを読み込めませんでした</b>時間をおいてもう一度試してください。</div>';
  });
})();
