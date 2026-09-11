(() => {
  const LEGACY_FACETS = new Set(['tags', 'characters', 'themes']);
  const nativeFetch = window.fetch.bind(window);
  const hiddenByNote = new Map();

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
      data.notes = data.notes.map((note) => {
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
        return { ...note, facets: visible, tags: [], characters: [], themes: [] };
      });
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

  function loadScript(src, onload) {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener('load', onload, { once: true });
    document.head.appendChild(script);
  }
  loadScript('/game-notes/runtime-core.js', () => loadScript('/game-notes/workflow-link.js'));
})();
