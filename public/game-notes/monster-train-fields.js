(() => {
  const MAIN_API = '/api/game-notes';
  const NOTE_API = '/api/game-notes-note-v2';
  const TARGET_GAME_IDS = new Set([
    'a10e6a8c-95a7-4480-adcb-bf6f8c8054e2',
    'c5dd23a5-4951-4123-881d-c71df1c446b3'
  ]);
  const baseFetch = window.fetch.bind(window);
  const runs = new Map();
  let loadingRuns = false;
  let pendingReaderNoteId = '';
  let readerRenderQueued = false;

  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const authHeaders = (extra = {}) => {
    const key = sessionStorage.getItem('harfway_game_notes_key') || '';
    return { ...extra, ...(key ? { 'x-admin-key': key } : {}) };
  };

  function pathOf(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      return new URL(raw, location.href).pathname;
    } catch {
      return '';
    }
  }
  function methodOf(input, init = {}) {
    return String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  }
  function isTargetGame(id) {
    return TARGET_GAME_IDS.has(String(id || ''));
  }
  function noteOverlayOpen() {
    const overlay = $('#note-overlay');
    return Boolean(overlay?.classList.contains('on') && overlay.getAttribute('aria-hidden') !== 'true');
  }
  function runFields() {
    return {
      start: $('#monster-run-start'),
      end: $('#monster-run-end'),
      stage: $('#monster-run-stage')
    };
  }
  function clearRunFields() {
    const fields = runFields();
    if (fields.start) fields.start.value = '';
    if (fields.end) fields.end.value = '';
    if (fields.stage) fields.stage.value = '';
  }
  function currentRunPayload(gameId) {
    if (!noteOverlayOpen() || !isTargetGame(gameId)) return null;
    const fields = runFields();
    const reachedStage = fields.stage?.value === '' ? null : Number(fields.stage?.value || 0);
    return {
      startTime: fields.start?.value || '',
      endTime: fields.end?.value || '',
      reachedStage: Number.isInteger(reachedStage) && reachedStage > 0 ? reachedStage : null
    };
  }

  function injectStyles() {
    if ($('#monster-train-run-styles')) return;
    const style = document.createElement('style');
    style.id = 'monster-train-run-styles';
    style.textContent = `
      .monster-run-block{display:none;padding:16px;border:1px solid rgba(223,242,56,.28);border-radius:12px;background:rgba(223,242,56,.035)}
      .monster-run-block.on{display:block}
      .monster-run-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .monster-run-head b{font-size:13px;letter-spacing:.08em}
      .monster-run-head small{font-size:11px;color:var(--muted)}
      .monster-run-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
      .monster-run-grid label{font-size:14px}
      .monster-run-grid input{width:100%;margin-top:6px;font-size:17px;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:#111613}
      .monster-run-reader{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 24px;padding:14px;border:1px solid rgba(223,242,56,.24);border-radius:12px;background:rgba(223,242,56,.035)}
      .monster-run-reader div{display:grid;gap:3px}
      .monster-run-reader small{font-size:10px;letter-spacing:.12em;color:#7d8b81}
      .monster-run-reader b{font-size:18px;font-weight:700;color:#eef3ee}
      @media(max-width:700px){.monster-run-grid,.monster-run-reader{grid-template-columns:1fr}.monster-run-grid input{font-size:16px}}
    `;
    document.head.appendChild(style);
  }

  function ensureFormFields() {
    if ($('#monster-train-run-fields')) return;
    const anchor = $('#note-facets');
    if (!anchor) return;
    const block = document.createElement('div');
    block.id = 'monster-train-run-fields';
    block.className = 'full monster-run-block';
    block.innerHTML = `
      <div class="monster-run-head"><b>MONSTER TRAIN RUN</b><small>モンスタートレイン専用</small></div>
      <div class="monster-run-grid">
        <label>開始時間<input id="monster-run-start" type="time" step="60"></label>
        <label>終了時間<input id="monster-run-end" type="time" step="60"></label>
        <label>到達ステージ<input id="monster-run-stage" type="number" min="1" max="999" step="1" inputmode="numeric" placeholder="例：8"></label>
      </div>
    `;
    anchor.before(block);
  }

  function updateFormVisibility() {
    ensureFormFields();
    const block = $('#monster-train-run-fields');
    const gameId = $('#note-game')?.value || '';
    block?.classList.toggle('on', isTargetGame(gameId));
  }

  function populateForm() {
    ensureFormFields();
    const noteId = $('#note-id')?.value || '';
    const gameId = $('#note-game')?.value || '';
    updateFormVisibility();
    clearRunFields();
    if (!noteId || !isTargetGame(gameId)) return;
    const run = runs.get(String(noteId));
    if (!run) return;
    const fields = runFields();
    if (fields.start) fields.start.value = run.startTime || '';
    if (fields.end) fields.end.value = run.endTime || '';
    if (fields.stage) fields.stage.value = run.reachedStage ?? '';
  }

  async function loadRuns() {
    if (loadingRuns) return;
    loadingRuns = true;
    try {
      const res = await baseFetch(NOTE_API, { headers: authHeaders(), cache:'no-store' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      runs.clear();
      for (const item of data.runs || []) {
        if (item?.noteId && item?.run) runs.set(String(item.noteId), item.run);
      }
      if (noteOverlayOpen()) populateForm();
      queueReaderRender();
    } catch {} finally {
      loadingRuns = false;
    }
  }

  function rememberWriteResult(data) {
    const note = data?.item;
    if (!note?.id) return;
    if (note.monsterTrainRun) runs.set(String(note.id), note.monsterTrainRun);
    else runs.delete(String(note.id));
  }

  window.fetch = async (input, init = {}) => {
    const path = pathOf(input);
    if (path !== MAIN_API) return baseFetch(input, init);

    const method = methodOf(input, init);
    if ((method === 'POST' || method === 'PATCH') && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload?.entity === 'note') {
          payload.monsterTrainRun = currentRunPayload(payload.gameId);
          const headers = { ...(init.headers || {}), 'content-type':'application/json' };
          const response = await baseFetch(NOTE_API, { ...init, method, headers, body:JSON.stringify(payload) });
          if (response.ok) response.clone().json().then(rememberWriteResult).catch(() => {});
          return response;
        }
      } catch {}
    }

    const response = await baseFetch(input, init);
    if (method === 'GET' && response.ok) setTimeout(loadRuns, 0);
    return response;
  };

  function readerSignature(run) {
    return `${run?.startTime || ''}|${run?.endTime || ''}|${run?.reachedStage ?? ''}`;
  }
  function readerBlockHtml(run, noteId, signature) {
    const start = run?.startTime || '—';
    const end = run?.endTime || '—';
    const stage = run?.reachedStage ?? '—';
    return `
      <div class="monster-run-reader" id="monster-run-reader" data-note-id="${esc(noteId)}" data-signature="${esc(signature)}">
        <div><small>START</small><b>${esc(start)}</b></div>
        <div><small>END</small><b>${esc(end)}</b></div>
        <div><small>REACHED STAGE</small><b>${esc(stage)}</b></div>
      </div>
    `;
  }
  function renderReaderRun() {
    readerRenderQueued = false;
    const article = $('#reader-article');
    if (!article) return;
    const existing = $('#monster-run-reader', article);
    const noteId = String(pendingReaderNoteId || '');
    const run = noteId ? runs.get(noteId) : null;
    if (!run) {
      existing?.remove();
      return;
    }
    const signature = readerSignature(run);
    if (existing?.dataset?.noteId === noteId && existing?.dataset?.signature === signature) return;
    existing?.remove();
    const hero = $('.reader-hero', article);
    if (!hero) return;
    hero.insertAdjacentHTML('afterend', readerBlockHtml(run, noteId, signature));
  }
  function queueReaderRender() {
    if (readerRenderQueued) return;
    readerRenderQueued = true;
    requestAnimationFrame(renderReaderRun);
  }

  injectStyles();
  ensureFormFields();
  updateFormVisibility();

  $('#note-game')?.addEventListener('change', () => {
    const noteId = $('#note-id')?.value || '';
    updateFormVisibility();
    clearRunFields();
    if (noteId && isTargetGame($('#note-game')?.value)) {
      const run = runs.get(String(noteId));
      if (run) {
        const fields = runFields();
        if (fields.start) fields.start.value = run.startTime || '';
        if (fields.end) fields.end.value = run.endTime || '';
        if (fields.stage) fields.stage.value = run.reachedStage ?? '';
      }
    }
  });

  const noteOverlay = $('#note-overlay');
  if (noteOverlay) {
    new MutationObserver(() => {
      if (noteOverlayOpen()) setTimeout(populateForm, 0);
      else clearRunFields();
    }).observe(noteOverlay, { attributes:true, attributeFilter:['class','aria-hidden'] });
  }

  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest?.('[data-note]');
    if (target?.dataset?.note) pendingReaderNoteId = String(target.dataset.note);
  }, true);

  const readerArticle = $('#reader-article');
  if (readerArticle) new MutationObserver(queueReaderRender).observe(readerArticle, { childList:true, subtree:true });
  $('#reader-close')?.addEventListener('click', () => {
    pendingReaderNoteId = '';
    queueReaderRender();
  });

  loadRuns();
})();
