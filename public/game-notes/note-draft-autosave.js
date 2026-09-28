(() => {
  const STORAGE_PREFIX = 'harfway_game_notes_autodraft_v1:';
  const STORAGE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const SAVE_DELAY_MS = 450;
  const TRACKED_IDS = new Set(['note-game', 'note-type', 'note-title', 'note-body', 'note-status']);
  const $ = (selector, root = document) => root.querySelector(selector);
  let saveTimer = 0;
  let currentKey = '';
  let baselineSignature = '';
  let overlayWasOpen = false;
  let dirty = false;
  let restoring = false;
  let pendingSave = false;
  let userClosing = false;

  function storage() {
    try {
      const probe = STORAGE_PREFIX + '__probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch {
      return null;
    }
  }

  function cleanupExpiredDrafts() {
    const store = storage();
    if (!store) return;
    const now = Date.now();
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      try {
        const draft = JSON.parse(store.getItem(key) || '{}');
        const saved = Date.parse(draft.savedAt || '');
        if (!Number.isFinite(saved) || now - saved > STORAGE_TTL_MS) store.removeItem(key);
      } catch {
        store.removeItem(key);
      }
    }
  }

  function noteKey() {
    const id = String($('#note-id')?.value || '').trim();
    return STORAGE_PREFIX + (id ? 'note:' + id : 'new');
  }

  function values() {
    return {
      noteId: String($('#note-id')?.value || '').trim(),
      gameId: String($('#note-game')?.value || ''),
      typeId: String($('#note-type')?.value || ''),
      title: String($('#note-title')?.value || ''),
      body: String($('#note-body')?.value || ''),
      outputStatus: String($('#note-status')?.value || 'private')
    };
  }

  function signature(value = values()) {
    return JSON.stringify([
      value.noteId || '',
      value.gameId || '',
      value.typeId || '',
      value.title || '',
      value.body || '',
      value.outputStatus || 'private'
    ]);
  }

  function ensureStatus() {
    let status = $('#note-draft-status');
    if (status) return status;
    const foot = $('#note-form .dialog-foot');
    if (!foot) return null;
    status = document.createElement('span');
    status.id = 'note-draft-status';
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'font:800 9px ui-monospace,monospace;color:#738077;white-space:nowrap';
    const spacer = $('.spacer', foot);
    foot.insertBefore(status, spacer || foot.firstChild);
    return status;
  }

  function setStatus(message, tone = '') {
    const status = ensureStatus();
    if (!status) return;
    status.textContent = message;
    status.style.color = tone === 'ok' ? '#a9c797' : tone === 'warn' ? '#d1a67c' : '#738077';
  }

  function readDraft(key) {
    const store = storage();
    if (!store || !key) return null;
    try {
      const draft = JSON.parse(store.getItem(key) || 'null');
      if (!draft || draft.version !== 1) return null;
      const saved = Date.parse(draft.savedAt || '');
      if (!Number.isFinite(saved) || Date.now() - saved > STORAGE_TTL_MS) {
        store.removeItem(key);
        return null;
      }
      return draft;
    } catch {
      return null;
    }
  }

  function removeDraft(key = currentKey) {
    const store = storage();
    if (!store || !key) return;
    try { store.removeItem(key); } catch {}
  }

  function writeDraft() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!dirty || restoring) return;
    const store = storage();
    if (!store) {
      setStatus('下書き保存を利用できません', 'warn');
      return;
    }
    currentKey = currentKey || noteKey();
    const draft = {
      version: 1,
      ...values(),
      baseSignature: baselineSignature,
      savedAt: new Date().toISOString()
    };
    try {
      store.setItem(currentKey, JSON.stringify(draft));
      setStatus('下書き保存済み', 'ok');
    } catch {
      setStatus('下書き保存に失敗', 'warn');
    }
  }

  function scheduleDraftSave() {
    if (restoring) return;
    dirty = true;
    setStatus('下書き保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, SAVE_DELAY_MS);
  }

  function assignSelect(id, value) {
    const el = $('#' + id);
    if (!el || !value) return;
    if ([...el.options].some(option => option.value === value)) el.value = value;
  }

  function restoreDraft() {
    currentKey = noteKey();
    const initial = values();
    baselineSignature = signature(initial);
    dirty = false;
    const draft = readDraft(currentKey);
    if (!draft) {
      setStatus('下書き自動保存 ON');
      return;
    }
    // Existing notes only auto-restore when the saved server version still matches
    // the version that the local draft started from.
    if (initial.noteId && draft.baseSignature && draft.baseSignature !== baselineSignature) {
      setStatus('保存済み内容が更新済み・下書きは保留', 'warn');
      return;
    }
    restoring = true;
    assignSelect('note-game', draft.gameId);
    assignSelect('note-type', draft.typeId);
    assignSelect('note-status', draft.outputStatus);
    if ($('#note-title')) $('#note-title').value = String(draft.title || '');
    if ($('#note-body')) $('#note-body').value = String(draft.body || '');
    restoring = false;
    dirty = true;
    setStatus('下書きを復元しました', 'ok');
  }

  function overlayOpen() {
    return Boolean($('#note-overlay')?.classList.contains('on'));
  }

  function onOverlayState() {
    const open = overlayOpen();
    if (open && !overlayWasOpen) {
      overlayWasOpen = true;
      pendingSave = false;
      userClosing = false;
      clearTimeout(saveTimer);
      setTimeout(restoreDraft, 0);
      return;
    }
    if (!open && overlayWasOpen) {
      if (pendingSave && !userClosing) {
        clearTimeout(saveTimer);
        removeDraft();
        dirty = false;
      } else if (dirty) {
        writeDraft();
      }
      overlayWasOpen = false;
      pendingSave = false;
      userClosing = false;
    }
  }

  function init() {
    cleanupExpiredDrafts();
    const overlay = $('#note-overlay');
    const form = $('#note-form');
    const saveButton = $('#save-note');
    if (!overlay || !form || !saveButton) return;
    ensureStatus();

    form.addEventListener('input', event => {
      if (TRACKED_IDS.has(event.target?.id)) scheduleDraftSave();
    });
    form.addEventListener('change', event => {
      if (TRACKED_IDS.has(event.target?.id)) scheduleDraftSave();
    });
    form.addEventListener('submit', () => {
      pendingSave = true;
      userClosing = false;
      if (dirty) writeDraft();
    });

    // Save immediately before backdrop / cancel / × can close the modal.
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest?.('[data-close="note"]')) {
        userClosing = true;
        pendingSave = false;
        if (dirty) writeDraft();
      }
    }, true);

    new MutationObserver(onOverlayState).observe(overlay, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden']
    });

    // If a save request fails, runtime-core re-enables the save button while
    // the dialog stays open. Keep the local draft in that case.
    new MutationObserver(() => {
      if (pendingSave && !saveButton.disabled && overlayOpen()) pendingSave = false;
    }).observe(saveButton, { attributes: true, attributeFilter: ['disabled'] });

    window.addEventListener('pagehide', () => {
      if (overlayOpen() && dirty) writeDraft();
    });

    onOverlayState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
