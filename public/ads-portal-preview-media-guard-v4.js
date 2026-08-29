(() => {
  'use strict';

  const UI_ID = 'hwads-inline-preview-controls';
  const BUTTON_ID = 'hwads-open-standalone-preview';
  const SLOT_SELECTOR = '[data-hwads-preview-media-slot="1"]';
  const PROXY_ATTR = 'data-hwads-upload-proxy-v4';
  let latestFile = null;
  let objectUrl = '';
  let syncTimer = 0;

  const normalize = (value) => String(value || '').replace(/[\u3000\s]+/g, ' ').trim();

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

  function visibleRect(el) {
    if (!el?.isConnected) return null;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    return rect.width >= 50 && rect.height >= 40 ? rect : null;
  }

  function currentFile() {
    return latestFile || document.querySelector('input[type="file"]')?.files?.[0] || null;
  }

  function ensureObjectUrl(file) {
    if (!file) return '';
    if (!objectUrl) objectUrl = URL.createObjectURL(file);
    return objectUrl;
  }

  function clearObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }

  function clearGuards(panel) {
    panel.querySelectorAll('[data-hwads-sample-media="guard-v4"]').forEach((el) => {
      delete el.dataset.hwadsSampleMedia;
    });
  }

  function cleanupOldProxies(panel, slot) {
    panel.querySelectorAll(`img[${PROXY_ATTR}="1"]`).forEach((proxy) => {
      const keep = proxy === slot || slot?.contains(proxy);
      if (!keep) proxy.remove();
    });
    panel.querySelectorAll('video[data-hwads-media-guard-video-v4="1"]').forEach((video) => {
      if (!slot?.contains(video) && video !== slot) video.remove();
    });
  }

  function proxyFor(slot) {
    if (!slot) return null;
    if (/^(IMG|VIDEO)$/.test(slot.tagName)) return slot;

    const existing = [...slot.querySelectorAll('img,video')]
      .filter((el) => visibleRect(el) && el.dataset.hwadsSampleMedia !== 'guard-v4')
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      })[0];
    if (existing) return existing;

    let proxy = slot.querySelector(`img[${PROXY_ATTR}="1"]`);
    if (!proxy) {
      proxy = document.createElement('img');
      proxy.setAttribute(PROXY_ATTR, '1');
      proxy.alt = '';
      proxy.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      const style = getComputedStyle(slot);
      if (style.position === 'static') slot.style.position = 'relative';
      Object.assign(proxy.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: 'inherit',
        pointerEvents: 'none',
        opacity: '.001',
        zIndex: '1',
      });
      slot.prepend(proxy);
    }
    return proxy;
  }

  function guardOtherMedia(panel, target) {
    for (const media of panel.querySelectorAll('img,video')) {
      if (media === target || media.dataset.hwadsSampleMedia === '1') continue;
      if (media.closest(`#${UI_ID},#${BUTTON_ID}`)) continue;
      media.dataset.hwadsSampleMedia = 'guard-v4';
    }
  }

  function applyImage(file, target) {
    if (!file || !target || !file.type.startsWith('image/')) return;
    const url = ensureObjectUrl(file);
    if (!url) return;
    if (target.tagName === 'IMG') {
      target.src = url;
      target.style.objectFit = 'cover';
      target.style.opacity = '1';
      target.dataset.hwadsSampleMedia = '1';
      return;
    }
    if (target.tagName === 'VIDEO') {
      target.src = url;
      target.dataset.hwadsSampleMedia = '1';
    }
  }

  function applyVideo(file, slot, target) {
    if (!file || !slot || !file.type.startsWith('video/')) return;
    const url = ensureObjectUrl(file);
    if (!url) return;

    if (target?.tagName === 'VIDEO') {
      target.src = url;
      target.muted = true;
      target.loop = true;
      target.playsInline = true;
      target.autoplay = true;
      target.dataset.hwadsSampleMedia = '1';
      target.play().catch(() => {});
      return;
    }

    let video = slot.querySelector('video[data-hwads-sample-media="1"],video[data-hwads-media-guard-video-v4="1"]');
    if (!video) {
      video = document.createElement('video');
      video.dataset.hwadsMediaGuardVideoV4 = '1';
      const style = getComputedStyle(slot);
      if (style.position === 'static') slot.style.position = 'relative';
      Object.assign(video.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: 'inherit',
        pointerEvents: 'none',
        zIndex: '3',
        background: '#090a0b',
      });
      slot.appendChild(video);
    }
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.dataset.hwadsSampleMedia = '1';
    if (target) target.dataset.hwadsSampleMedia = '1';
    video.play().catch(() => {});
  }

  function sync() {
    const panel = findPanel();
    if (!panel) return;
    const slot = panel.querySelector(SLOT_SELECTOR);
    if (!slot) return;

    clearGuards(panel);
    cleanupOldProxies(panel, slot);
    const target = proxyFor(slot);
    if (!target) return;
    guardOtherMedia(panel, target);

    const file = currentFile();
    if (!file) return;
    if (file.type.startsWith('image/')) applyImage(file, target);
    else if (file.type.startsWith('video/')) applyVideo(file, slot, target);
  }

  function scheduleSync(delay = 25) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, delay);
  }

  document.addEventListener('change', (event) => {
    const input = event.target?.closest?.('input[type="file"]');
    if (!input) return;
    const file = input.files?.[0] || null;
    if (!file || !/^(image|video)\//i.test(file.type || '')) return;
    latestFile = file;
    clearObjectUrl();
    scheduleSync(8);
    window.setTimeout(() => scheduleSync(0), 140);
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest?.(`#${UI_ID} [data-hwads-placement],#${UI_ID} [data-hwads-device]`)) {
      scheduleSync(35);
      window.setTimeout(() => scheduleSync(0), 220);
    }
  }, true);

  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((m) => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) return;
    scheduleSync(110);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('beforeunload', clearObjectUrl);
  scheduleSync(120);
})();