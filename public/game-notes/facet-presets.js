(() => {
  const API = '/api/game-notes-presets';
  const state = { presets: [], facets: [], editingId: '', loading: false };
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let facetRefreshTimer = 0;

  function authHeaders(extra = {}) {
    const key = sessionStorage.getItem('harfway_game_notes_key') || '';
    return { ...extra, ...(key ? { 'x-admin-key': key } : {}) };
  }
  function toast(message, bad = false) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.style.background = bad ? '#d58d8d' : '';
    el.classList.add('on');
    clearTimeout(el._facetPresetTimer);
    el._facetPresetTimer = setTimeout(() => el.classList.remove('on'), 1800);
  }
  async function jsonFetch(path, options = {}) {
    const headers = authHeaders(options.body ? { 'content-type':'application/json' } : {});
    const res = await fetch(path, { ...options, headers:{ ...headers, ...(options.headers || {}) }, cache:'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || `http_${res.status}`), { status:res.status, data });
    return data;
  }
  async function loadFacets() {
    const res = await fetch('/api/game-notes', { headers:authHeaders(), cache:'no-store' });
    if (!res.ok) throw Object.assign(new Error(`http_${res.status}`), { status:res.status });
    const data = await res.json();
    state.facets = Array.isArray(data.facets) ? data.facets : [];
  }
  async function loadPresets() {
    const data = await jsonFetch(API);
    state.presets = Array.isArray(data.presets) ? data.presets : [];
  }
  async function refreshAll() {
    if (state.loading) return;
    state.loading = true;
    try {
      await Promise.all([loadFacets(), loadPresets()]);
      ensureEditorPanel();
      renderEditorPanel();
      ensurePresetBar(true);
    } catch (error) {
      if (error.status !== 401) console.warn('[facet-presets]', error.message);
    } finally {
      state.loading = false;
    }
  }
  async function refreshFacets() {
    clearTimeout(facetRefreshTimer);
    facetRefreshTimer = setTimeout(async () => {
      try {
        await loadFacets();
        renderEditorPanel();
        ensurePresetBar(true);
      } catch {}
    }, 180);
  }

  function facetName(id) {
    return state.facets.find(f => f.id === id)?.name || '';
  }
  function presetFacetNames(preset) {
    return (preset?.facetIds || []).map(facetName).filter(Boolean);
  }

  function injectStyles() {
    if ($('#facet-preset-styles')) return;
    const style = document.createElement('style');
    style.id = 'facet-preset-styles';
    style.textContent = `
      .facet-preset-panel .preset-form{display:grid;gap:12px;margin:0 0 16px;padding:14px;border:1px solid var(--line);border-radius:10px;background:#151a17}
      .facet-preset-panel .preset-form-top{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:8px;align-items:center}
      .facet-preset-panel .preset-form input{width:100%;border:1px solid var(--line);background:#121714;border-radius:8px;padding:11px;outline:0}
      .preset-facet-options{display:flex;flex-wrap:wrap;gap:7px}
      .preset-facet-option{position:relative;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:7px 10px;font-size:11px;color:#aeb8b0;background:#111613;cursor:pointer}
      .preset-facet-option input{width:auto;margin:0;accent-color:var(--accent)}
      .preset-list{display:grid;gap:8px}
      .preset-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:11px 12px;background:#151a17}
      .preset-item b{font-size:12px}.preset-item small{display:block;margin-top:5px;color:var(--muted);font-size:10px;line-height:1.6}
      .preset-actions{display:flex;gap:6px}.preset-actions button{padding:7px 9px;font-size:10px}
      .facet-preset-bar{display:grid;gap:8px;padding:14px;border:1px solid #51604f;border-radius:10px;background:#182019}
      .facet-preset-bar-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.facet-preset-bar-head b{font:850 11px ui-monospace,monospace;color:var(--accent2)}
      .facet-preset-controls{display:grid;grid-template-columns:1fr auto;gap:7px}.facet-preset-controls select{width:100%;border:1px solid var(--line);background:#121714;border-radius:8px;padding:10px;outline:0}
      .facet-preset-summary{min-height:16px;color:var(--muted);font-size:10px;line-height:1.55}
      @media(max-width:700px){.facet-preset-panel .preset-form-top{grid-template-columns:1fr}.preset-item{grid-template-columns:1fr}.facet-preset-controls{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureEditorPanel() {
    const grid = $('#view-editor .editor-grid');
    if (!grid || $('#facet-presets-panel')) return;
    const panel = document.createElement('div');
    panel.className = 'panel full facet-preset-panel';
    panel.id = 'facet-presets-panel';
    panel.innerHTML = '<h2>FACET PRESETS</h2><div id="facet-presets-body"></div>';
    grid.appendChild(panel);

    panel.addEventListener('submit', async (event) => {
      if (!event.target.matches('#facet-preset-form')) return;
      event.preventDefault();
      const name = $('#facet-preset-name', panel)?.value.trim() || '';
      const facetIds = [...panel.querySelectorAll('[name="preset-facet"]:checked')].map(input => input.value);
      if (!name) return toast('プリセット名を入力してください', true);
      if (!facetIds.length) return toast('ファセットを1つ以上選んでください', true);
      const payload = { name, facetIds, ...(state.editingId ? { id:state.editingId } : {}) };
      try {
        await jsonFetch(API, { method:state.editingId ? 'PATCH' : 'POST', body:JSON.stringify(payload) });
        state.editingId = '';
        await loadPresets();
        renderEditorPanel();
        ensurePresetBar(true);
        toast(payload.id ? 'プリセットを更新しました' : 'プリセットを追加しました');
      } catch (error) {
        toast(error.message === 'duplicate_preset_name' ? '同名のプリセットがあります' : error.message, true);
      }
    });

    panel.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-edit-preset]');
      if (edit) {
        state.editingId = edit.dataset.editPreset;
        renderEditorPanel();
        $('#facet-preset-name', panel)?.focus();
        return;
      }
      const cancel = event.target.closest('[data-cancel-preset]');
      if (cancel) {
        state.editingId = '';
        renderEditorPanel();
        return;
      }
      const del = event.target.closest('[data-delete-preset]');
      if (del) {
        const preset = state.presets.find(p => p.id === del.dataset.deletePreset);
        if (!preset || !confirm(`プリセット「${preset.name}」を削除しますか？`)) return;
        try {
          await jsonFetch(API, { method:'DELETE', body:JSON.stringify({ id:preset.id }) });
          if (state.editingId === preset.id) state.editingId = '';
          await loadPresets();
          renderEditorPanel();
          ensurePresetBar(true);
          toast('プリセットを削除しました');
        } catch (error) { toast(error.message, true); }
      }
    });
  }

  function renderEditorPanel() {
    ensureEditorPanel();
    const root = $('#facet-presets-body');
    if (!root) return;
    const editing = state.presets.find(p => p.id === state.editingId) || null;
    const checked = new Set(editing?.facetIds || []);
    const options = state.facets.length
      ? state.facets.map(f => `<label class="preset-facet-option"><input type="checkbox" name="preset-facet" value="${esc(f.id)}" ${checked.has(f.id)?'checked':''}><span>${esc(f.name)}</span></label>`).join('')
      : '<span class="help">先にFACETSへ分類軸を追加してください。</span>';
    const list = state.presets.length
      ? state.presets.map(p => {
          const names = presetFacetNames(p);
          return `<div class="preset-item"><div><b>${esc(p.name)}</b><small>${names.length ? names.map(esc).join(' ・ ') : '有効なファセットがありません'}</small></div><div class="preset-actions"><button type="button" class="ghost" data-edit-preset="${esc(p.id)}">編集</button><button type="button" class="danger" data-delete-preset="${esc(p.id)}">削除</button></div></div>`;
        }).join('')
      : '<div class="empty">よく使うファセットの組み合わせをプリセットにできます。</div>';

    root.innerHTML = `
      <form class="preset-form" id="facet-preset-form">
        <div class="preset-form-top"><input id="facet-preset-name" placeholder="例：モンスタートレイン記録" value="${esc(editing?.name || '')}" required><button class="primary" type="submit">${editing?'更新':'プリセット追加'}</button>${editing?'<button class="ghost" type="button" data-cancel-preset>キャンセル</button>':''}</div>
        <div><small class="help">このプリセットで一括表示するファセット</small><div class="preset-facet-options" style="margin-top:8px">${options}</div></div>
      </form>
      <div class="preset-list">${list}</div>
    `;
  }

  function presetBarHtml() {
    const options = state.presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `<div class="full facet-preset-bar" data-facet-preset-bar>
      <div class="facet-preset-bar-head"><b>PRESET</b><span class="help">必要な入力欄をまとめて開く</span></div>
      <div class="facet-preset-controls"><select id="note-facet-preset" ${state.presets.length?'':'disabled'}><option value="">${state.presets.length?'プリセットを選択':'EDITORでプリセットを作成'}</option>${options}</select><button type="button" class="ghost" data-apply-facet-preset ${state.presets.length?'':'disabled'}>使う</button></div>
      <div class="facet-preset-summary" id="facet-preset-summary"></div>
    </div>`;
  }
  function updatePresetSummary() {
    const select = $('#note-facet-preset');
    const root = $('#facet-preset-summary');
    if (!select || !root) return;
    const preset = state.presets.find(p => p.id === select.value);
    const names = presetFacetNames(preset);
    root.textContent = names.length ? names.join(' / ') : '';
  }
  function ensurePresetBar(force = false) {
    const host = $('#note-facets');
    if (!host) return;
    const current = $('[data-facet-preset-bar]', host);
    if (current && !force) return;
    if (current) current.remove();
    host.insertAdjacentHTML('afterbegin', presetBarHtml());
    updatePresetSummary();
  }
  function applyPreset(id) {
    const preset = state.presets.find(p => p.id === id);
    const host = $('#note-facets');
    if (!preset || !host) return;
    let added = 0;
    for (const facetId of preset.facetIds || []) {
      if (host.querySelector(`[data-facet-id="${CSS.escape(facetId)}"]`)) continue;
      const picker = $('#note-facet-picker', host);
      if (!picker || ![...picker.options].some(option => option.value === facetId)) continue;
      picker.value = facetId;
      const button = $('[data-attach-facet]', host);
      if (!button) continue;
      button.click();
      added += 1;
    }
    ensurePresetBar(true);
    const select = $('#note-facet-preset');
    if (select) select.value = id;
    updatePresetSummary();
    toast(added ? `${preset.name}：${added}項目を追加しました` : `${preset.name}：すでに追加済みです`);
  }

  function bindNotePresetEvents() {
    const host = $('#note-facets');
    if (!host || host.dataset.presetEventsBound) return;
    host.dataset.presetEventsBound = '1';
    host.addEventListener('change', event => {
      if (event.target.matches('#note-facet-preset')) updatePresetSummary();
    });
    host.addEventListener('click', event => {
      const button = event.target.closest('[data-apply-facet-preset]');
      if (!button) return;
      const id = $('#note-facet-preset', host)?.value || '';
      if (!id) return toast('プリセットを選んでください', true);
      applyPreset(id);
    });
    const observer = new MutationObserver(() => ensurePresetBar());
    observer.observe(host, { childList:true });
  }

  function observeFacetDictionary() {
    const root = $('#editor-facets');
    if (!root) return;
    const observer = new MutationObserver(() => refreshFacets());
    observer.observe(root, { childList:true, subtree:true });
  }

  function boot() {
    injectStyles();
    ensureEditorPanel();
    bindNotePresetEvents();
    observeFacetDictionary();
    document.addEventListener('click', event => {
      if (event.target.closest('[data-view="editor"]')) setTimeout(refreshAll, 60);
      if (event.target.closest('#open-note,#quick-full,#game-add,[data-note]')) setTimeout(() => ensurePresetBar(true), 60);
    });
    $('#unlock-form')?.addEventListener('submit', () => setTimeout(refreshAll, 500));
    refreshAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
