(() => {
  if (window.__HARFWAY_PRIVATE_TOOL_SHELL__) return;
  window.__HARFWAY_PRIVATE_TOOL_SHELL__ = true;

  const PATHS = { notes: '/game-notes/', workflow: '/game-notes/workflow/', clips: '/private-clips/' };
  const LABELS = { notes: 'NOTES', workflow: 'WORKFLOW', clips: 'CLIPS' };
  const MODE_KEY = 'harfway_private_tools_writing_mode';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const path = location.pathname;
  const current = path.startsWith(PATHS.workflow) ? 'workflow' : path.startsWith(PATHS.clips) ? 'clips' : 'notes';
  const countChars = (value) => Array.from(String(value || '')).length;

  function sameTabInternalLinks() {
    $$('a').forEach((a) => {
      let u; try { u = new URL(a.href, location.href); } catch { return; }
      if (u.origin !== location.origin) return;
      if (u.pathname.startsWith('/game-notes/') || u.pathname.startsWith('/private-clips/')) {
        a.removeAttribute('target'); a.removeAttribute('rel');
      }
    });
  }

  function removeLegacyLaunchers() {
    ['workflow-open-link','private-clips-open-link','private-clips-nav-link'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.closest('#hw-private-tool-shell')) el.remove();
    });
    if (current === 'workflow') {
      $$('.topbar .back').forEach((el) => {
        try { const u = new URL(el.href, location.href); if (u.origin === location.origin && u.pathname.startsWith('/game-notes/')) el.remove(); } catch {}
      });
    }
  }

  function installStyle() {
    if ($('#hw-private-tool-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'hw-private-tool-shell-style';
    style.textContent = `
      #hw-private-tool-shell{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif}
      #hw-private-tool-shell a,#hw-private-tool-shell button{appearance:none;border:1px solid rgba(151,162,154,.28);background:rgba(23,29,25,.92);color:#c8d1ca;border-radius:9px;padding:9px 11px;text-decoration:none;font-size:10px;line-height:1;font-weight:900;letter-spacing:.04em;cursor:pointer;white-space:nowrap}
      #hw-private-tool-shell a:hover,#hw-private-tool-shell button:hover{border-color:rgba(223,242,56,.55);color:#eef3ee}
      #hw-private-tool-shell a.on{background:#dff238;color:#111610;border-color:#dff238}
      #hw-private-tool-shell button.on{border-color:#dff238;color:#dff238}
      #hw-private-tool-shell .hw-sep{width:1px;height:22px;background:rgba(151,162,154,.22);margin:0 2px}
      #hw-count-popover{position:fixed;right:18px;top:82px;z-index:9999;width:min(360px,calc(100vw - 28px));background:#111713;color:#e7eee8;border:1px solid #3a473d;border-radius:12px;box-shadow:0 18px 60px #0008;padding:16px;display:none;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif}
      #hw-count-popover.on{display:block}#hw-count-popover .hw-count-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}#hw-count-popover .hw-count-head b{font-size:12px;letter-spacing:.04em}#hw-count-popover .hw-count-close{border:0;background:transparent;color:#8d9a90;font-size:18px;cursor:pointer;padding:0}#hw-count-popover .hw-count-row{display:grid;grid-template-columns:1fr auto;gap:12px;padding:9px 0;border-top:1px solid #273129;font-size:12px}#hw-count-popover .hw-count-row strong{font:900 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#dff238}#hw-count-popover .hw-count-note{margin:8px 0 0;color:#7f8c82;font-size:10px;line-height:1.6}
      body.hw-writing-vertical textarea[data-hw-writing],body.hw-writing-vertical [data-hw-writing="read"]{writing-mode:vertical-rl;text-orientation:mixed;line-break:strict}
      body.hw-writing-vertical textarea[data-hw-writing]{min-height:300px;min-width:220px;max-width:100%;padding:16px;overflow:auto;resize:both}
      body.hw-writing-vertical [data-hw-writing="read"]{max-height:70vh;min-height:240px;overflow:auto;padding:12px 8px;white-space:pre-wrap}
      @media(max-width:760px){#hw-private-tool-shell{width:100%;margin-left:0;justify-content:flex-start;gap:5px;overflow-x:auto;flex-wrap:nowrap;padding-top:8px}#hw-private-tool-shell a,#hw-private-tool-shell button{font-size:9px;padding:8px 9px}#hw-private-tool-shell .hw-sep{flex:0 0 1px}#hw-count-popover{top:auto;right:10px;left:10px;bottom:14px;width:auto}}
    `;
    document.head.appendChild(style);
  }

  function markWritingTargets() {
    if (current === 'notes') {
      ['#quick-body','#note-body'].forEach((s) => { const el = $(s); if (el) el.dataset.hwWriting = 'input'; });
      ['.reader-copy','.card p','.library-item .body p'].forEach((s) => $$(s).forEach((el) => el.dataset.hwWriting = 'read'));
    } else if (current === 'clips') {
      const body = $('#clip-body'); if (body) body.dataset.hwWriting = 'input';
      ['.clip h3','.clip p','.random-card h3','.random-card p'].forEach((s) => $$(s).forEach((el) => el.dataset.hwWriting = 'read'));
    } else {
      ['.card h2','.copy'].forEach((s) => $$(s).forEach((el) => el.dataset.hwWriting = 'read'));
    }
  }

  function applyWritingMode(mode) {
    const vertical = mode === 'vertical';
    document.body.classList.toggle('hw-writing-vertical', vertical);
    const btn = $('#hw-writing-toggle');
    if (btn) { btn.classList.toggle('on', vertical); btn.textContent = vertical ? '横書きへ' : '縦書き'; btn.setAttribute('aria-pressed', String(vertical)); }
  }

  function preferredHost() {
    if (current === 'workflow') return $('.topbar') || $('header') || document.body;
    return $('.top') || $('header') || document.body;
  }

  function makeShell() {
    if ($('#hw-private-tool-shell')) return;
    removeLegacyLaunchers();
    const shell = document.createElement('nav');
    shell.id = 'hw-private-tool-shell'; shell.setAttribute('aria-label','Private tools');
    Object.entries(PATHS).forEach(([id, href]) => { const a = document.createElement('a'); a.href = href; a.textContent = LABELS[id]; if (id === current) a.classList.add('on'); shell.appendChild(a); });
    const sep = document.createElement('span'); sep.className = 'hw-sep'; shell.appendChild(sep);
    const writing = document.createElement('button'); writing.type = 'button'; writing.id = 'hw-writing-toggle'; writing.addEventListener('click', () => { const next = document.body.classList.contains('hw-writing-vertical') ? 'horizontal' : 'vertical'; localStorage.setItem(MODE_KEY,next); applyWritingMode(next); markWritingTargets(); }); shell.appendChild(writing);
    const count = document.createElement('button'); count.type = 'button'; count.id = 'hw-count-toggle'; count.textContent = '文字数'; count.addEventListener('click', showCount); shell.appendChild(count);
    preferredHost().appendChild(shell);
    applyWritingMode(localStorage.getItem(MODE_KEY) || 'horizontal');
  }

  function visible(el) { if (!el) return false; const style = getComputedStyle(el); if (style.display === 'none' || style.visibility === 'hidden') return false; return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function extractCounts() {
    const rows = [];
    if (current === 'notes') {
      const overlay = $('#note-overlay'), reader = $('#reader-overlay');
      if (overlay && overlay.classList.contains('on')) { rows.push(['タイトル',countChars($('#note-title')?.value)]); rows.push(['本文',countChars($('#note-body')?.value)]); }
      else if (reader && reader.classList.contains('on')) { rows.push(['タイトル',countChars($('.reader-title')?.textContent)]); rows.push(['本文',countChars($('.reader-copy')?.textContent)]); }
      else rows.push(['クイックメモ',countChars($('#quick-body')?.value)]);
    } else if (current === 'clips') {
      rows.push(['タイトル',countChars($('#clip-title')?.value)]); rows.push(['本文',countChars($('#clip-body')?.value)]);
    } else {
      const focused = document.activeElement;
      if (focused && visible(focused) && (focused.tagName === 'TEXTAREA' || (focused.tagName === 'INPUT' && !['password','search'].includes(focused.type)))) rows.push(['入力中',countChars(focused.value)]);
      else rows.push(['表示中の説明文',countChars($$('.card .copy').filter(visible).map((el) => el.textContent || '').join('\n'))]);
    }
    const total = rows.reduce((sum,[,n]) => sum + Number(n || 0),0); if (rows.length > 1) rows.push(['合計',total]); return rows;
  }

  function ensureCountPopover() { let pop = $('#hw-count-popover'); if (pop) return pop; pop = document.createElement('aside'); pop.id = 'hw-count-popover'; document.body.appendChild(pop); return pop; }
  function showCount() { const pop = ensureCountPopover(), rows = extractCounts(); pop.innerHTML = `<div class="hw-count-head"><b>文字数</b><button class="hw-count-close" type="button" aria-label="閉じる">×</button></div>${rows.map(([label,n]) => `<div class="hw-count-row"><span>${label}</span><strong>${n}文字</strong></div>`).join('')}<p class="hw-count-note">改行・記号も1文字として数えます。</p>`; pop.classList.add('on'); $('.hw-count-close',pop)?.addEventListener('click',() => pop.classList.remove('on')); }

  function boot() {
    installStyle(); sameTabInternalLinks(); makeShell(); markWritingTargets(); applyWritingMode(localStorage.getItem(MODE_KEY) || 'horizontal');
    const observer = new MutationObserver(() => { removeLegacyLaunchers(); sameTabInternalLinks(); markWritingTargets(); });
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
