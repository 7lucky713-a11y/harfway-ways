(() => {
  'use strict';

  const UI_ID = 'hwads-inline-preview-controls';
  const DEVICE_KEY = 'hwads_inline_preview_device';
  const FRAME_ATTR = 'data-hwads-inline-preview-frame';
  const ACTIVE_FRAME_ATTR = 'data-hwads-inline-preview-active-frame';
  const SLOT_ATTR = 'data-hwads-preview-media-slot';
  const PLACEMENTS = [
    { id: 'playlist', label: 'プレイリスト', re: /PLAYLIST|プレイリスト/i },
    { id: 'scraps', label: '切れ端', re: /SCRAPBOOK|SCRAPS?|切れ端/i },
    { id: 'playback', label: 'WAYS', re: /\bWAYS\b|playback/i },
    { id: 'sale', label: 'SALE WATCH', re: /SALE\s*WATCH|\bSALE\b|セール/i },
  ];

  const frameCache = new Map();
  let device = 'mobile';
  let preferredPlacement = '';
  let mountTimer = 0;
  let syncTimer = 0;

  try {
    const saved = sessionStorage.getItem(DEVICE_KEY);
    if (saved === 'pc' || saved === 'mobile') device = saved;
  } catch {}

  const normalize = (value) => String(value || '').replace(/[\u3000\s]+/g, ' ').trim();

  function rgb(value) {
    const match = String(value || '').match(/rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function luminance(color) {
    return color ? color[0] * .299 + color[1] * .587 + color[2] * .114 : 255;
  }

  function selectedControl(el) {
    if (!el) return false;
    if ('checked' in el && el.checked) return true;
    if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true') return true;
    if (/selected|active|checked/i.test(String(el.className || ''))) return true;
    const style = getComputedStyle(el);
    return luminance(rgb(style.backgroundColor)) < 105 && luminance(rgb(style.color)) > 120;
  }

  function findHeading() {
    return [...document.querySelectorAll('h1,h2,h3,h4,div,p,span')]
      .find((el) => normalize(el.textContent) === '掲載されたときの見え方') || null;
  }

  function findPanel() {
    const heading = findHeading();
    if (!heading) return null;
    let node = heading.parentElement;
    let best = null;
    for (let i = 0; node && node !== document.body && i < 8; i += 1) {
      const text = normalize(node.textContent || '');
      const hasTabs = /プレイリスト/.test(text) && /切れ端/.test(text) && /WAYS/.test(text) && /SALE\s*WATCH/i.test(text);
      const hasForm = !!node.querySelector('input[type="file"], textarea');
      if (hasTabs && !hasForm) best = node;
      node = node.parentElement;
    }
    return best;
  }

  function originalTabs(panel) {
    const buttons = [...panel.querySelectorAll('button')]
      .filter((el) => !el.closest(`#${UI_ID}`) && !el.closest('#hwads-open-standalone-preview'));
    return PLACEMENTS.map((item) => ({
      ...item,
      source: buttons.find((button) => item.re.test(normalize(button.textContent || button.getAttribute('aria-label') || ''))) || null,
    })).filter((item) => item.source);
  }

  function commonAncestor(nodes) {
    const clean = nodes.filter(Boolean);
    if (!clean.length) return null;
    let current = clean[0];
    while (current && current !== document.body) {
      if (clean.every((node) => current === node || current.contains(node))) return current;
      current = current.parentElement;
    }
    return null;
  }

  function hideOriginalTabs(panel, heading, tabs) {
    const sources = tabs.map((item) => item.source).filter(Boolean);
    const host = commonAncestor(sources);
    if (host && host !== panel && !host.contains(heading)) {
      host.dataset.hwadsOriginalPreviewTabs = '1';
      return host;
    }
    sources.forEach((button) => { button.dataset.hwadsOriginalPreviewTab = '1'; });
    return host;
  }

  function currentPlacement(tabs) {
    if (preferredPlacement && tabs.some((item) => item.id === preferredPlacement)) return preferredPlacement;
    return tabs.find((item) => selectedControl(item.source))?.id || tabs[0]?.id || 'playlist';
  }

  function visibleRect(el, minWidth = 80, minHeight = 60) {
    if (!el?.isConnected) return null;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    return rect.width >= minWidth && rect.height >= minHeight ? rect : null;
  }

  function frameQuality(el) {
    const style = getComputedStyle(el);
    const radius = parseFloat(style.borderRadius) || 0;
    const border = Math.max(
      parseFloat(style.borderTopWidth) || 0,
      parseFloat(style.borderRightWidth) || 0,
      parseFloat(style.borderBottomWidth) || 0,
      parseFloat(style.borderLeftWidth) || 0,
    );
    const clipped = /hidden|clip/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
    return { radius, border, clipped };
  }

  function isChrome(el) {
    return !!el.closest?.(`#${UI_ID},#hwads-open-standalone-preview`) ||
      !!el.querySelector?.(`#${UI_ID},#hwads-open-standalone-preview`);
  }

  function findFrameByGeometry(panel) {
    const panelRect = panel.getBoundingClientRect();
    const desiredRatio = 9 / 16;
    const nodes = [...panel.querySelectorAll('div,section,article,figure')];
    const scored = [];

    for (const el of nodes) {
      if (el === panel || isChrome(el)) continue;
      const rect = visibleRect(el, 190, 270);
      if (!rect) continue;
      if (rect.width > Math.max(760, panelRect.width * .98)) continue;
      const ratio = rect.width / rect.height;
      if (ratio < .40 || ratio > .82) continue;
      const text = normalize(el.textContent || '');
      if (/掲載されたときの見え方/.test(text) && /プレイリスト/.test(text) && /SALE\s*WATCH/i.test(text)) continue;
      const { radius, border, clipped } = frameQuality(el);
      const ratioPenalty = Math.abs(ratio - desiredRatio) * 240;
      const widthTarget = Math.min(360, Math.max(280, panelRect.width * .58));
      const widthPenalty = Math.abs(rect.width - widthTarget) * .035;
      const qualityBonus = Math.min(radius, 28) * .20 + Math.min(border, 8) * 1.8 + (clipped ? 5 : 0);
      scored.push({ el, score: ratioPenalty + widthPenalty - qualityBonus, area: rect.width * rect.height });
    }

    scored.sort((a, b) => a.score - b.score || b.area - a.area);
    return scored[0]?.el || null;
  }

  function findSemanticAnchor(panel, placement) {
    const patterns = placement === 'playlist'
      ? [/PLAYLIST\s+SUPPORTER/i, /SUPPORTER\s*\/?\s*PR/i, /\bPR\b/i]
      : [/SPONSORED/i, /\bPR\b/i];
    const nodes = [...panel.querySelectorAll('small,span,p,b,strong,div')];
    const hits = [];
    for (const el of nodes) {
      if (isChrome(el)) continue;
      const rect = visibleRect(el, 20, 10);
      if (!rect) continue;
      const text = normalize(el.textContent || '');
      let score = 0;
      patterns.forEach((re, index) => { if (re.test(text)) score = Math.max(score, 100 - index * 18); });
      if (!score) continue;
      if (text.length > 180) score -= 30;
      hits.push({ el, score, area: rect.width * rect.height });
    }
    hits.sort((a, b) => b.score - a.score || a.area - b.area);
    return hits[0]?.el || null;
  }

  function framedAncestor(anchor, panel) {
    if (!anchor) return null;
    const candidates = [];
    let node = anchor;
    for (let depth = 0; node && node !== panel && depth < 8; depth += 1) {
      if (!isChrome(node)) {
        const rect = visibleRect(node, 110, 70);
        if (rect) {
          const quality = frameQuality(node);
          candidates.push({ el: node, depth, area: rect.width * rect.height, ...quality });
        }
      }
      node = node.parentElement;
    }
    const framed = candidates.filter((x) => x.radius >= 8 && (x.border >= 1 || x.clipped));
    framed.sort((a, b) => a.area - b.area || a.depth - b.depth);
    return framed[0]?.el || candidates.sort((a, b) => a.area - b.area)[0]?.el || null;
  }

  function fallbackFrame(panel, placement) {
    const semantic = framedAncestor(findSemanticAnchor(panel, placement), panel);
    if (semantic) {
      let node = semantic;
      let best = semantic;
      for (let i = 0; node?.parentElement && node.parentElement !== panel && i < 5; i += 1) {
        node = node.parentElement;
        if (isChrome(node)) break;
        const rect = visibleRect(node, 190, 260);
        if (!rect) continue;
        const ratio = rect.width / rect.height;
        if (ratio >= .40 && ratio <= .86) best = node;
      }
      return best;
    }
    return null;
  }

  function clearActiveFrames(panel) {
    panel.querySelectorAll(`[${ACTIVE_FRAME_ATTR}="1"]`).forEach((el) => el.removeAttribute(ACTIVE_FRAME_ATTR));
  }

  function resolveFrame(panel, placement) {
    const cached = frameCache.get(placement);
    if (cached?.isConnected && panel.contains(cached) && visibleRect(cached, 160, 220)) {
      clearActiveFrames(panel);
      cached.setAttribute(ACTIVE_FRAME_ATTR, '1');
      return cached;
    }

    const marked = [...panel.querySelectorAll(`[${FRAME_ATTR}="1"][data-hwads-inline-preview-frame-for="${placement}"]`)]
      .find((el) => visibleRect(el, 160, 220));
    const best = marked || findFrameByGeometry(panel) || fallbackFrame(panel, placement);
    if (!best) return null;

    best.setAttribute(FRAME_ATTR, '1');
    best.dataset.hwadsInlinePreviewFrameFor = placement;
    clearActiveFrames(panel);
    best.setAttribute(ACTIVE_FRAME_ATTR, '1');
    frameCache.set(placement, best);
    return best;
  }

  function clearMediaSlots(panel) {
    panel.querySelectorAll(`[${SLOT_ATTR}="1"]`).forEach((el) => {
      el.removeAttribute(SLOT_ATTR);
      delete el.dataset.hwadsPreviewMediaKind;
    });
  }

  function semanticAdScope(frame, placement) {
    const anchor = findSemanticAnchor(frame, placement);
    if (!anchor) return frame;
    const frameRect = visibleRect(frame, 120, 160);
    const candidates = [];
    let node = anchor;
    for (let depth = 0; node && node !== frame && depth < 7; depth += 1) {
      const rect = visibleRect(node, 100, 60);
      if (rect) {
        const q = frameQuality(node);
        const withinFrame = !frameRect || rect.width <= frameRect.width * .96;
        if (withinFrame) candidates.push({ el: node, area: rect.width * rect.height, ...q });
      }
      node = node.parentElement;
    }
    const framed = candidates.filter((x) => x.radius >= 6 && (x.border >= 1 || x.clipped));
    framed.sort((a, b) => a.area - b.area);
    return framed[0]?.el || candidates.sort((a, b) => a.area - b.area)[0]?.el || frame;
  }

  function mediaWithin(scope) {
    const candidates = [...scope.querySelectorAll('img,video')]
      .filter((el) => !el.closest(`#${UI_ID},#hwads-open-standalone-preview`))
      .map((el) => ({ el, rect: visibleRect(el, 70, 55) }))
      .filter((x) => x.rect)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    return candidates[0]?.el || null;
  }

  function backgroundWithin(scope) {
    const candidates = [...scope.querySelectorAll('div,figure,section')]
      .filter((el) => !el.closest(`#${UI_ID},#hwads-open-standalone-preview`))
      .map((el) => {
        const rect = visibleRect(el, 70, 55);
        const style = rect ? getComputedStyle(el) : null;
        return { el, rect, bg: style?.backgroundImage || 'none', color: rgb(style?.backgroundColor) };
      })
      .filter((x) => x.rect && (x.bg !== 'none' || (x.color && luminance(x.color) < 235)))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    return candidates[0]?.el || null;
  }

  function playlistCreative(scope) {
    const directMedia = mediaWithin(scope);
    if (directMedia) return directMedia;
    const scopeRect = visibleRect(scope, 100, 60);
    if (!scopeRect) return null;
    const candidates = [...scope.querySelectorAll('div,figure,section')]
      .map((el) => {
        const rect = visibleRect(el, 70, 55);
        if (!rect) return null;
        if (rect.width > scopeRect.width * .72 || rect.height > scopeRect.height * .96) return null;
        const style = getComputedStyle(el);
        const color = rgb(style.backgroundColor);
        const bg = style.backgroundImage;
        const radius = parseFloat(style.borderRadius) || 0;
        const leftBias = Math.abs(rect.left - scopeRect.left);
        const visual = (bg && bg !== 'none') || (color && luminance(color) < 235) || radius >= 6;
        if (!visual) return null;
        return { el, area: rect.width * rect.height, leftBias };
      })
      .filter(Boolean)
      .sort((a, b) => a.leftBias - b.leftBias || b.area - a.area);
    return candidates[0]?.el || backgroundWithin(scope);
  }

  function resolveMediaSlot(panel, frame, placement) {
    clearMediaSlots(panel);
    if (!frame) return null;
    const scope = semanticAdScope(frame, placement);
    let target = placement === 'playlist' ? playlistCreative(scope) : mediaWithin(scope);
    if (!target) target = backgroundWithin(scope);
    if (!target && scope !== frame) target = mediaWithin(frame) || backgroundWithin(frame);
    if (!target) target = scope || frame;
    if (!target) return null;

    target.setAttribute(SLOT_ATTR, '1');
    target.dataset.hwadsPreviewMediaKind = /^(IMG|VIDEO)$/.test(target.tagName) ? 'media' : 'background';
    return target;
  }

  function buildUi() {
    const wrap = document.createElement('div');
    wrap.id = UI_ID;
    wrap.innerHTML = `
      <div class="hwads-preview-control-grid">
        <div class="hwads-preview-control-group hwads-preview-placement-group">
          <span class="hwads-preview-control-label">掲載先</span>
          <div class="hwads-preview-placement-buttons">
            ${PLACEMENTS.map((item) => `<button type="button" data-hwads-placement="${item.id}">${item.label}</button>`).join('')}
          </div>
        </div>
        <div class="hwads-preview-control-group hwads-preview-device-group">
          <span class="hwads-preview-control-label">表示</span>
          <div class="hwads-preview-device-buttons" role="group" aria-label="プレビュー端末">
            <button type="button" data-hwads-device="pc">PC</button>
            <button type="button" data-hwads-device="mobile">スマホ</button>
          </div>
        </div>
      </div>
    `;
    return wrap;
  }

  function syncUi(panel) {
    const wrap = document.getElementById(UI_ID);
    if (!wrap) return;
    const tabs = originalTabs(panel);
    const active = currentPlacement(tabs);

    wrap.querySelectorAll('[data-hwads-placement]').forEach((button) => {
      const on = button.dataset.hwadsPlacement === active;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    wrap.querySelectorAll('[data-hwads-device]').forEach((button) => {
      const on = button.dataset.hwadsDevice === device;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    panel.dataset.hwadsPreviewDevice = device;
    panel.dataset.hwadsActivePlacement = active;
    const frame = resolveFrame(panel, active);
    resolveMediaSlot(panel, frame, active);
  }

  function mount() {
    const panel = findPanel();
    const heading = findHeading();
    if (!panel || !heading) return false;

    const tabs = originalTabs(panel);
    if (tabs.length < 2) return false;
    const tabHost = hideOriginalTabs(panel, heading, tabs);

    let wrap = document.getElementById(UI_ID);
    if (!wrap) wrap = buildUi();

    const headerHost = tabHost && tabHost !== panel ? commonAncestor([heading, tabHost]) : heading.parentElement;
    const anchor = headerHost && headerHost !== panel ? headerHost : heading.parentElement;
    if (!wrap.parentElement && anchor?.parentElement) anchor.insertAdjacentElement('afterend', wrap);

    panel.dataset.hwadsPreviewEnhanced = '1';
    syncUi(panel);
    return true;
  }

  function scheduleSync(delay = 90) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      const panel = findPanel();
      if (panel && document.getElementById(UI_ID)) syncUi(panel);
      else mount();
    }, delay);
  }

  document.addEventListener('click', (event) => {
    const placementButton = event.target.closest?.(`#${UI_ID} [data-hwads-placement]`);
    if (placementButton) {
      event.preventDefault();
      const panel = findPanel();
      if (!panel) return;
      preferredPlacement = placementButton.dataset.hwadsPlacement || '';
      const target = originalTabs(panel).find((item) => item.id === preferredPlacement)?.source;
      if (target) target.click();
      requestAnimationFrame(() => scheduleSync(0));
      scheduleSync(180);
      return;
    }

    const deviceButton = event.target.closest?.(`#${UI_ID} [data-hwads-device]`);
    if (deviceButton) {
      event.preventDefault();
      const panel = findPanel();
      if (!panel) return;
      device = deviceButton.dataset.hwadsDevice === 'pc' ? 'pc' : 'mobile';
      try { sessionStorage.setItem(DEVICE_KEY, device); } catch {}
      syncUi(panel);
      return;
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('input[type="file"]')) {
      scheduleSync(0);
      scheduleSync(120);
    }
  }, true);

  const style = document.createElement('style');
  style.id = 'hwads-inline-preview-layout-style-v4';
  style.textContent = `
    [data-hwads-original-preview-tabs="1"]{display:none!important}
    [data-hwads-original-preview-tab="1"]{display:none!important}
    [data-hwads-preview-enhanced="1"]{min-width:0}
    #${UI_ID}{width:100%;margin:15px 0 18px;padding-top:15px;border-top:1px solid #ded8cc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    #${UI_ID} .hwads-preview-control-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:18px}
    #${UI_ID} .hwads-preview-control-group{display:grid;gap:7px;min-width:0}
    #${UI_ID} .hwads-preview-control-label{color:#8a7b66;font:800 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.11em;text-transform:uppercase}
    #${UI_ID} .hwads-preview-placement-buttons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;min-width:0}
    #${UI_ID} button{appearance:none;min-height:42px;border:1px solid #d7cdbd;border-radius:10px;background:#fffdf8;color:#655946;padding:8px 10px;font:850 10px/1.25 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;cursor:pointer;transition:background .14s ease,color .14s ease,border-color .14s ease}
    #${UI_ID} button:hover{border-color:#857661}
    #${UI_ID} button.active{border-color:#171715;background:#171715;color:#fff}
    #${UI_ID} .hwads-preview-device-buttons{display:grid;grid-template-columns:repeat(2,64px);gap:6px;padding:3px;border:1px solid #d8cebf;border-radius:12px;background:#f0eadf}
    #${UI_ID} .hwads-preview-device-buttons button{min-height:36px;border:0;border-radius:8px;background:transparent;padding:7px 9px;color:#756a5c}
    #${UI_ID} .hwads-preview-device-buttons button.active{background:#171715;color:#fff;box-shadow:0 2px 7px rgba(0,0,0,.12)}

    [${ACTIVE_FRAME_ATTR}="1"]{
      margin-left:auto!important;
      margin-right:auto!important;
      overflow:hidden!important;
      transition:none!important;
      animation:none!important;
    }
    [data-hwads-preview-device="pc"] [${ACTIVE_FRAME_ATTR}="1"]{
      width:min(100%,620px)!important;
      max-width:620px!important;
      height:auto!important;
      min-height:0!important;
      aspect-ratio:16/9!important;
    }
    [data-hwads-preview-device="mobile"] [${ACTIVE_FRAME_ATTR}="1"]{
      width:min(100%,340px)!important;
      max-width:340px!important;
      height:auto!important;
      min-height:0!important;
      aspect-ratio:9/16!important;
    }
    [${SLOT_ATTR}="1"]>img,
    [${SLOT_ATTR}="1"]>video,
    [${SLOT_ATTR}="1"] img[data-hwads-sample-media="1"],
    [${SLOT_ATTR}="1"] video[data-hwads-sample-media="1"]{
      width:100%!important;
      height:100%!important;
      object-fit:cover!important;
    }
    [data-hwads-preview-device="pc"] .preview-zone{min-height:360px!important;align-items:center!important}
    [data-hwads-preview-device="mobile"] .preview-zone{min-height:520px!important}

    @media(max-width:1120px){#${UI_ID} .hwads-preview-control-grid{grid-template-columns:1fr}#${UI_ID} .hwads-preview-device-group{justify-items:start}}
    @media(max-width:700px){#${UI_ID} .hwads-preview-placement-buttons{grid-template-columns:1fr 1fr}#${UI_ID} .hwads-preview-device-buttons{grid-template-columns:repeat(2,minmax(70px,1fr));width:100%}[data-hwads-preview-device="pc"] [${ACTIVE_FRAME_ATTR}="1"],[data-hwads-preview-device="mobile"] [${ACTIVE_FRAME_ATTR}="1"]{width:100%!important;max-width:100%!important}}
  `;
  document.head.appendChild(style);

  const scheduleMount = () => {
    window.clearTimeout(mountTimer);
    mountTimer = window.setTimeout(() => {
      if (!document.getElementById(UI_ID)) mount();
      else scheduleSync(0);
    }, 90);
  };

  mount();
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) scheduleMount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => scheduleSync(0), { passive: true });
})();