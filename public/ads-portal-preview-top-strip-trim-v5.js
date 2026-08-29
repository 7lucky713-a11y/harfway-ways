(() => {
  'use strict';

  const ACTIVE_FRAME = '[data-hwads-inline-preview-active-frame="1"]';
  const MEDIA_SLOT = '[data-hwads-preview-media-slot="1"]';
  const TRIM_ATTR = 'data-hwads-preview-top-strip';
  const TARGET_PLACEMENTS = new Set(['playlist', 'scraps']);
  let timer = 0;

  const normalize = (value) => String(value || '').replace(/[\u3000\s]+/g, ' ').trim();

  function visibleRect(el) {
    if (!el?.isConnected) return null;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function activePanel() {
    return [...document.querySelectorAll('[data-hwads-active-placement]')]
      .find((el) => el.querySelector(ACTIVE_FRAME)) || null;
  }

  function clearTrimMarks() {
    document.querySelectorAll(`[${TRIM_ATTR}="1"]`).forEach((el) => el.removeAttribute(TRIM_ATTR));
  }

  function intersectsProtectedMedia(el, mediaSlot) {
    return !!mediaSlot && (el === mediaSlot || el.contains(mediaSlot) || mediaSlot.contains(el));
  }

  function looksLikeAdContent(el) {
    const text = normalize(el.textContent || '');
    return /\bPR\b|SPONSORED|SUPPORTER|作品タイトル|キャッチコピー/i.test(text);
  }

  function candidateScore(el, frameRect, mediaSlot) {
    const rect = visibleRect(el);
    if (!rect || el.matches(ACTIVE_FRAME)) return null;
    if (el.closest('#hwads-inline-preview-controls,#hwads-open-standalone-preview')) return null;
    if (intersectsProtectedMedia(el, mediaSlot)) return null;
    if (looksLikeAdContent(el)) return null;

    const topOffset = rect.top - frameRect.top;
    const widthRatio = rect.width / frameRect.width;
    const heightLimit = Math.min(132, Math.max(76, frameRect.height * .25));
    const aspect = rect.width / Math.max(1, rect.height);

    if (topOffset < -4 || topOffset > Math.max(26, frameRect.height * .07)) return null;
    if (widthRatio < .72 || widthRatio > 1.04) return null;
    if (rect.height < 28 || rect.height > heightLimit) return null;
    if (aspect < 3.1) return null;

    const centerDelta = Math.abs((rect.left + rect.width / 2) - (frameRect.left + frameRect.width / 2));
    if (centerDelta > frameRect.width * .12) return null;

    return Math.abs(topOffset) * 8 + Math.abs(widthRatio - .96) * 65 + Math.abs(rect.height - 72) * .08;
  }

  function expandToBandContainer(el, frame, frameRect, mediaSlot) {
    let current = el;
    for (let i = 0; i < 3; i += 1) {
      const parent = current.parentElement;
      if (!parent || parent === frame || !frame.contains(parent)) break;
      if (intersectsProtectedMedia(parent, mediaSlot) || looksLikeAdContent(parent)) break;

      const rect = visibleRect(parent);
      if (!rect) break;
      const topOffset = rect.top - frameRect.top;
      const widthRatio = rect.width / frameRect.width;
      const aspect = rect.width / Math.max(1, rect.height);

      if (topOffset < -4 || topOffset > 26) break;
      if (widthRatio < .76 || widthRatio > 1.04) break;
      if (rect.height > 138 || aspect < 2.8) break;
      current = parent;
    }
    return current;
  }

  function refitPcFrame(panel, frame) {
    if (panel.dataset.hwadsPreviewDevice !== 'pc') return;
    frame.style.removeProperty('--hwads-pc-preview-min-height');
    requestAnimationFrame(() => {
      const needed = Math.max(360, Math.ceil(frame.scrollHeight || 0));
      frame.style.setProperty('--hwads-pc-preview-min-height', `${needed}px`);
    });
  }

  function applyTrim() {
    const panel = activePanel();
    if (!panel) return;

    const placement = panel.dataset.hwadsActivePlacement || '';
    clearTrimMarks();
    if (!TARGET_PLACEMENTS.has(placement)) return;

    const frame = panel.querySelector(ACTIVE_FRAME);
    const frameRect = visibleRect(frame);
    if (!frame || !frameRect) return;

    const mediaSlot = frame.querySelector(MEDIA_SLOT);
    const nodes = [...frame.querySelectorAll('header,figure,section,div,img,video')];
    const scored = [];

    for (const el of nodes) {
      const score = candidateScore(el, frameRect, mediaSlot);
      if (score == null) continue;
      scored.push({ el, score });
    }

    scored.sort((a, b) => a.score - b.score);
    const raw = scored[0]?.el;
    if (!raw) return;

    const band = expandToBandContainer(raw, frame, frameRect, mediaSlot);
    band.setAttribute(TRIM_ATTR, '1');
    refitPcFrame(panel, frame);
  }

  function schedule(delay = 40) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      applyTrim();
      requestAnimationFrame(applyTrim);
    }, delay);
  }

  const style = document.createElement('style');
  style.id = 'hwads-preview-top-strip-trim-v5-style';
  style.textContent = `[${TRIM_ATTR}="1"]{display:none!important}`;
  document.head.appendChild(style);

  document.addEventListener('click', () => {
    schedule(20);
    window.setTimeout(applyTrim, 160);
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('input[type="file"]')) {
      schedule(50);
      window.setTimeout(applyTrim, 220);
    }
  }, true);

  document.addEventListener('load', (event) => {
    if (event.target?.matches?.('img,video')) schedule(30);
  }, true);

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) schedule(60);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', () => schedule(90), { passive: true });
  schedule(120);
  window.setTimeout(applyTrim, 320);
})();