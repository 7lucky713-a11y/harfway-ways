(() => {
  'use strict';

  const ROOT_ID = 'hwads-media-preview';
  const STYLE_ID = 'hwads-media-preview-style';
  const PLACEMENTS = [
    { id: 'playback', label: 'WAYS', short: '縦動画フィード' },
    { id: 'playlist', label: 'PLAYLIST', short: '編集された棚' },
    { id: 'scraps', label: '切れ端', short: '記録カード' },
    { id: 'sale', label: 'SALE WATCH', short: 'セール一覧' },
  ];
  const placementMatchers = {
    playback: /\bWAYS\b|playback/i,
    playlist: /PLAYLIST|プレイリスト/i,
    scraps: /SCRAPBOOK|SCRAPS?|切れ端/i,
    sale: /SALE\s*WATCH|\bSALE\b|セール/i,
  };

  const state = {
    activePlacement: 'playback',
    device: 'mobile',
    mediaUrl: '',
    mediaMime: '',
    mediaName: '',
    sourceFileInput: null,
    mountedHost: null,
  };

  let renderQueued = false;
  let mountTimer = 0;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const normalize = (value) => String(value ?? '')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();

  function getLabelText(input) {
    if (!input) return '';
    const bits = [];
    if (input.labels?.length) {
      for (const label of input.labels) bits.push(label.textContent || '');
    }
    const parentLabel = input.closest('label');
    if (parentLabel) bits.push(parentLabel.textContent || '');
    const wrapper = input.parentElement;
    if (wrapper) {
      bits.push(wrapper.textContent || '');
      const previous = wrapper.previousElementSibling;
      if (previous) bits.push(previous.textContent || '');
    }
    if (input.previousElementSibling) bits.push(input.previousElementSibling.textContent || '');
    bits.push(input.getAttribute('placeholder') || '');
    bits.push(input.getAttribute('aria-label') || '');
    bits.push(input.getAttribute('name') || '');
    bits.push(input.getAttribute('id') || '');
    return normalize(bits.join(' '));
  }

  function formScope() {
    const file = document.querySelector('input[type="file"]');
    if (!file) return null;
    return file.closest('form') || file.closest('main') || file.closest('[role="main"]') || file.parentElement?.parentElement || document.body;
  }

  function allTextFields(scope) {
    return [...scope.querySelectorAll('input:not([type]), input[type="text"], input[type="url"], input[type="search"], textarea')]
      .filter((input) => !input.closest(`#${ROOT_ID}`));
  }

  function findField(scope, patterns, options = {}) {
    const fields = allTextFields(scope);
    const scored = [];
    for (const field of fields) {
      const label = getLabelText(field);
      let score = 0;
      patterns.forEach((pattern, index) => {
        if (pattern.test(label)) score = Math.max(score, 100 - index * 8);
      });
      if (options.multiline && field.tagName === 'TEXTAREA') score += 10;
      if (options.url && (field.type === 'url' || /https?:|url|リンク|ストア/i.test(label))) score += 14;
      if (score > 0) scored.push({ field, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.field || null;
  }

  function readSelectedPlacements(scope) {
    const controls = [...scope.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
      .filter((input) => !input.closest(`#${ROOT_ID}`));
    const recognized = [];
    const selected = [];

    for (const input of controls) {
      const text = getLabelText(input);
      for (const placement of PLACEMENTS) {
        if (placementMatchers[placement.id].test(text)) {
          recognized.push(placement.id);
          if (input.checked) selected.push(placement.id);
          break;
        }
      }
    }

    const uniqueRecognized = [...new Set(recognized)];
    const uniqueSelected = [...new Set(selected)];
    if (uniqueRecognized.length) return { recognized: uniqueRecognized, selected: uniqueSelected };

    // Some compiled UIs render custom buttons instead of native checkboxes.
    const clickable = [...scope.querySelectorAll('button, [role="checkbox"], [role="switch"]')]
      .filter((el) => !el.closest(`#${ROOT_ID}`));
    for (const el of clickable) {
      const text = normalize(el.textContent || el.getAttribute('aria-label') || '');
      for (const placement of PLACEMENTS) {
        if (!placementMatchers[placement.id].test(text)) continue;
        recognized.push(placement.id);
        const pressed = el.getAttribute('aria-checked') === 'true'
          || el.getAttribute('aria-pressed') === 'true'
          || /selected|active|checked/i.test(el.className || '');
        if (pressed) selected.push(placement.id);
        break;
      }
    }

    if (recognized.length) return { recognized: [...new Set(recognized)], selected: [...new Set(selected)] };
    return { recognized: [], selected: PLACEMENTS.map((x) => x.id) };
  }

  function readTags(scope) {
    const tagsField = findField(scope, [/タグ/i, /tags?/i]);
    if (!tagsField?.value) return [];
    return String(tagsField.value)
      .split(/[,、\n]/)
      .map((x) => normalize(x).replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 4);
  }

  function readExistingMedia(scope) {
    if (state.mediaUrl) return { url: state.mediaUrl, mime: state.mediaMime, name: state.mediaName };
    const media = [...scope.querySelectorAll('video[src], img[src]')]
      .filter((el) => !el.closest(`#${ROOT_ID}`))
      .find((el) => {
        const src = el.currentSrc || el.src || '';
        if (!src) return false;
        if (/logo|favicon|avatar|icon/i.test(src)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width >= 120 || rect.height >= 90 || /^data:|^blob:|r2\.dev|media/i.test(src);
      });
    if (!media) return { url: '', mime: '', name: '' };
    return {
      url: media.currentSrc || media.src || '',
      mime: media.tagName === 'VIDEO' ? 'video/mp4' : 'image/unknown',
      name: '',
    };
  }

  function readDraft() {
    const scope = formScope();
    if (!scope) return null;

    const title = findField(scope, [/作品名/i, /ゲーム名/i, /タイトル/i, /広告名/i, /title/i]);
    const catchField = findField(scope, [/キャッチコピー/i, /キャッチ/i, /ひとこと/i, /短い紹介/i, /catch/i]);
    const description = findField(scope, [/紹介文/i, /説明文/i, /説明/i, /本文/i, /description/i], { multiline: true });
    const storeUrl = findField(scope, [/ストアURL/i, /作品URL/i, /リンク先/i, /store.*url/i, /url/i], { url: true });
    const placements = readSelectedPlacements(scope);
    const media = readExistingMedia(scope);

    return {
      title: normalize(title?.value) || 'GAME TITLE',
      catchText: normalize(catchField?.value) || 'ゲームの魅力を、ひと目で。',
      description: normalize(description?.value) || '入力した紹介文が、各媒体の表示に合わせてここへ反映されます。',
      storeUrl: normalize(storeUrl?.value),
      tags: readTags(scope),
      placements,
      media,
    };
  }

  function mediaMarkup(draft, className = '') {
    if (!draft.media.url) {
      return `<div class="hwads-preview-media-fallback ${className}"><span>MEDIA PREVIEW</span><small>IMAGE / VIDEO</small></div>`;
    }
    if ((draft.media.mime || '').startsWith('video/')) {
      return `<video class="${className}" src="${esc(draft.media.url)}" muted autoplay loop playsinline preload="metadata"></video>`;
    }
    return `<img class="${className}" src="${esc(draft.media.url)}" alt="" />`;
  }

  function tagsMarkup(draft) {
    const tags = draft.tags.length ? draft.tags : ['INDIE GAME', 'PROMOTED'];
    return `<div class="hwads-demo-tags">${tags.slice(0, 3).map((tag) => `<span># ${esc(tag)}</span>`).join('')}</div>`;
  }

  function ctaMarkup() {
    return '<button type="button" class="hwads-demo-cta" tabindex="-1">ストアで見る ↗</button>';
  }

  function waysPreview(draft) {
    if (state.device === 'mobile') {
      return `<div class="hwads-demo-stage ways mobile">
        <div class="ways-phone">
          <div class="ways-status"><span>WAYS</span><span>FOR YOU</span></div>
          <div class="ways-media">${mediaMarkup(draft, 'ways-media-el')}<span class="hwads-pr-badge">PR / SPONSORED</span></div>
          <div class="ways-copy">
            <div class="ways-kicker">PROMOTED ON WAYS</div>
            <h3>${esc(draft.title)}</h3>
            <p>${esc(draft.catchText)}</p>
            ${tagsMarkup(draft)}
            ${ctaMarkup()}
          </div>
          <div class="ways-rail"><span>♡</span><span>▢</span><span>↗</span></div>
        </div>
      </div>`;
    }
    return `<div class="hwads-demo-stage ways desktop">
      <div class="ways-desktop-head"><b>WAYS</b><span>DISCOVER / RANDOM FEED</span></div>
      <div class="ways-row">
        <div class="ways-organic"><div></div><small>NEXT GAME</small></div>
        <article class="ways-feature">
          <div class="ways-media">${mediaMarkup(draft, 'ways-media-el')}<span class="hwads-pr-badge">PR / SPONSORED</span></div>
          <div class="ways-feature-copy"><small>PROMOTED</small><h3>${esc(draft.title)}</h3><p>${esc(draft.catchText)}</p>${ctaMarkup()}</div>
        </article>
        <div class="ways-organic second"><div></div><small>DISCOVER</small></div>
      </div>
    </div>`;
  }

  function playlistPreview(draft) {
    const mobile = state.device === 'mobile';
    return `<div class="hwads-demo-stage playlist ${mobile ? 'mobile' : 'desktop'}">
      <div class="playlist-head"><div><b>HARF-WAY PLAYLIST</b><span>CURATED SELECTION</span></div><span class="playlist-now">NOW SELECTING</span></div>
      <div class="playlist-shelf">
        <div class="playlist-record dummy"><div class="record-disc"></div><small>TRACK 01</small></div>
        <article class="playlist-record promoted">
          <div class="record-cover">${mediaMarkup(draft, 'record-cover-media')}<span class="hwads-pr-badge">PR</span><div class="record-hole"></div></div>
          <div class="record-meta"><small>PROMOTED TRACK</small><h3>${esc(draft.title)}</h3><p>${esc(draft.catchText)}</p>${ctaMarkup()}</div>
        </article>
        <div class="playlist-record dummy alt"><div class="record-disc"></div><small>TRACK 03</small></div>
      </div>
      <div class="playlist-turntable"><span>◀</span><div class="turntable-line"></div><span>▶</span></div>
    </div>`;
  }

  function scrapsPreview(draft) {
    const mobile = state.device === 'mobile';
    return `<div class="hwads-demo-stage scraps ${mobile ? 'mobile' : 'desktop'}">
      <div class="scraps-head"><b>GAME SCRAPBOOK</b><span>記録されたゲームの切れ端</span></div>
      <div class="scraps-grid">
        <article class="scrap-note dummy"><div></div><b>PLAY LOG</b><p>短い記録と映像の断片。</p></article>
        <article class="scrap-note promoted">
          <div class="scrap-media">${mediaMarkup(draft, 'scrap-media-el')}<span class="hwads-pr-badge">SPONSORED</span></div>
          <div class="scrap-copy"><small>HARF-WAY / PR NOTE</small><h3>${esc(draft.title)}</h3><p>${esc(draft.description)}</p>${tagsMarkup(draft)}${ctaMarkup()}</div>
        </article>
        <article class="scrap-note dummy second"><div></div><b>MEMO</b><p>気になった一本をあとから読む。</p></article>
      </div>
    </div>`;
  }

  function salePreview(draft) {
    const mobile = state.device === 'mobile';
    const saleDummy = (off, name) => `<article class="sale-game"><div class="sale-thumb"></div><div><b>${name}</b><span>-${off}%</span><small>¥${off === 50 ? '740' : '980'}</small></div></article>`;
    return `<div class="hwads-demo-stage sale ${mobile ? 'mobile' : 'desktop'}">
      <div class="sale-head"><div><b>SALE WATCH</b><span>いま買えるゲームを眺める</span></div><span>LIVE SALE</span></div>
      <div class="sale-grid">
        ${saleDummy(35, 'ON SALE')}
        ${saleDummy(50, 'WEEKEND DEAL')}
        ${mobile ? '' : saleDummy(20, 'SPECIAL OFFER')}
        <article class="sale-promo">
          <div class="sale-promo-media">${mediaMarkup(draft, 'sale-media-el')}<span class="hwads-pr-badge">PR / SPONSORED</span></div>
          <div class="sale-promo-copy"><small>HARF-WAY / SALE WATCH PR</small><h3>${esc(draft.title)}</h3><p>${esc(draft.catchText)}</p>${tagsMarkup(draft)}${ctaMarkup()}</div>
        </article>
        ${saleDummy(40, 'DEAL')}
        ${mobile ? '' : saleDummy(25, 'PRICE DROP')}
      </div>
    </div>`;
  }

  function placementPreview(id, draft) {
    if (id === 'playlist') return playlistPreview(draft);
    if (id === 'scraps') return scrapsPreview(draft);
    if (id === 'sale') return salePreview(draft);
    return waysPreview(draft);
  }

  function selectedTabs(draft) {
    const selected = draft.placements.selected;
    if (draft.placements.recognized.length && !selected.length) return [];
    const allowed = selected.length ? selected : PLACEMENTS.map((x) => x.id);
    return PLACEMENTS.filter((placement) => allowed.includes(placement.id));
  }

  function ensureActivePlacement(tabs) {
    if (!tabs.length) return;
    if (!tabs.some((tab) => tab.id === state.activePlacement)) state.activePlacement = tabs[0].id;
  }

  function render() {
    renderQueued = false;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const draft = readDraft();
    if (!draft) return;

    const tabs = selectedTabs(draft);
    ensureActivePlacement(tabs);

    const tabHtml = tabs.map((tab) => `<button type="button" class="hwads-preview-tab ${tab.id === state.activePlacement ? 'active' : ''}" data-preview-placement="${tab.id}"><b>${tab.label}</b><span>${tab.short}</span></button>`).join('');
    const bodyHtml = tabs.length
      ? placementPreview(state.activePlacement, draft)
      : `<div class="hwads-preview-empty"><b>掲載先を選んでください</b><span>WAYS / PLAYLIST / 切れ端 / SALE WATCH を選ぶと、ここに実際の掲載イメージが表示されます。</span></div>`;

    root.innerHTML = `<section class="hwads-preview-shell">
      <header class="hwads-preview-header">
        <div><span class="hwads-preview-eyebrow">AD PLACEMENT PREVIEW</span><h2>表示デモ</h2><p>掲載先ごとの見え方を、入稿中の素材で確認できます。</p></div>
        <div class="hwads-device-switch" role="group" aria-label="プレビュー端末">
          <button type="button" data-preview-device="pc" class="${state.device === 'pc' ? 'active' : ''}">PC</button>
          <button type="button" data-preview-device="mobile" class="${state.device === 'mobile' ? 'active' : ''}">MOBILE</button>
        </div>
      </header>
      ${tabs.length ? `<nav class="hwads-preview-tabs" aria-label="掲載媒体">${tabHtml}</nav>` : ''}
      <div class="hwads-preview-canvas">${bodyHtml}</div>
      <footer class="hwads-preview-note"><span>PREVIEW ONLY</span> この表示では IMP / CLICK / STORE VISIT は計測されません。実際の表示順や周辺コンテンツは変動する場合があります。</footer>
    </section>`;
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  function chooseMountHost(scope) {
    const file = scope.querySelector('input[type="file"]');
    if (!file) return null;
    const form = file.closest('form');
    if (form) {
      const submit = [...form.querySelectorAll('button, input[type="submit"]')].find((el) => /保存|登録|申込|作成|更新|submit|save/i.test(normalize(el.textContent || el.value || '')));
      if (submit?.parentElement) return { host: submit.parentElement, before: submit };
      return { host: form, before: null };
    }
    const panel = file.closest('section, article, main, [role="main"]') || scope;
    return { host: panel, before: null };
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) {
      queueRender();
      return true;
    }
    const scope = formScope();
    if (!scope) return false;
    const target = chooseMountHost(scope);
    if (!target?.host) return false;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    if (target.before) target.host.insertBefore(root, target.before);
    else target.host.appendChild(root);
    state.mountedHost = target.host;
    queueRender();
    return true;
  }

  function handleFileInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const file = input.files?.[0];
    if (!file) return;
    if (state.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(state.mediaUrl);
    state.mediaUrl = URL.createObjectURL(file);
    state.mediaMime = file.type || '';
    state.mediaName = file.name || '';
    state.sourceFileInput = input;
  }

  document.addEventListener('click', (event) => {
    const placementButton = event.target.closest?.('[data-preview-placement]');
    if (placementButton) {
      event.preventDefault();
      state.activePlacement = placementButton.dataset.previewPlacement;
      queueRender();
      return;
    }
    const deviceButton = event.target.closest?.('[data-preview-device]');
    if (deviceButton) {
      event.preventDefault();
      state.device = deviceButton.dataset.previewDevice === 'pc' ? 'pc' : 'mobile';
      queueRender();
      return;
    }
    if (event.target.closest?.(`#${ROOT_ID} .hwads-demo-cta`)) event.preventDefault();
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target.closest?.(`#${ROOT_ID}`)) return;
    queueRender();
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target.closest?.(`#${ROOT_ID}`)) return;
    handleFileInput(event.target);
    queueRender();
  }, true);

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{width:100%;margin:28px 0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f7f2;grid-column:1/-1}
      #${ROOT_ID} *{box-sizing:border-box}
      .hwads-preview-shell{overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:#0b0c0e;box-shadow:0 22px 70px rgba(0,0,0,.28)}
      .hwads-preview-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:22px 22px 18px;background:linear-gradient(145deg,#171a1d,#0d0f11 70%);border-bottom:1px solid rgba(255,255,255,.1)}
      .hwads-preview-eyebrow{display:block;margin-bottom:7px;color:#d9ff45;font:900 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em}
      .hwads-preview-header h2{margin:0;color:#fff;font-size:25px;line-height:1;letter-spacing:-.04em}
      .hwads-preview-header p{margin:8px 0 0;color:#969b9f;font-size:11px;line-height:1.55}
      .hwads-device-switch{display:flex;padding:3px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:#090a0b}
      .hwads-device-switch button{appearance:none;border:0;border-radius:999px;padding:8px 13px;background:transparent;color:#777e83;font:900 9px/1 ui-monospace,monospace;letter-spacing:.08em;cursor:pointer}
      .hwads-device-switch button.active{background:#fff;color:#0a0b0c}
      .hwads-preview-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:rgba(255,255,255,.1);border-bottom:1px solid rgba(255,255,255,.1)}
      .hwads-preview-tab{appearance:none;border:0;padding:13px 14px;text-align:left;background:#101214;color:#8b9297;cursor:pointer;min-width:0}
      .hwads-preview-tab b{display:block;color:inherit;font-size:11px;line-height:1.2;letter-spacing:-.01em}
      .hwads-preview-tab span{display:block;margin-top:4px;color:#656b70;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .hwads-preview-tab.active{background:#191d15;color:#e8ff7a;box-shadow:inset 0 -2px #d9ff45}
      .hwads-preview-tab.active span{color:#9cab65}
      .hwads-preview-canvas{min-height:440px;padding:22px;background:radial-gradient(circle at 70% 10%,rgba(190,255,46,.05),transparent 33%),#08090a}
      .hwads-preview-note{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid rgba(255,255,255,.08);background:#0d0f10;color:#6f767b;font-size:9px;line-height:1.5}
      .hwads-preview-note span{flex:none;border:1px solid #4b532e;border-radius:999px;padding:4px 6px;color:#bdcf65;font:900 8px/1 ui-monospace,monospace;letter-spacing:.08em}
      .hwads-preview-empty{min-height:360px;display:grid;place-content:center;text-align:center;padding:40px;color:#7b8185}
      .hwads-preview-empty b{display:block;margin-bottom:8px;color:#ddd;font-size:16px}.hwads-preview-empty span{max-width:430px;font-size:11px;line-height:1.7}
      .hwads-demo-stage{max-width:900px;margin:0 auto;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#111315;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3)}
      .hwads-pr-badge{position:absolute;z-index:5;top:9px;left:9px;padding:6px 8px;border-radius:999px;background:#dfff49;color:#090a0b;font:950 8px/1 ui-monospace,monospace;letter-spacing:.07em;box-shadow:0 4px 14px rgba(0,0,0,.25)}
      .hwads-preview-media-fallback{width:100%;height:100%;min-height:130px;display:flex;flex-direction:column;justify-content:flex-end;padding:16px;background:radial-gradient(circle at 70% 22%,#4a5c1b,#191d13 38%,#0c0e0a 75%);color:#dfff49}
      .hwads-preview-media-fallback span{font:950 24px/.9 ui-sans-serif,system-ui;letter-spacing:-.06em}.hwads-preview-media-fallback small{margin-top:6px;color:#84964a;font:900 7px/1 ui-monospace,monospace;letter-spacing:.12em}
      .hwads-demo-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.hwads-demo-tags span{padding:4px 6px;border:1px solid rgba(220,255,73,.25);border-radius:999px;color:#aaba63;font:800 7px/1 ui-monospace,monospace}
      .hwads-demo-cta{appearance:none;border:0;border-radius:7px;padding:8px 10px;background:#dfff49;color:#0b0c0d;font:950 8px/1 ui-sans-serif,system-ui;pointer-events:none}
      .ways.mobile{width:min(100%,355px);background:#08090a}.ways-phone{position:relative;min-height:550px;background:#08090a;overflow:hidden}.ways-status{position:absolute;z-index:7;top:13px;left:14px;right:14px;display:flex;justify-content:space-between;color:#fff;font:900 8px/1 ui-monospace,monospace;letter-spacing:.1em}.ways-status span:last-child{color:#dfff49}.ways-media{position:relative;height:550px;background:#10120e}.ways-media-el{width:100%;height:100%;object-fit:cover;display:block}.ways-copy{position:absolute;z-index:6;left:0;right:0;bottom:0;padding:86px 52px 22px 18px;background:linear-gradient(transparent,rgba(3,4,4,.94))}.ways-kicker{margin-bottom:7px;color:#dfff49;font:900 7px/1 ui-monospace,monospace;letter-spacing:.12em}.ways-copy h3{margin:0;color:#fff;font-size:23px;line-height:1.05;letter-spacing:-.045em}.ways-copy p{margin:7px 0 0;color:#d3d6d7;font-size:10px;line-height:1.5}.ways-copy .hwads-demo-cta{margin-top:11px}.ways-rail{position:absolute;z-index:7;right:13px;bottom:76px;display:grid;gap:16px;color:#fff;font-size:18px;text-align:center}
      .ways.desktop{max-width:900px}.ways-desktop-head{display:flex;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.1);color:#fff;font:900 9px/1 ui-monospace,monospace;letter-spacing:.08em}.ways-desktop-head span{color:#656d70}.ways-row{display:grid;grid-template-columns:.7fr 1.7fr .7fr;gap:10px;padding:18px;background:#0b0c0d}.ways-organic{opacity:.52;overflow:hidden;border:1px solid #282b2d;border-radius:9px;background:#151719}.ways-organic div{height:190px;background:linear-gradient(145deg,#2b3033,#101214)}.ways-organic.second div{background:linear-gradient(145deg,#252b1d,#111411)}.ways-organic small{display:block;padding:10px;color:#6f777a;font:800 7px/1 ui-monospace,monospace}.ways-feature{overflow:hidden;border:1px solid #56652a;border-radius:10px;background:#11140e}.ways-feature .ways-media{height:255px}.ways-feature-copy{padding:12px 14px}.ways-feature-copy small{color:#dfff49;font:900 7px/1 ui-monospace,monospace}.ways-feature-copy h3{margin:5px 0 0;color:#fff;font-size:20px}.ways-feature-copy p{margin:5px 0 10px;color:#9da49d;font-size:9px}
      .playlist{background:#10100f}.playlist-head,.sale-head,.scraps-head{display:flex;justify-content:space-between;align-items:center;padding:13px 15px;border-bottom:1px solid rgba(255,255,255,.1)}.playlist-head>div,.sale-head>div{display:grid;gap:3px}.playlist-head b,.sale-head b,.scraps-head b{color:#fff;font-size:10px;letter-spacing:.02em}.playlist-head span,.sale-head span,.scraps-head span{color:#757a77;font:800 7px/1 ui-monospace,monospace;letter-spacing:.08em}.playlist-now{padding:5px 7px;border:1px solid #555b39;border-radius:99px;color:#c8d577!important}.playlist-shelf{display:grid;grid-template-columns:.8fr 1.35fr .8fr;gap:12px;align-items:center;padding:24px;background:linear-gradient(#191613,#0d0c0b)}.playlist-record{min-width:0}.playlist-record.dummy{opacity:.43}.record-disc{aspect-ratio:1;border-radius:50%;background:repeating-radial-gradient(circle,#202020 0 5px,#131313 6px 9px);box-shadow:0 10px 25px rgba(0,0,0,.45)}.playlist-record.dummy small{display:block;margin-top:6px;color:#756e67;text-align:center;font:800 7px/1 ui-monospace,monospace}.playlist-record.promoted{display:grid;grid-template-columns:1fr;gap:10px}.record-cover{position:relative;aspect-ratio:1;overflow:hidden;border:1px solid #697b31;border-radius:5px;background:#171a12;box-shadow:0 16px 30px rgba(0,0,0,.5)}.record-cover-media{width:100%;height:100%;object-fit:cover}.record-hole{position:absolute;left:50%;top:50%;width:32px;height:32px;transform:translate(-50%,-50%);border:9px solid rgba(0,0,0,.6);border-radius:50%;background:#dfff49;box-shadow:0 0 0 90px rgba(0,0,0,.18)}.record-meta small{color:#dfff49;font:900 7px/1 ui-monospace,monospace}.record-meta h3{margin:5px 0 0;color:#fff;font-size:18px}.record-meta p{margin:5px 0 9px;color:#9c9b94;font-size:9px}.playlist-turntable{display:flex;align-items:center;gap:11px;padding:11px 17px;border-top:1px solid rgba(255,255,255,.08);color:#9a9a91;font-size:11px}.turntable-line{height:2px;flex:1;background:linear-gradient(90deg,#dfff49 42%,#333 42%)}.playlist.mobile{width:min(100%,370px)}.playlist.mobile .playlist-shelf{grid-template-columns:.45fr 1.6fr .45fr;gap:7px;padding:18px 10px}.playlist.mobile .playlist-record.dummy{transform:scale(.82)}
      .scraps{background:#11100e}.scraps-head{background:#161411}.scraps-grid{display:grid;grid-template-columns:.72fr 1.55fr .72fr;gap:12px;padding:19px;background:#0d0c0b}.scrap-note{overflow:hidden;border:1px solid #2d2b27;border-radius:8px;background:#171512}.scrap-note.dummy{padding:9px;opacity:.47;transform:rotate(-1.1deg)}.scrap-note.dummy.second{transform:rotate(1.2deg)}.scrap-note.dummy>div{height:100px;border-radius:4px;background:linear-gradient(145deg,#39352f,#181715)}.scrap-note.dummy b{display:block;margin-top:8px;color:#d4d0c6;font-size:9px}.scrap-note.dummy p{margin:4px 0;color:#807b73;font-size:8px;line-height:1.5}.scrap-note.promoted{border-color:#59652f;background:#161911}.scrap-media{position:relative;aspect-ratio:16/10;overflow:hidden}.scrap-media-el{width:100%;height:100%;object-fit:cover}.scrap-copy{padding:13px}.scrap-copy small{color:#cfe365;font:900 7px/1 ui-monospace,monospace}.scrap-copy h3{margin:6px 0;color:#fff;font-size:19px}.scrap-copy p{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0;color:#aaa89e;font-size:9px;line-height:1.55}.scrap-copy .hwads-demo-cta{margin-top:10px}.scraps.mobile{width:min(100%,385px)}.scraps.mobile .scraps-grid{grid-template-columns:1fr;padding:13px}.scraps.mobile .scrap-note.dummy{display:none}
      .sale{background:#0c0e0d}.sale-head{background:#111411}.sale-head>span{padding:5px 7px;border-radius:99px;background:#273117;color:#dfff49!important}.sale-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:15px}.sale-game{overflow:hidden;border:1px solid #292d29;border-radius:7px;background:#141714}.sale-thumb{aspect-ratio:16/9;background:linear-gradient(145deg,#343b35,#141816)}.sale-game>div:last-child{display:grid;grid-template-columns:1fr auto;gap:4px;padding:8px}.sale-game b{grid-column:1/-1;color:#b3b8b3;font-size:8px}.sale-game span{color:#dfff49;font:950 9px/1 ui-monospace,monospace}.sale-game small{color:#7d837e;font-size:8px;text-align:right}.sale-promo{grid-column:span 1;overflow:hidden;border:1px solid #667832;border-radius:7px;background:#161a12;box-shadow:inset 0 0 0 1px rgba(218,255,70,.06)}.sale-promo-media{position:relative;aspect-ratio:16/9;overflow:hidden}.sale-media-el{width:100%;height:100%;object-fit:cover}.sale-promo-copy{padding:9px}.sale-promo-copy>small{color:#dfff49;font:900 6px/1 ui-monospace,monospace}.sale-promo-copy h3{margin:5px 0 3px;color:#fff;font-size:14px}.sale-promo-copy p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;color:#9ca39b;font-size:7px;line-height:1.45}.sale-promo-copy .hwads-demo-tags{margin-top:6px}.sale-promo-copy .hwads-demo-cta{margin-top:7px}.sale.mobile{width:min(100%,385px)}.sale.mobile .sale-grid{grid-template-columns:1fr 1fr;gap:7px;padding:10px}.sale.mobile .sale-promo{grid-column:1/-1}.sale.mobile .sale-promo-copy h3{font-size:17px}.sale.mobile .sale-promo-copy p{font-size:9px}
      @media(max-width:720px){#${ROOT_ID}{margin:20px 0}.hwads-preview-header{align-items:flex-start;flex-direction:column;padding:18px}.hwads-device-switch{align-self:stretch}.hwads-device-switch button{flex:1}.hwads-preview-tabs{grid-template-columns:repeat(2,1fr)}.hwads-preview-canvas{padding:13px;min-height:410px}.hwads-preview-note{align-items:flex-start;flex-direction:column}.ways.desktop .ways-row{grid-template-columns:1fr}.ways.desktop .ways-organic{display:none}.playlist.desktop .playlist-shelf,.scraps.desktop .scraps-grid{grid-template-columns:.4fr 1.4fr .4fr}.sale.desktop .sale-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  addStyles();
  mount();

  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => mutation.target.closest?.(`#${ROOT_ID}`))) return;
    clearTimeout(mountTimer);
    mountTimer = window.setTimeout(() => {
      const root = document.getElementById(ROOT_ID);
      if (!root || !root.isConnected) mount();
      else queueRender();
    }, 140);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('beforeunload', () => {
    if (state.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(state.mediaUrl);
  });
})();
