(() => {
  const LABEL_API = '/api/ways-labels';
  const initialLabel = new URLSearchParams(location.search).get('label') || '';
  let activeLabel = '';
  let catalog = [];
  let assignments = {};
  let menuOpen = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const labelsOf = (x) => Array.isArray(x?.labels) ? x.labels.map(v => String(v || '').trim()).filter(Boolean) : [];

  const originalTypeItems = typeof typeItems === 'function' ? typeItems : (() => items.slice());
  typeItems = function waysLabelAwareTypeItems() {
    if (activeLabel) return items.filter(x => labelsOf(x).includes(activeLabel));
    return originalTypeItems();
  };

  function labelCount(name) {
    const found = catalog.find(x => x.name === name);
    if (found) return Number(found.count || 0);
    return items.filter(x => labelsOf(x).includes(name)).length;
  }

  function ensureMenu() {
    let menu = document.querySelector('#waysLabelMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'waysLabelMenu';
    menu.className = 'ways-label-menu';
    menu.innerHTML = '<div class="ways-label-menu-head"><div><b>WAYS / LABELS</b><span>テーマから、見る棚を選ぶ。</span></div><button type="button" data-ways-label-close aria-label="閉じる">×</button></div><div class="ways-label-menu-list"></div>';
    menu.addEventListener('click', (e) => {
      if (e.target.closest('[data-ways-label-close]')) { setMenu(false); return; }
      const btn = e.target.closest('[data-ways-label-choice]');
      if (!btn) return;
      const name = decodeURIComponent(btn.dataset.waysLabelChoice || '');
      setLabel(name);
      setMenu(false);
    });
    document.body.appendChild(menu);
    return menu;
  }

  function renderMenu() {
    const menu = ensureMenu();
    const list = menu.querySelector('.ways-label-menu-list');
    if (!list) return;
    if (!catalog.length) {
      list.innerHTML = '<div class="ways-label-menu-empty">まだLABELがありません。編集エディターから作成できます。</div>';
      return;
    }
    list.innerHTML = catalog.map(({ name, count }) => `
      <button type="button" class="ways-label-choice${name === activeLabel ? ' on' : ''}" data-ways-label-choice="${encodeURIComponent(name)}">
        <span>${esc(name)}</span><small>${Number(count || labelCount(name))} GAMES</small>
      </button>`).join('');
  }

  function setMenu(open) {
    menuOpen = Boolean(open);
    const menu = ensureMenu();
    menu.classList.toggle('open', menuOpen);
    document.querySelectorAll('[data-ways-labels-open]').forEach(btn => btn.classList.toggle('open', menuOpen));
    if (menuOpen) renderMenu();
  }

  function injectDesktopButton() {
    const context = document.querySelector('#shelfContext');
    if (!context || context.querySelector('[data-ways-labels-open]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ways-type-pill ways-labels-pill';
    btn.dataset.waysLabelsOpen = '1';
    btn.textContent = 'LABELS';
    btn.addEventListener('click', (e) => { e.preventDefault(); setMenu(!menuOpen); });
    const tip = context.querySelector('[data-ways-type="tip"]');
    if (tip) tip.insertAdjacentElement('afterend', btn); else context.prepend(btn);
  }

  function injectMobileButton() {
    const context = document.querySelector('.ways-mobile-type');
    if (!context || context.querySelector('[data-ways-labels-open]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.waysLabelsOpen = '1';
    btn.textContent = 'LABELS';
    btn.addEventListener('click', () => setMenu(!menuOpen));
    context.appendChild(btn);
  }

  function syncLabelUI() {
    injectDesktopButton();
    injectMobileButton();
    document.querySelectorAll('[data-ways-labels-open]').forEach(btn => {
      btn.classList.toggle('active', Boolean(activeLabel));
      btn.classList.toggle('open', menuOpen);
    });
    if (activeLabel) {
      document.querySelectorAll('[data-ways-type]').forEach(btn => btn.classList.remove('active'));
      const pill = document.querySelector('#shelfContext .context-pill');
      if (pill) pill.textContent = `LABEL / ${activeLabel} · ${filtered.length} GAMES`;
      document.body.classList.remove('ways-tip-mode');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#090909');
    }
    renderMenu();
  }

  const baseRenderShelfContext = renderShelfContext;
  renderShelfContext = function waysLabelRenderShelfContext() {
    baseRenderShelfContext();
    syncLabelUI();
  };

  function showEmptyLabel() {
    const shelf = document.querySelector('#shelf');
    if (shelf) shelf.innerHTML = '<div style="grid-column:1/-1;color:#777;font-size:12px;padding:22px 0">このLABELにはまだ動画がありません。</div>';
    const feed = document.querySelector('#mfeed');
    if (feed) feed.innerHTML = '<div style="height:100dvh;display:grid;place-items:center;color:#777;padding:30px;text-align:center">このLABELにはまだ動画がありません。</div>';
    const title = document.querySelector('#title'); if (title) title.textContent = activeLabel || 'LABEL';
    const count = document.querySelector('#count'); if (count) count.textContent = '00 / 00';
  }

  function updateUrlForLabel(name) {
    const url = new URL(location.href);
    if (name) {
      url.searchParams.set('label', name);
      url.searchParams.delete('view');
    } else {
      url.searchParams.delete('label');
    }
    history.replaceState(null, '', url);
  }

  function setLabel(name) {
    const next = String(name || '').trim();
    if (!next) return;
    activeLabel = next;
    activeTag = '';
    filtered = typeItems();
    selected = 0;
    shelfPage = 0;
    clearWarmers();
    updateUrlForLabel(activeLabel);
    renderShelfContext();
    updateShelfPager();
    resetShelfRender();
    if (!filtered.length) { showEmptyLabel(); syncLabelUI(); return; }
    if (innerWidth >= 900) { select(0, true); startShelfAfterMain(); }
    else mobile(true);
    document.querySelector('.shelf-wrap')?.scrollTo({ top: 0, behavior: 'smooth' });
    syncLabelUI();
  }

  function clearLabelForTypeNavigation() {
    if (!activeLabel) return;
    activeLabel = '';
    activeTag = '';
    updateUrlForLabel('');
    setMenu(false);
  }

  document.addEventListener('click', (e) => {
    const typeButton = e.target.closest?.('[data-ways-type]');
    if (typeButton) clearLabelForTypeNavigation();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });

  async function loadCatalog() {
    try {
      const response = await fetch(LABEL_API, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      catalog = Array.isArray(data.labels) ? data.labels
        .map(x => ({ name: String(x?.name || '').trim(), count: Number(x?.count || 0) }))
        .filter(x => x.name) : [];
      assignments = data.assignments && typeof data.assignments === 'object' ? data.assignments : {};
      return true;
    } catch (error) {
      console.warn('[WAYS LABELS] catalog unavailable', error);
      catalog = [];
      assignments = {};
      return false;
    }
  }

  function hydrateItems() {
    if (typeof items === 'undefined' || !Array.isArray(items) || !items.length) return false;
    for (const item of items) item.labels = Array.isArray(assignments[String(item.id)]) ? assignments[String(item.id)].slice() : [];
    return true;
  }

  async function bootLabels() {
    await loadCatalog();
    let tries = 0;
    const wait = () => {
      if (hydrateItems()) {
        renderShelfContext();
        renderMenu();
        if (initialLabel && catalog.some(x => x.name === initialLabel)) setLabel(initialLabel);
        else syncLabelUI();
        return;
      }
      tries += 1;
      if (tries < 80) setTimeout(wait, 100);
      else { syncLabelUI(); renderMenu(); }
    };
    wait();
  }

  const style = document.createElement('style');
  style.id = 'ways-labels-style';
  style.textContent = `
    .ways-labels-pill.open{border-color:var(--accent);color:var(--accent)}
    .ways-label-menu{position:fixed;z-index:80;right:32px;top:108px;width:min(430px,calc(100vw - 40px));max-height:min(62vh,560px);overflow:auto;border:1px solid #363940;background:#0b0c0ef5;box-shadow:0 24px 70px #000c;padding:14px;display:none;backdrop-filter:blur(14px)}
    .ways-label-menu.open{display:block}.ways-label-menu-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:2px 2px 12px;border-bottom:1px solid #292c31}.ways-label-menu-head b{display:block;color:var(--accent);font-size:11px;letter-spacing:.12em}.ways-label-menu-head span{display:block;color:#8f939b;font-size:10px;margin-top:5px}.ways-label-menu-head button{border:1px solid #3b3e45;background:#111214;color:#ddd;width:30px;height:30px;cursor:pointer}.ways-label-menu-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:12px}.ways-label-choice{border:1px solid #33363c;background:#111214;color:#e8e8e3;text-align:left;padding:12px;cursor:pointer;min-width:0}.ways-label-choice:hover{border-color:var(--accent)}.ways-label-choice.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:#171a0e}.ways-label-choice span{display:block;font-size:11px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ways-label-choice small{display:block;color:#767b83;font:8px ui-monospace,monospace;margin-top:7px}.ways-label-choice.on small{color:#b8c47f}.ways-label-menu-empty{grid-column:1/-1;color:#747981;font-size:10px;line-height:1.7;padding:14px 4px}
    @media(max-width:899px){.ways-label-menu{left:12px;right:12px;top:94px;width:auto;max-height:55vh}.ways-label-menu-list{grid-template-columns:1fr}.ways-mobile-type [data-ways-labels-open].active{border-color:var(--accent);background:var(--accent);color:#111}}
  `;
  document.head.appendChild(style);
  ensureMenu();
  bootLabels();
})();
