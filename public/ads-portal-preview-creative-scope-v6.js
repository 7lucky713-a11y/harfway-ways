(() => {
  'use strict';

  const ACTIVE_FRAME = '[data-hwads-inline-preview-active-frame="1"]';
  const MEDIA_SLOT = '[data-hwads-preview-media-slot="1"]';
  const DUPLICATE_ATTR = 'data-hwads-creative-duplicate-band-v6';
  const TARGET_PLACEMENTS = new Set(['playlist', 'scraps']);
  const urlsByBlob = new WeakMap();
  let latestFile = null;
  let timer = 0;

  function rememberUrl(blob, url) {
    if (!blob || !url || typeof url !== 'string') return;
    let urls = urlsByBlob.get(blob);
    if (!urls) {
      urls = new Set();
      urlsByBlob.set(blob, urls);
    }
    urls.add(url);
  }

  const nativeCreateObjectURL = URL.createObjectURL?.bind(URL);
  if (nativeCreateObjectURL) {
    URL.createObjectURL = function hwadsCreateObjectURL(blob) {
      const url = nativeCreateObjectURL(blob);
      rememberUrl(blob, url);
      return url;
    };
  }

  const nativeReadAsDataURL = window.FileReader?.prototype?.readAsDataURL;
  if (nativeReadAsDataURL) {
    FileReader.prototype.readAsDataURL = function hwadsReadAsDataURL(blob) {
      this.addEventListener('load', () => {
        if (typeof this.result === 'string') rememberUrl(blob, this.result);
      }, { once: true });
      return nativeReadAsDataURL.call(this, blob);
    };
  }

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

  function fileUrls() {
    if (!latestFile) return new Set();
    return urlsByBlob.get(latestFile) || new Set();
  }

  function clearMarks() {
    document.querySelectorAll(`[${DUPLICATE_ATTR}="1"]`).forEach((el) => el.removeAttribute(DUPLICATE_ATTR));
  }

  function sourceStrings(el) {
    const values = [];
    if (/^(IMG|VIDEO|SOURCE)$/.test(el.tagName)) {
      if (el.currentSrc) values.push(el.currentSrc);
      if (el.src) values.push(el.src);
      const poster = el.getAttribute?.('poster');
      if (poster) values.push(poster);
    }
    const inlineBg = el.style?.backgroundImage;
    if (inlineBg && inlineBg !== 'none') values.push(inlineBg);
    const computedBg = getComputedStyle(el).backgroundImage;
    if (computedBg && computedBg !== 'none' && computedBg !== inlineBg) values.push(computedBg);
    return values;
  }

  function usesSelectedCreative(el, urls) {
    if (!urls.size) return false;
    const sources = sourceStrings(el);
    for (const url of urls) {
      if ([...sources].some((value) => value === url || value.includes(url))) return true;
    }
    return false;
  }

  function protectedBySlot(el, slot) {
    return !!slot && (el === slot || slot.contains(el) || el.contains(slot));
  }

  function topBandGeometry(el, frameRect) {
    const rect = visibleRect(el);
    if (!rect) return false;
    const topOffset = rect.top - frameRect.top;
    const widthRatio = rect.width / frameRect.width;
    const heightRatio = rect.height / frameRect.height;
    const aspect = rect.width / Math.max(1, rect.height);
    return topOffset >= -6 &&
      topOffset <= Math.max(100, frameRect.height * .22) &&
      widthRatio >= .68 && widthRatio <= 1.05 &&
      heightRatio <= .38 && rect.height <= 210 &&
      aspect >= 2.1;
  }

  function bandContainer(media, frame, frameRect, slot) {
    let best = topBandGeometry(media, frameRect) ? media : null;
    let node = media;
    for (let depth = 0; node?.parentElement && depth < 5; depth += 1) {
      const parent = node.parentElement;
      if (parent === frame || !frame.contains(parent) || protectedBySlot(parent, slot)) break;
      if (!topBandGeometry(parent, frameRect)) break;
      best = parent;
      node = parent;
    }
    return best;
  }

  function refitPcFrame(panel, frame) {
    if (panel.dataset.hwadsPreviewDevice !== 'pc') return;
    frame.style.removeProperty('--hwads-pc-preview-min-height');
    requestAnimationFrame(() => {
      frame.style.setProperty('--hwads-pc-preview-min-height', `${Math.max(360, Math.ceil(frame.scrollHeight || 0))}px`);
    });
  }

  function suppressDuplicates() {
    const panel = activePanel();
    clearMarks();
    if (!panel || !latestFile) return;

    const placement = panel.dataset.hwadsActivePlacement || '';
    if (!TARGET_PLACEMENTS.has(placement)) return;

    const frame = panel.querySelector(ACTIVE_FRAME);
    const slot = frame?.querySelector(MEDIA_SLOT);
    const frameRect = visibleRect(frame);
    const urls = fileUrls();
    if (!frame || !slot || !frameRect || !urls.size) return;

    const nodes = [...frame.querySelectorAll('img,video,source,figure,header,section,div')];
    const bands = new Set();

    for (const el of nodes) {
      if (protectedBySlot(el, slot)) continue;
      if (!usesSelectedCreative(el, urls)) continue;
      const band = bandContainer(el, frame, frameRect, slot);
      if (band) bands.add(band);
    }

    bands.forEach((band) => band.setAttribute(DUPLICATE_ATTR, '1'));
    if (bands.size) refitPcFrame(panel, frame);
  }

  function schedule(delay = 20) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      suppressDuplicates();
      requestAnimationFrame(suppressDuplicates);
    }, delay);
  }

  const style = document.createElement('style');
  style.id = 'hwads-preview-creative-scope-v6-style';
  style.textContent = `[${DUPLICATE_ATTR}="1"]{display:none!important}`;
  document.head.appendChild(style);

  document.addEventListener('change', (event) => {
    const input = event.target?.closest?.('input[type="file"]');
    if (!input) return;
    latestFile = input.files?.[0] || null;
    if (!latestFile) {
      clearMarks();
      return;
    }
    schedule(15);
    window.setTimeout(suppressDuplicates, 90);
    window.setTimeout(suppressDuplicates, 220);
    window.setTimeout(suppressDuplicates, 420);
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#hwads-inline-preview-controls [data-hwads-placement],#hwads-inline-preview-controls [data-hwads-device]')) {
      schedule(30);
      window.setTimeout(suppressDuplicates, 160);
      window.setTimeout(suppressDuplicates, 340);
    }
  }, true);

  document.addEventListener('load', (event) => {
    if (event.target?.matches?.('img,video')) schedule(25);
  }, true);

  const observer = new MutationObserver((mutations) => {
    if (!latestFile) return;
    if (mutations.some((m) => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) schedule(70);
    else if (mutations.some((m) => m.type === 'attributes' && /^(src|poster)$/.test(m.attributeName || ''))) schedule(35);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'poster'],
  });
})();