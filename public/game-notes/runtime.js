(() => {
  const LEGACY_FACETS = new Set(['tags', 'characters', 'themes']);
  const SORT_KEY = 'harfway_game_notes_sort';
  const SORT_MODES = new Set(['created-desc', 'created-asc', 'updated-desc']);
  const nativeFetch = window.fetch.bind(window);
  const hiddenByNote = new Map();

  function sortMode() {
    const stored = sessionStorage.getItem(SORT_KEY) || 'created-desc';
    return SORT_MODES.has(stored) ? stored : 'created-desc';
  }

  function noteTime(note, mode) {
    const value = mode === 'updated-desc'
      ? (note?.sourceUpdatedAt || note?.updatedAt || note?.createdAt)
      : (note?.createdAt || note?.sourceUpdatedAt || note?.updatedAt);
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  }

  function sortNotes(notes) {
    const mode = sortMode();
    return [...notes].sort((a, b) => {
      const diff = noteTime(b, mode) - noteTime(a, mode);
      return mode === 'created-asc' ? -diff : diff;
    });
  }

  function isGameNotesApi(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      return new URL(raw, location.href).pathname === '/api/game-notes';
    } catch {
      return false;
    }
  }

  function rememberAndHideLegacy(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data.facets)) {
      data.facets = data.facets.filter((facet) => !LEGACY_FACETS.has(String(facet?.id || '')));
    }
    if (Array.isArray(data.notes)) {
      const mode = sortMode();
      data.notes = sortNotes(data.notes.map((note) => {
        const facets = note?.facets && typeof note.facets === 'object' && !Array.isArray(note.facets)
          ? note.facets
          : {};
        const hidden = {};
        const visible = {};
        for (const [id, values] of Object.entries(facets)) {
          if (LEGACY_FACETS.has(id)) hidden[id] = Array.isArray(values) ? [...values] : [];
          else visible[id] = values;
        }
        if (note?.id) hiddenByNote.set(String(note.id), hidden);
        const sourceUpdatedAt = note?.updatedAt || null;
        const displayDate = mode === 'updated-desc'
          ? (sourceUpdatedAt || note?.createdAt || null)
          : (note?.createdAt || sourceUpdatedAt || null);
        return {
          ...note,
          sourceUpdatedAt,
          updatedAt: displayDate,
          facets: visible,
          tags: [],
          characters: [],
          themes: []
        };
      }));
    }
    return data;
  }

  async function filteredResponse(response) {
    if (!response.ok) return response;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return response;
    let data;
    try {
      data = await response.clone().json();
    } catch {
      return response;
    }
    const filtered = rememberAndHideLegacy(data);
    return new Response(JSON.stringify(filtered), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  window.fetch = async (input, init = {}) => {
    if (!isGameNotesApi(input)) return nativeFetch(input, init);
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let nextInit = init;
    if ((method === 'POST' || method === 'PATCH') && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload?.entity === 'note' && payload.id) {
          const hidden = hiddenByNote.get(String(payload.id)) || {};
          payload.facets = { ...hidden, ...(payload.facets || {}) };
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      } catch {}
    }
    const response = await nativeFetch(input, nextInit);
    return method === 'GET' ? filteredResponse(response) : response;
  };

  function installSortControl() {
    if (document.querySelector('#game-notes-sort')) return;
    const heading = document.querySelector('#view-library .filter-heading');
    const count = document.querySelector('#filter-result-count');
    if (!heading || !count) return;

    const style = document.createElement('style');
    style.textContent = `
      #game-notes-sort-wrap{display:flex;align-items:center;gap:7px;margin-left:auto}
      #game-notes-sort-wrap b{font:850 10px ui-monospace,monospace;color:#91a095;letter-spacing:.06em}
      #game-notes-sort{border:1px solid var(--line);background:#121714;color:var(--text);border-radius:8px;padding:7px 9px;font-size:11px}
      @media(max-width:700px){#view-library .filter-heading{flex-wrap:wrap}#game-notes-sort-wrap{order:3;margin-left:0;width:100%}#game-notes-sort{flex:1}}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('label');
    wrap.id = 'game-notes-sort-wrap';
    wrap.innerHTML = `
      <b>SORT</b>
      <select id="game-notes-sort" aria-label="メモの並び順">
        <option value="created-desc">作成日：新しい順</option>
        <option value="created-asc">作成日：古い順</option>
        <option value="updated-desc">更新日：新しい順</option>
      </select>
    `;
    heading.insertBefore(wrap, count);
    const select = wrap.querySelector('select');
    select.value = sortMode();
    select.addEventListener('change', () => {
      sessionStorage.setItem(SORT_KEY, select.value);
      location.reload();
    });
  }

  function loadScript(src, onload) {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener('load', onload, { once: true });
    document.head.appendChild(script);
  }
  loadScript('/game-notes/runtime-core.js', () => {
    installSortControl();
    loadScript('/game-notes/workflow-link.js');
    loadScript('/game-notes/minibook-link.js');
    loadScript('/game-notes/glossary-link.js');
    loadScript('/game-notes/facet-presets.js');
    loadScript('/game-notes/monster-train-fields.js', () => {
      loadScript('/game-notes/note-glossary-links.js');
    });
  });
})();
