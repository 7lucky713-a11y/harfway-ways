(() => {
  const API = '/api/game-notes-glossary';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const baseFetch = window.fetch.bind(window);
  const state = {
    games: [],
    entries: [],
    ways: [],
    articles: [],
    waysCatalogAvailable: true,
    selectedWaysIds: [],
    selectedArticleIds: [],
    ready: false,
    editorHydrated: false
  };

  const key = () => sessionStorage.getItem('harfway_game_notes_key') || '';
  const authHeaders = () => key() ? { 'x-admin-key': key() } : {};
  const entryById = (id) => state.entries.find(item => item.id === id) || null;
  const waysById = (id) => state.ways.find(item => item.id === id) || null;
  const articleById = (id) => state.articles.find(item => item.id === id) || null;
  const norm = (value) => String(value || '').toLocaleLowerCase('ja').replace(/[\s・:：\/\\()（）\[\]【】「」『』―—_-]+/g, '');
  const currentGameName = () => {
    const id = $('#game')?.value || '';
    return id ? (state.games.find(game => game.id === id)?.name || '') : '';
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

  function injectStyles() {
    if ($('#glossary-content-link-styles')) return;
    const style = document.createElement('style');
    style.id = 'glossary-content-link-styles';
    style.textContent = `
      .content-link-editor{display:grid;gap:14px;padding:16px;border:1px solid rgba(223,242,56,.18);border-radius:13px;background:rgba(223,242,56,.025)}
      .content-link-editor>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.content-link-editor>header b{font-size:13px;letter-spacing:.06em}.content-link-editor>header small{max-width:390px;text-align:right;color:var(--muted);font-size:11px;line-height:1.55}
      .content-resource{display:grid;gap:8px}.content-resource-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.content-resource-head b{font:850 10px ui-monospace,monospace;letter-spacing:.1em;color:#9eaa9f}.content-resource-head span{font-size:10px;color:#69756c}
      .content-resource input,.content-resource select{width:100%;background:#0b0f0c;border:1px solid var(--line);border-radius:9px;color:var(--text);padding:10px 11px;font-size:14px}
      .content-resource-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.content-resource-row button{padding:9px 13px}
      .content-resource-chips{display:flex;gap:7px;flex-wrap:wrap}.content-resource-chips button{border:1px solid #38423a;background:#171d18;color:#d7ded8;border-radius:999px;padding:6px 9px;font-size:11px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .related-content-output{display:grid;gap:12px;margin-top:2px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
      .related-content-group{display:grid;gap:7px}.related-content-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.related-content-head b{font:850 10px ui-monospace,monospace;letter-spacing:.08em;color:#8f9d92}.related-content-head span{font-size:10px;color:#6f7a71}
      .ways-output{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#111512;text-decoration:none;color:inherit}.ways-output:hover,.article-output:hover{border-color:rgba(223,242,56,.4);background:#151b17}.ways-output img{width:76px;height:43px;object-fit:cover;border-radius:6px;background:#080a08}.ways-output div{min-width:0;display:grid;gap:3px}.ways-output strong,.article-output strong{font-size:12px;line-height:1.45}.ways-output small{font-size:9px;color:#77827a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ways-output em,.article-output em{font-style:normal;color:#dff238;font-size:12px}
      .article-output{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#111512;text-decoration:none;color:inherit}.article-output strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .resource-more{font-size:10px;color:#77827a}
      @media(max-width:650px){.content-link-editor>header{display:grid}.content-link-editor>header small{text-align:left}.content-resource-row{grid-template-columns:1fr}.ways-output{grid-template-columns:64px minmax(0,1fr) auto}.ways-output img{width:64px;height:36px}.article-output strong{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function installEditor() {
    if ($('#glossary-content-editor')) return;
    const foot = $('#entry-form .dialog-foot');
    if (!foot) return;
    const block = document.createElement('section');
    block.id = 'glossary-content-editor';
    block.className = 'content-link-editor';
    block.innerHTML = `
      <header><b>RELATED CONTENT</b><small>Glossaryから既存のWAYS動画・HARF-WAY記事へ参照を付けます。ここで紐づけても公開状態は変わりません。</small></header>
      <div class="content-resource">
        <div class="content-resource-head"><b>WAYS VIDEO</b><span id="ways-link-count">0件</span></div>
        <input id="ways-link-search" type="search" placeholder="WAYSをタイトルから検索" autocomplete="off">
        <div class="content-resource-row"><select id="ways-link-picker"><option value="">WAYSから選択</option></select><button class="ghost" id="ways-link-add" type="button">追加</button></div>
        <div class="content-resource-chips" id="ways-link-chips"></div>
      </div>
      <div class="content-resource">
        <div class="content-resource-head"><b>HARF-WAY ARTICLE</b><span id="article-link-count">0件</span></div>
        <input id="article-link-search" type="search" placeholder="記事タイトル・ゲーム名から検索" autocomplete="off">
        <div class="content-resource-row"><select id="article-link-picker"><option value="">記事から選択</option></select><button class="ghost" id="article-link-add" type="button">追加</button></div>
        <div class="content-resource-chips" id="article-link-chips"></div>
      </div>`;
    foot.before(block);

    $('#ways-link-search').addEventListener('input', () => renderPicker('ways'));
    $('#article-link-search').addEventListener('input', () => renderPicker('articles'));
    $('#ways-link-add').addEventListener('click', () => addSelected('ways'));
    $('#article-link-add').addEventListener('click', () => addSelected('articles'));
    $('#ways-link-chips').addEventListener('click', event => removeSelected(event, 'ways'));
    $('#article-link-chips').addEventListener('click', event => removeSelected(event, 'articles'));
    $('#game')?.addEventListener('change', renderPickers);
  }

  function resourceText(item, kind) {
    if (kind === 'ways') return [item?.title, item?.category].filter(Boolean).join(' ');
    return [item?.title, ...(item?.gameHints || [])].filter(Boolean).join(' ');
  }

  function relevance(item, kind) {
    const game = norm(currentGameName());
    if (!game) return 2;
    const values = kind === 'ways' ? [item?.title] : [item?.title, ...(item?.gameHints || [])];
    const normalized = values.map(norm).filter(Boolean);
    if (normalized.some(value => value === game)) return 0;
    if (normalized.some(value => value.includes(game) || game.includes(value))) return 1;
    return 2;
  }

  function candidates(kind) {
    const source = kind === 'ways' ? state.ways : state.articles;
    const selected = new Set(kind === 'ways' ? state.selectedWaysIds : state.selectedArticleIds);
    const query = norm(kind === 'ways' ? $('#ways-link-search')?.value : $('#article-link-search')?.value);
    return source
      .filter(item => !selected.has(item.id) && (!query || norm(resourceText(item, kind)).includes(query)))
      .sort((a, b) => relevance(a, kind) - relevance(b, kind) || String(a.title || '').localeCompare(String(b.title || ''), 'ja'))
      .slice(0, 80);
  }

  function renderPicker(kind) {
    const isWays = kind === 'ways';
    const picker = $(isWays ? '#ways-link-picker' : '#article-link-picker');
    const add = $(isWays ? '#ways-link-add' : '#article-link-add');
    if (!picker || !add) return;
    if (isWays && !state.waysCatalogAvailable) {
      picker.innerHTML = '<option value="">WAYS一覧を取得できません</option>';
      add.disabled = true;
      return;
    }
    const list = candidates(kind);
    const label = isWays ? 'WAYSから選択' : '記事から選択';
    picker.innerHTML = `<option value="">${label}</option>` + list.map(item => `<option value="${esc(item.id)}">${esc(item.title || item.id)}</option>`).join('');
    add.disabled = !list.length;
  }

  function renderChips() {
    const waysRoot = $('#ways-link-chips');
    const articleRoot = $('#article-link-chips');
    if (!waysRoot || !articleRoot) return;
    waysRoot.innerHTML = state.selectedWaysIds.map(id => {
      const item = waysById(id);
      return `<button type="button" data-content-remove="${esc(id)}">${esc(item?.title || `未解決 WAYS: ${id}`)} ×</button>`;
    }).join('');
    articleRoot.innerHTML = state.selectedArticleIds.map(id => {
      const item = articleById(id);
      return `<button type="button" data-content-remove="${esc(id)}">${esc(item?.title || `未解決 ARTICLE: ${id}`)} ×</button>`;
    }).join('');
    $('#ways-link-count').textContent = `${state.selectedWaysIds.length}件`;
    $('#article-link-count').textContent = `${state.selectedArticleIds.length}件`;
  }

  function renderPickers() {
    renderChips();
    renderPicker('ways');
    renderPicker('articles');
  }

  function addSelected(kind) {
    const isWays = kind === 'ways';
    const picker = $(isWays ? '#ways-link-picker' : '#article-link-picker');
    const id = picker?.value || '';
    if (!id) return;
    const list = isWays ? state.selectedWaysIds : state.selectedArticleIds;
    if (!list.includes(id)) list.push(id);
    if (picker) picker.value = '';
    renderPickers();
  }

  function removeSelected(event, kind) {
    const button = event.target.closest('[data-content-remove]');
    if (!button) return;
    const id = button.dataset.contentRemove;
    if (kind === 'ways') state.selectedWaysIds = state.selectedWaysIds.filter(value => value !== id);
    else state.selectedArticleIds = state.selectedArticleIds.filter(value => value !== id);
    renderPickers();
  }

  function syncEditor(force = false) {
    const overlay = $('#entry-overlay');
    if (!overlay?.classList.contains('on')) {
      state.editorHydrated = false;
      return;
    }
    if (!state.ready) return;
    const id = $('#entry-id')?.value || '';
    const signature = `${id}|${state.entries.length}`;
    if (!force && overlay.dataset.contentSignature === signature) return;
    overlay.dataset.contentSignature = signature;
    const entry = id ? entryById(id) : null;
    state.selectedWaysIds = [...(entry?.relatedWaysIds || [])];
    state.selectedArticleIds = [...(entry?.relatedArticleIds || [])];
    if ($('#ways-link-search')) $('#ways-link-search').value = '';
    if ($('#article-link-search')) $('#article-link-search').value = '';
    state.editorHydrated = true;
    renderPickers();
  }

  function waysMarkup(entry) {
    const items = (entry.relatedWaysIds || []).map(waysById).filter(Boolean);
    if (!items.length) return '';
    const visible = items.slice(0, 4);
    return `<div class="related-content-group"><div class="related-content-head"><b>RELATED WAYS</b><span>${items.length}件</span></div>${visible.map(item => `<a class="ways-output" href="${esc(item.url || `/?game=${encodeURIComponent(item.id)}`)}" target="_blank" rel="noopener"><img src="${esc(item.thumbnailUrl || '')}" alt="" loading="lazy"><div><strong>${esc(item.title || item.id)}</strong><small>${esc(item.category || 'WAYS VIDEO')}</small></div><em>↗</em></a>`).join('')}${items.length > visible.length ? `<div class="resource-more">ほか ${items.length - visible.length}件</div>` : ''}</div>`;
  }

  function articleMarkup(entry) {
    const items = (entry.relatedArticleIds || []).map(articleById).filter(Boolean);
    if (!items.length) return '';
    const visible = items.slice(0, 5);
    return `<div class="related-content-group"><div class="related-content-head"><b>RELATED ARTICLES</b><span>${items.length}件</span></div>${visible.map(item => `<a class="article-output" href="${esc(item.url)}" target="_blank" rel="noopener"><strong>${esc(item.title || item.id)}</strong><em>↗</em></a>`).join('')}${items.length > visible.length ? `<div class="resource-more">ほか ${items.length - visible.length}件</div>` : ''}</div>`;
  }

  function renderCards() {
    if (!state.ready) return;
    document.querySelectorAll('#entry-grid .card[data-entry]').forEach(card => {
      const id = card.dataset.entry || '';
      const entry = entryById(id);
      const old = $('.related-content-output', card);
      if (!entry) {
        old?.remove();
        return;
      }
      const ways = waysMarkup(entry);
      const articles = articleMarkup(entry);
      const signature = `${(entry.relatedWaysIds || []).join(',')}|${(entry.relatedArticleIds || []).join(',')}`;
      if (!ways && !articles) {
        old?.remove();
        return;
      }
      if (old?.dataset.signature === signature) return;
      const root = old || document.createElement('div');
      root.className = 'related-content-output';
      root.dataset.signature = signature;
      root.innerHTML = ways + articles;
      if (!old) card.appendChild(root);
    });
  }

  function consume(data) {
    if (!data || !Array.isArray(data.entries)) return;
    state.games = Array.isArray(data.games) ? data.games : [];
    state.entries = data.entries;
    state.ways = Array.isArray(data.ways) ? data.ways : [];
    state.articles = Array.isArray(data.articles) ? data.articles : [];
    state.waysCatalogAvailable = data.waysCatalogAvailable !== false;
    state.ready = true;
    renderCards();
    syncEditor(true);
  }

  async function refreshData() {
    try {
      const response = await baseFetch(API, { headers: authHeaders(), cache: 'no-store' });
      if (!response.ok) return;
      consume(await response.json());
    } catch {}
  }

  window.fetch = async (input, init = {}) => {
    if (pathOf(input) !== API) return baseFetch(input, init);
    const method = methodOf(input, init);
    let nextInit = init;
    if ((method === 'POST' || method === 'PATCH') && state.editorHydrated && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        payload.relatedWaysIds = [...state.selectedWaysIds];
        payload.relatedArticleIds = [...state.selectedArticleIds];
        nextInit = { ...init, body: JSON.stringify(payload) };
      } catch {}
    }
    const response = await baseFetch(input, nextInit);
    if (method === 'GET' && response.ok) response.clone().json().then(consume).catch(() => {});
    if (['POST', 'PATCH', 'DELETE'].includes(method) && response.ok) setTimeout(refreshData, 80);
    return response;
  };

  injectStyles();
  installEditor();

  const overlay = $('#entry-overlay');
  if (overlay) new MutationObserver(() => syncEditor()).observe(overlay, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  const grid = $('#entry-grid');
  if (grid) new MutationObserver(() => requestAnimationFrame(renderCards)).observe(grid, { childList: true });

  refreshData();
})();
