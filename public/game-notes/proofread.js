(() => {
  const API = '/api/game-notes-proofread';
  const KIND_LABELS = {
    typo: '誤字',
    missing: '脱字',
    duplicate: '重複',
    grammar: '文法',
    punctuation: '記号',
    notation: '表記'
  };
  const state = { suggestions: [], loading: false };
  const $ = (selector, root = document) => root.querySelector(selector);

  function authHeaders(extra = {}) {
    const key = sessionStorage.getItem('harfway_game_notes_key') || '';
    return { ...extra, ...(key ? { 'x-admin-key': key } : {}) };
  }

  function toast(message, bad = false) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.style.background = bad ? '#8d4848' : '';
    el.classList.add('on');
    clearTimeout(el._proofreadTimer);
    el._proofreadTimer = setTimeout(() => {
      el.classList.remove('on');
      el.style.background = '';
    }, 2200);
  }

  function injectStyles() {
    if ($('#game-note-proofread-styles')) return;
    const style = document.createElement('style');
    style.id = 'game-note-proofread-styles';
    style.textContent = `
      #proofread-note{border-color:#647064;color:#d6dfd6}
      #proofread-note:disabled{opacity:.45;cursor:wait}
      .proofread-panel{grid-column:1/-1;display:none;border:1px solid #465147;border-radius:10px;background:#111713;overflow:hidden}
      .proofread-panel.on{display:block}
      .proofread-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-bottom:1px solid var(--line)}
      .proofread-head b{font:900 10px ui-monospace,monospace;letter-spacing:.08em;color:#c8d3c9}
      .proofread-head span{font-size:9px;color:var(--muted);line-height:1.5;text-align:right}
      .proofread-empty,.proofread-loading,.proofread-error{padding:16px 13px;color:#88958a;font-size:11px;line-height:1.7}
      .proofread-error{color:#d7a0a0}
      .proofread-list{display:grid}
      .proofread-item{padding:13px;border-bottom:1px solid var(--line)}
      .proofread-item:last-child{border-bottom:0}
      .proofread-meta{display:flex;align-items:center;gap:7px;margin-bottom:8px}
      .proofread-kind{display:inline-flex;border:1px solid #5d6c60;border-radius:999px;padding:4px 7px;font:900 8px ui-monospace,monospace;color:#dff238}
      .proofread-field{font:800 8px ui-monospace,monospace;color:#758178}
      .proofread-change{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
      .proofread-text{border:1px solid var(--line);background:#171d19;border-radius:7px;padding:9px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.6}
      .proofread-arrow{color:#718078;font-weight:900}
      .proofread-reason{margin-top:8px;color:#869188;font-size:10px;line-height:1.6}
      .proofread-actions{display:flex;justify-content:flex-end;margin-top:9px}
      .proofread-actions button{border:1px solid #607063;background:#1b241d;color:#dbe5dc;border-radius:7px;padding:7px 10px;font-size:10px;font-weight:900;cursor:pointer}
      .proofread-item.applied{opacity:.55}.proofread-item.applied .proofread-actions button{cursor:default}
      @media(max-width:700px){.proofread-change{grid-template-columns:1fr}.proofread-arrow{transform:rotate(90deg);justify-self:center}.proofread-head{align-items:flex-start;flex-direction:column}.proofread-head span{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    injectStyles();
    const form = $('#note-form');
    const body = $('#note-body');
    const foot = $('#note-form .dialog-foot');
    if (!form || !body || !foot) return false;

    if (!$('#proofread-note')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost';
      button.id = 'proofread-note';
      button.textContent = '誤字脱字チェック';
      const cancel = foot.querySelector('[data-close="note"]');
      foot.insertBefore(button, cancel || $('#save-note'));
      button.addEventListener('click', runProofread);
    }

    if (!$('#note-proofread-panel')) {
      const panel = document.createElement('section');
      panel.id = 'note-proofread-panel';
      panel.className = 'proofread-panel';
      panel.setAttribute('aria-live', 'polite');
      const label = body.closest('label');
      label?.insertAdjacentElement('afterend', panel);
    }

    body.setAttribute('spellcheck', 'true');
    return true;
  }

  function setPanel(htmlClass, message) {
    const panel = $('#note-proofread-panel');
    if (!panel) return;
    panel.classList.add('on');
    panel.innerHTML = '';
    const div = document.createElement('div');
    div.className = htmlClass;
    div.textContent = message;
    panel.appendChild(div);
  }

  function fieldLabel(field) {
    return field === 'title' ? 'タイトル' : '本文';
  }

  function currentField(field) {
    return field === 'title' ? $('#note-title') : $('#note-body');
  }

  function renderSuggestions() {
    const panel = $('#note-proofread-panel');
    if (!panel) return;
    panel.classList.add('on');
    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'proofread-head';
    const title = document.createElement('b');
    title.textContent = `PROOFREAD · ${state.suggestions.length}件`;
    const help = document.createElement('span');
    help.textContent = 'AIは候補を出すだけです。本文は自動で書き換えません。';
    head.append(title, help);
    panel.appendChild(head);

    if (!state.suggestions.length) {
      const empty = document.createElement('div');
      empty.className = 'proofread-empty';
      empty.textContent = '明確な誤字脱字は見つかりませんでした。';
      panel.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'proofread-list';
    state.suggestions.forEach((suggestion, index) => {
      const item = document.createElement('article');
      item.className = 'proofread-item';
      item.dataset.proofreadIndex = String(index);

      const meta = document.createElement('div');
      meta.className = 'proofread-meta';
      const kind = document.createElement('span');
      kind.className = 'proofread-kind';
      kind.textContent = KIND_LABELS[suggestion.kind] || '校正';
      const field = document.createElement('span');
      field.className = 'proofread-field';
      field.textContent = fieldLabel(suggestion.field);
      meta.append(kind, field);

      const change = document.createElement('div');
      change.className = 'proofread-change';
      const before = document.createElement('div');
      before.className = 'proofread-text';
      before.textContent = suggestion.before;
      const arrow = document.createElement('span');
      arrow.className = 'proofread-arrow';
      arrow.textContent = '→';
      const after = document.createElement('div');
      after.className = 'proofread-text';
      after.textContent = suggestion.after;
      change.append(before, arrow, after);

      const reason = document.createElement('div');
      reason.className = 'proofread-reason';
      reason.textContent = suggestion.reason || '明確な誤字脱字候補です。';

      const actions = document.createElement('div');
      actions.className = 'proofread-actions';
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.dataset.applyProofread = String(index);
      apply.textContent = 'この修正を反映';
      actions.appendChild(apply);

      item.append(meta, change, reason, actions);
      list.appendChild(item);
    });
    panel.appendChild(list);
  }

  function errorMessage(code) {
    if (code === 'admin_key_required' || code === 'invalid_admin_key') return '管理キーを確認してください。';
    if (code === 'body_too_long') return '本文が長すぎます。3万文字以内で校正してください。';
    if (code === 'ai_budget_exceeded') return 'AI校正の利用上限に達しています。';
    if (code === 'ai_rate_limited') return 'AI校正が混み合っています。少し時間を置いて再度お試しください。';
    if (code === 'ai_gateway_auth_unavailable') return 'AI校正の接続設定を確認できませんでした。';
    if (code === 'ai_proofread_timeout') return '校正が時間切れになりました。もう一度お試しください。';
    return '校正に失敗しました。もう一度お試しください。';
  }

  async function runProofread() {
    if (state.loading) return;
    const title = String($('#note-title')?.value || '');
    const body = String($('#note-body')?.value || '').trim();
    if (!body) return toast('先に本文を入力してください', true);

    const button = $('#proofread-note');
    state.loading = true;
    if (button) {
      button.disabled = true;
      button.textContent = '校正中…';
    }
    setPanel('proofread-loading', '誤字脱字だけを確認しています…');

    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ title, body }),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `http_${response.status}`);
      state.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      renderSuggestions();
    } catch (error) {
      state.suggestions = [];
      setPanel('proofread-error', errorMessage(error.message));
    } finally {
      state.loading = false;
      if (button) {
        button.disabled = false;
        button.textContent = '誤字脱字チェック';
      }
    }
  }

  function occurrenceCount(text, query) {
    if (!query) return 0;
    let count = 0;
    let cursor = 0;
    while (cursor <= text.length) {
      const found = text.indexOf(query, cursor);
      if (found < 0) break;
      count += 1;
      if (count > 1) break;
      cursor = found + Math.max(1, query.length);
    }
    return count;
  }

  function applySuggestion(index) {
    const suggestion = state.suggestions[index];
    if (!suggestion) return;
    const field = currentField(suggestion.field);
    if (!field) return;
    const text = String(field.value || '');
    const count = occurrenceCount(text, suggestion.before);
    if (count !== 1) {
      return toast(count === 0
        ? '本文が変わったため、この候補は反映できません。もう一度チェックしてください。'
        : '同じ文字列が複数あるため、自動反映せずもう一度チェックしてください。', true);
    }
    const at = text.indexOf(suggestion.before);
    field.value = text.slice(0, at) + suggestion.after + text.slice(at + suggestion.before.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const item = `[data-proofread-index="${CSS.escape(String(index))}"]`;
    const row = $(item);
    if (row) {
      row.classList.add('applied');
      const button = $('[data-apply-proofread]', row);
      if (button) {
        button.disabled = true;
        button.textContent = '反映済み';
      }
    }
    toast('修正を反映しました');
  }

  function resetPanel() {
    state.suggestions = [];
    const panel = $('#note-proofread-panel');
    if (panel) {
      panel.classList.remove('on');
      panel.innerHTML = '';
    }
  }

  function init() {
    if (!ensureUi()) return;
    $('#note-proofread-panel')?.addEventListener('click', event => {
      const button = event.target.closest('[data-apply-proofread]');
      if (!button) return;
      applySuggestion(Number(button.dataset.applyProofread));
    });

    const overlay = $('#note-overlay');
    if (overlay) {
      let wasOpen = overlay.classList.contains('on');
      new MutationObserver(() => {
        const open = overlay.classList.contains('on');
        if (open && !wasOpen) resetPanel();
        wasOpen = open;
      }).observe(overlay, { attributes:true, attributeFilter:['class','aria-hidden'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
