(() => {
  const MAIN_API = '/api/game-notes';
  const GLOSSARY_API = '/api/game-notes-glossary';
  const baseFetch = window.fetch.bind(window);
  const state = {
    entries: [],
    notes: new Map(),
    games: new Map(),
    selectedIds: [],
    ready: false,
    loading: false
  };
  let pendingReaderNoteId = '';
  let readerQueued = false;
  let deepLinkOpened = false;

  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const authHeaders = (extra = {}) => {
    const key = sessionStorage.getItem('harfway_game_notes_key') || '';
    return { ...extra, ...(key ? { 'x-admin-key': key } : {}) };
  };
  const pathOf = (input) => {
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      return new URL(raw, location.href).pathname;
    } catch {
      return '';
    }
  };
  const methodOf = (input, init = {}) => String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  const entryById = (id) => state.entries.find(entry => String(entry.id) === String(id)) || null;
  const noteOverlayOpen = () => {
    const overlay = $('#note-overlay');
    return Boolean(overlay?.classList.contains('on') && overlay.getAttribute('aria-hidden') !== 'true');
  };
  const gameLabel = (id) => id ? (state.games.get(String(id)) || '未登録ゲーム') : '共通 / ゲーム横断';

  function installStyles() {
    if ($('#note-glossary-link-styles')) return;
    const style = document.createElement('style');
    style.id = 'note-glossary-link-styles';
    style.textContent = `
      .note-glossary-block{padding:15px;border:1px solid rgba(223,242,56,.22);border-radius:11px;background:rgba(223,242,56,.03)}
      .note-glossary-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}
      .note-glossary-head b{font-size:13px;letter-spacing:.08em}.note-glossary-head small{font-size:11px;color:var(--muted);line-height:1.5;text-align:right}
      .note-glossary-picker{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}.note-glossary-picker select{width:100%;font-size:15px!important;padding:11px 12px!important}
      .note-glossary-picker button{font-size:13px;padding:10px 13px}.note-glossary-selected{display:flex;gap:7px;flex-wrap:wrap;min-height:24px}
      .note-glossary-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #566257;border-radius:999px;background:#151b17;color:#dfe8df;padding:6px 8px 6px 10px;font-size:12px;font-weight:750}
      .note-glossary-chip a{color:var(--accent2);text-decoration:none;font-size:11px}.note-glossary-chip button{border:0;background:transparent;color:#89968c;padding:0 2px;font-size:13px;cursor:pointer}
      .note-glossary-empty{font-size:11px;color:var(--muted);line-height:1.6}.note-glossary-empty a{color:var(--accent2)}
      .reader-glossary{margin:0 0 30px;padding:18px;border:1px solid rgba(223,242,56,.22);border-radius:12px;background:rgba(223,242,56,.03)}
      .reader-glossary-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.reader-glossary-head b{font:850 11px ui-monospace,monospace;letter-spacing:.08em;color:#9dab9f}.reader-glossary-head span{font-size:11px;color:var(--muted)}
      .reader-glossary-links{display:flex;gap:8px;flex-wrap:wrap}.reader-glossary-links a{border:1px solid #536357;border-radius:999px;padding:7px 10px;color:#dff238;text-decoration:none;font-size:12px;font-weight:800}
      @media(max-width:700px){.note-glossary-picker{grid-template-columns:1fr}.note-glossary-head{display:grid}.note-glossary-head small{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function ensureFormField() {
    if ($('#note-glossary-block')) return;
    const anchor = $('#note-facets');
    if (!anchor) return;
    const block = document.createElement('div');
    block.id = 'note-glossary-block';
    block.className = 'full note-glossary-block';
    block.innerHTML = `
      <div class="note-glossary-head">
        <b>RELATED GLOSSARY</b>
        <small>このメモに関係する用語をGlossaryから選ぶ</small>
      </div>
      <div class="note-glossary-selected" id="note-glossary-selected"></div>
      <div class="note-glossary-picker">
        <select id="note-glossary-picker" aria-label="関連Glossaryを選択"><option value="">Glossaryを読み込み中…</option></select>
        <button type="button" class="ghost" id="note-glossary-add">＋ 追加</button>
      </div>
      <div class="note-glossary-empty" id="note-glossary-help"></div>
    `;
    anchor.before(block);
    $('#note-glossary-add')?.addEventListener('click', addSelected);
    $('#note-glossary-selected')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-glossary]');
      if (!button) return;
      state.selectedIds = state.selectedIds.filter(id => id !== button.dataset.removeGlossary);
      renderFormField();
    });
  }

  function sortedCandidates(gameId) {
    const selected = new Set(state.selectedIds);
    return state.entries
      .filter(entry => !selected.has(entry.id))
      .sort((a, b) => {
        const rank = (entry) => entry.gameId === gameId ? 0 : !entry.gameId ? 1 : 2;
        const diff = rank(a) - rank(b);
        return diff || a.term.localeCompare(b.term, 'ja');
      });
  }

  function renderFormField() {
    ensureFormField();
    const selectedRoot = $('#note-glossary-selected');
    const picker = $('#note-glossary-picker');
    const help = $('#note-glossary-help');
    const add = $('#note-glossary-add');
    if (!selectedRoot || !picker || !help || !add) return;

    selectedRoot.innerHTML = state.selectedIds.map(id => {
      const entry = entryById(id);
      if (!entry) return '';
      return `<span class="note-glossary-chip">${esc(entry.term)}<a href="/game-notes/glossary/?entry=${encodeURIComponent(entry.id)}" target="_blank" rel="noopener" title="Glossaryで見る">↗</a><button type="button" data-remove-glossary="${esc(entry.id)}" aria-label="${esc(entry.term)}を外す">×</button></span>`;
    }).join('');

    if (!state.ready) {
      picker.innerHTML = '<option value="">Glossaryを読み込み中…</option>';
      picker.disabled = true;
      add.disabled = true;
      help.textContent = 'Glossaryの読み込み後に選択できます。';
      return;
    }
    if (!state.entries.length) {
      picker.innerHTML = '<option value="">登録済みGlossaryがありません</option>';
      picker.disabled = true;
      add.disabled = true;
      help.innerHTML = '<a href="/game-notes/glossary/" target="_blank" rel="noopener">Glossaryで用語を追加する ↗</a>';
      return;
    }

    const gameId = $('#note-game')?.value || '';
    const candidates = sortedCandidates(gameId);
    picker.disabled = !candidates.length;
    add.disabled = !candidates.length;
    picker.innerHTML = '<option value="">用語を選択</option>' + candidates.map(entry => `<option value="${esc(entry.id)}">${esc(entry.term)} — ${esc(gameLabel(entry.gameId))}</option>`).join('');
    help.textContent = state.selectedIds.length
      ? `${state.selectedIds.length}件をこのメモに紐づけます。`
      : '同じゲームの用語を上位に表示します。共通・他ゲームの用語も選択できます。';
  }

  function addSelected() {
    const picker = $('#note-glossary-picker');
    const id = picker?.value || '';
    if (!id || state.selectedIds.includes(id) || !entryById(id)) return;
    state.selectedIds.push(id);
    renderFormField();
  }

  function populateForm() {
    ensureFormField();
    const noteId = $('#note-id')?.value || '';
    const note = noteId ? state.notes.get(String(noteId)) : null;
    state.selectedIds = state.ready && note ? [...(note.glossaryEntryIds || [])] : [];
    renderFormField();
  }

  async function loadKnowledge() {
    if (state.loading) return;
    state.loading = true;
    try {
      const res = await baseFetch(GLOSSARY_API, { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      state.entries = Array.isArray(data.entries) ? data.entries : [];
      state.games = new Map((data.games || []).map(game => [String(game.id), game.name || '']));
      state.notes = new Map((data.notes || []).map(note => [String(note.id), note]));
      state.ready = true;
      if (noteOverlayOpen()) populateForm();
      queueReaderRender();
      tryOpenDeepLink();
    } catch {} finally {
      state.loading = false;
    }
  }

  window.fetch = async (input, init = {}) => {
    const path = pathOf(input);
    if (path !== MAIN_API) return baseFetch(input, init);
    const method = methodOf(input, init);
    let nextInit = init;

    if ((method === 'POST' || method === 'PATCH') && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload?.entity === 'note' && noteOverlayOpen() && state.ready) {
          payload.glossaryEntryIds = [...state.selectedIds];
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      } catch {}
    }

    const response = await baseFetch(input, nextInit);
    if (response.ok && method === 'GET') setTimeout(loadKnowledge, 0);
    if (response.ok && (method === 'POST' || method === 'PATCH')) {
      response.clone().json().then(data => {
        const item = data?.item;
        if (!item?.id) return;
        const previous = state.notes.get(String(item.id)) || {};
        state.notes.set(String(item.id), {
          ...previous,
          id: item.id,
          title: item.title || previous.title || '',
          gameId: item.gameId || previous.gameId || '',
          glossaryEntryIds: Array.isArray(item.glossaryEntryIds) ? item.glossaryEntryIds : [...state.selectedIds],
          createdAt: item.createdAt || previous.createdAt || null,
          updatedAt: item.updatedAt || previous.updatedAt || null
        });
      }).catch(() => {});
    }
    return response;
  };

  function readerGlossaryHtml(noteId) {
    const note = state.notes.get(String(noteId));
    if (!note) return '';
    const entries = (note.glossaryEntryIds || []).map(entryById).filter(Boolean);
    if (!entries.length) return '';
    return `
      <section class="reader-glossary" id="reader-glossary-links" data-note-id="${esc(noteId)}">
        <div class="reader-glossary-head"><b>RELATED GLOSSARY</b><span>${entries.length} terms</span></div>
        <div class="reader-glossary-links">${entries.map(entry => `<a href="/game-notes/glossary/?entry=${encodeURIComponent(entry.id)}">${esc(entry.term)} →</a>`).join('')}</div>
      </section>
    `;
  }

  function renderReaderLinks() {
    readerQueued = false;
    const article = $('#reader-article');
    if (!article) return;
    $('#reader-glossary-links', article)?.remove();
    if (!state.ready || !pendingReaderNoteId) return;
    const html = readerGlossaryHtml(pendingReaderNoteId);
    if (!html) return;
    const copy = $('.reader-copy', article);
    if (copy) copy.insertAdjacentHTML('afterend', html);
  }
  function queueReaderRender() {
    if (readerQueued) return;
    readerQueued = true;
    requestAnimationFrame(renderReaderLinks);
  }

  function tryOpenDeepLink() {
    if (deepLinkOpened) return;
    const noteId = new URLSearchParams(location.search).get('note');
    if (!noteId) return;
    const target = document.querySelector(`[data-note="${CSS.escape(noteId)}"]`);
    if (!target) return;
    deepLinkOpened = true;
    pendingReaderNoteId = noteId;
    target.click();
    requestAnimationFrame(() => {
      const url = new URL(location.href);
      url.searchParams.delete('note');
      history.replaceState(history.state || {}, '', `${url.pathname}${url.search}${url.hash}`);
    });
  }

  installStyles();
  ensureFormField();

  $('#note-game')?.addEventListener('change', renderFormField);
  const noteOverlay = $('#note-overlay');
  if (noteOverlay) {
    new MutationObserver(() => {
      if (noteOverlayOpen()) setTimeout(populateForm, 0);
      else {
        state.selectedIds = [];
        renderFormField();
      }
    }).observe(noteOverlay, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  }

  document.addEventListener('pointerdown', event => {
    const target = event.target.closest?.('[data-note]');
    if (target?.dataset?.note) pendingReaderNoteId = String(target.dataset.note);
  }, true);

  const readerArticle = $('#reader-article');
  if (readerArticle) new MutationObserver(queueReaderRender).observe(readerArticle, { childList: true, subtree: true });
  $('#reader-close')?.addEventListener('click', () => {
    pendingReaderNoteId = '';
    queueReaderRender();
  });

  const bodyObserver = new MutationObserver(() => tryOpenDeepLink());
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => bodyObserver.disconnect(), 15000);

  loadKnowledge();
})();
