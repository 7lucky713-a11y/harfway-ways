(() => {
  'use strict';

  const BUTTON_ID = 'hwads-open-standalone-preview';
  const DB_NAME = 'harfway-ads-preview';
  const STORE_NAME = 'drafts';
  const DB_VERSION = 1;
  const placements = [
    { id: 'playlist', re: /PLAYLIST|プレイリスト/i },
    { id: 'scraps', re: /SCRAPBOOK|SCRAPS?|切れ端/i },
    { id: 'playback', re: /\bWAYS\b|playback/i },
    { id: 'sale', re: /SALE\s*WATCH|\bSALE\b|セール/i },
  ];

  let latestMediaFile = null;
  let sampleMediaUrl = '';
  let sampleVideoEl = null;
  let sampleTarget = null;
  let sampleTargetKind = '';
  let sampleRestore = null;
  let sampleSyncTimer = 0;

  const normalize = (v) => String(v || '').replace(/[\u3000\s]+/g, ' ').trim();

  function labelText(el) {
    const bits = [];
    if (el?.labels?.length) for (const label of el.labels) bits.push(label.textContent || '');
    const parentLabel = el?.closest?.('label');
    if (parentLabel) bits.push(parentLabel.textContent || '');
    const wrap = el?.parentElement;
    if (wrap) {
      bits.push(wrap.textContent || '');
      if (wrap.previousElementSibling) bits.push(wrap.previousElementSibling.textContent || '');
    }
    bits.push(el?.getAttribute?.('placeholder') || '');
    bits.push(el?.getAttribute?.('aria-label') || '');
    bits.push(el?.getAttribute?.('name') || '');
    return normalize(bits.join(' '));
  }

  function formScope() {
    const file = document.querySelector('input[type="file"]');
    return file?.closest('form') || file?.closest('main') || document.body;
  }

  function textFields(scope) {
    return [...scope.querySelectorAll('input:not([type]),input[type="text"],input[type="url"],input[type="search"],textarea')];
  }

  function findField(scope, patterns, opts = {}) {
    const scored = [];
    for (const field of textFields(scope)) {
      const text = labelText(field);
      let score = 0;
      patterns.forEach((re, i) => { if (re.test(text)) score = Math.max(score, 100 - i * 7); });
      if (opts.multiline && field.tagName === 'TEXTAREA') score += 12;
      if (opts.url && (field.type === 'url' || /URL|https?:|ストア|リンク/i.test(text))) score += 14;
      if (score) scored.push({ field, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.field || null;
  }

  function rgb(value) {
    const m = String(value || '').match(/rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function luminance(c) {
    return c ? c[0] * .299 + c[1] * .587 + c[2] * .114 : 255;
  }

  function selectedControl(el) {
    if ('checked' in el && el.checked) return true;
    if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true') return true;
    if (/selected|active|checked/i.test(String(el.className || ''))) return true;
    const style = getComputedStyle(el);
    return luminance(rgb(style.backgroundColor)) < 105 && luminance(rgb(style.color)) > 120;
  }

  function readPlacements(scope) {
    const found = [];
    const controls = [...scope.querySelectorAll('button,input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="switch"]')];
    for (const item of placements) {
      const candidates = controls.filter((el) => item.re.test(normalize(el.textContent || labelText(el))));
      if (candidates.some(selectedControl)) found.push(item.id);
    }
    return found.length ? found : placements.map((x) => x.id);
  }

  function readTags(scope) {
    const known = ['ローグライク','デッキ構築','クリーチャー','短編ADV','ホラー','アクション','パズル','シミュレーション'];
    const controls = [...scope.querySelectorAll('button,[role="checkbox"],[role="switch"]')];
    return known.filter((tag) => controls.some((el) => normalize(el.textContent) === tag && selectedControl(el))).slice(0, 6);
  }

  function currentFile(scope) {
    return latestMediaFile || scope.querySelector('input[type="file"]')?.files?.[0] || null;
  }

  function readDraft() {
    const scope = formScope();
    const title = findField(scope, [/作品名/i,/ゲーム名/i,/タイトル/i,/title/i]);
    const catchField = findField(scope, [/キャッチコピー/i,/キャッチ/i,/一番伝えたい/i,/catch/i]);
    const description = findField(scope, [/紹介文/i,/特徴/i,/説明/i,/description/i], { multiline: true });
    const storeUrl = findField(scope, [/ストアURL/i,/作品URL/i,/リンク先/i,/store.*url/i,/url/i], { url: true });
    const mediaFile = currentFile(scope);
    return {
      id: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      title: normalize(title?.value) || '作品タイトル',
      catchText: normalize(catchField?.value) || 'キャッチコピーがここに入ります。',
      description: normalize(description?.value) || '紹介文がここに入ります。',
      storeUrl: normalize(storeUrl?.value),
      placements: readPlacements(scope),
      tags: readTags(scope),
      mediaFile,
      mediaName: mediaFile?.name || '',
      mediaType: mediaFile?.type || '',
    };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDraft(draft) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(draft);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function findHeading() {
    return [...document.querySelectorAll('h1,h2,h3,h4,div,p,span')]
      .find((el) => normalize(el.textContent) === '掲載されたときの見え方') || null;
  }

  function findPreviewPanel() {
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
    return rect.width >= 120 && rect.height >= 72 ? rect : null;
  }

  function findSampleTarget(panel) {
    if (!panel) return null;
    const mediaCandidates = [...panel.querySelectorAll('img,video')]
      .filter((el) => !el.closest(`#${BUTTON_ID}`) && !el.dataset.hwadsSampleMedia)
      .map((el) => ({ el, rect: visibleRect(el) }))
      .filter((x) => x.rect)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    if (mediaCandidates[0]) return { kind: 'media', el: mediaCandidates[0].el };

    const bgCandidates = [...panel.querySelectorAll('div,section,article,figure')]
      .filter((el) => !el.closest(`#${BUTTON_ID}`) && !el.dataset.hwadsSampleMedia)
      .map((el) => ({ el, rect: visibleRect(el), bg: getComputedStyle(el).backgroundImage }))
      .filter((x) => x.rect && x.bg && x.bg !== 'none')
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    return bgCandidates[0] ? { kind: 'background', el: bgCandidates[0].el } : null;
  }

  function restoreSampleTarget() {
    if (sampleVideoEl) {
      sampleVideoEl.remove();
      sampleVideoEl = null;
    }
    if (sampleRestore) {
      try { sampleRestore(); } catch {}
    }
    sampleRestore = null;
    sampleTarget = null;
    sampleTargetKind = '';
  }

  function revokeSampleUrl() {
    if (sampleMediaUrl) URL.revokeObjectURL(sampleMediaUrl);
    sampleMediaUrl = '';
  }

  function applySampleMedia() {
    if (!latestMediaFile) return;
    const panel = findPreviewPanel();
    if (!panel) return;

    let targetInfo = sampleTarget?.isConnected && panel.contains(sampleTarget)
      ? { kind: sampleTargetKind || 'media', el: sampleTarget }
      : findSampleTarget(panel);
    if (!targetInfo?.el) return;

    if (sampleTarget && sampleTarget !== targetInfo.el) restoreSampleTarget();
    if (!sampleMediaUrl) sampleMediaUrl = URL.createObjectURL(latestMediaFile);
    sampleTarget = targetInfo.el;
    sampleTargetKind = targetInfo.kind;

    if (latestMediaFile.type.startsWith('image/')) {
      if (targetInfo.kind === 'media') {
        const el = targetInfo.el;
        if (el.tagName === 'IMG') {
          if (!el.dataset.hwadsOriginalSrc) el.dataset.hwadsOriginalSrc = el.currentSrc || el.src || '';
          const original = el.dataset.hwadsOriginalSrc;
          sampleRestore = () => { if (original) el.src = original; delete el.dataset.hwadsOriginalSrc; delete el.dataset.hwadsSampleMedia; };
          el.src = sampleMediaUrl;
          el.style.objectFit = 'cover';
          el.dataset.hwadsSampleMedia = '1';
          return;
        }
        if (el.tagName === 'VIDEO') {
          const original = el.currentSrc || el.src || '';
          sampleRestore = () => { el.src = original; delete el.dataset.hwadsSampleMedia; };
          el.src = sampleMediaUrl;
          el.muted = true;
          el.loop = true;
          el.playsInline = true;
          el.autoplay = true;
          el.dataset.hwadsSampleMedia = '1';
          el.play().catch(() => {});
          return;
        }
      }
      const el = targetInfo.el;
      const original = el.style.backgroundImage;
      sampleRestore = () => { el.style.backgroundImage = original; delete el.dataset.hwadsSampleMedia; };
      el.style.backgroundImage = `url("${sampleMediaUrl}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.dataset.hwadsSampleMedia = '1';
      return;
    }

    if (latestMediaFile.type.startsWith('video/')) {
      const host = targetInfo.kind === 'media' ? (targetInfo.el.parentElement || targetInfo.el) : targetInfo.el;
      if (!host) return;
      const hostStyle = getComputedStyle(host);
      const previousPosition = host.style.position;
      if (hostStyle.position === 'static') host.style.position = 'relative';
      sampleRestore = () => { host.style.position = previousPosition; if (targetInfo.el) delete targetInfo.el.dataset.hwadsSampleMedia; };
      if (!sampleVideoEl || sampleVideoEl.parentElement !== host) {
        sampleVideoEl?.remove();
        sampleVideoEl = document.createElement('video');
        sampleVideoEl.dataset.hwadsSampleMedia = '1';
        Object.assign(sampleVideoEl.style, {
          position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', zIndex: '3', borderRadius: 'inherit', background: '#090a0b'
        });
        sampleVideoEl.muted = true;
        sampleVideoEl.loop = true;
        sampleVideoEl.playsInline = true;
        sampleVideoEl.autoplay = true;
        sampleVideoEl.preload = 'metadata';
        host.appendChild(sampleVideoEl);
      }
      sampleVideoEl.src = sampleMediaUrl;
      targetInfo.el.dataset.hwadsSampleMedia = '1';
      sampleVideoEl.play().catch(() => {});
    }
  }

  function scheduleSampleSync(delay = 80) {
    window.clearTimeout(sampleSyncTimer);
    sampleSyncTimer = window.setTimeout(applySampleMedia, delay);
  }

  function setLatestMedia(file) {
    if (!file) return;
    latestMediaFile = file;
    restoreSampleTarget();
    revokeSampleUrl();
    scheduleSampleSync(30);
  }

  function mount() {
    const panel = findPreviewPanel();
    if (!panel) return false;
    let wrap = document.getElementById(BUTTON_ID);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = BUTTON_ID;
      wrap.innerHTML = '<button type="button"><span>実画面で掲載位置を確認</span><b>↗</b></button><small>現在の入力内容と選択した画像 / 動画を、実際の公開画面へ反映して確認できます。PC / スマホ切替対応。</small>';
    }
    if (wrap.parentElement !== panel || panel.lastElementChild !== wrap) panel.appendChild(wrap);
    scheduleSampleSync();
    return true;
  }

  document.addEventListener('change', (event) => {
    const input = event.target?.closest?.('input[type="file"]');
    if (!input) return;
    const file = input.files?.[0] || null;
    if (file && /^(image|video)\//i.test(file.type || '')) setLatestMedia(file);
  }, true);

  document.addEventListener('click', (event) => {
    if (latestMediaFile && !event.target.closest?.(`#${BUTTON_ID}`)) scheduleSampleSync(120);
  }, true);

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.(`#${BUTTON_ID} button`);
    if (!button) return;
    event.preventDefault();
    const popup = window.open('about:blank', '_blank');
    const label = button.querySelector('span');
    const before = label?.textContent || '';
    if (label) label.textContent = '実画面を準備中…';
    button.disabled = true;
    try {
      const draft = readDraft();
      await saveDraft(draft);
      const firstPlacement = draft.placements?.[0] || 'playlist';
      const url = `/ads-live-preview/?id=${encodeURIComponent(draft.id)}&placement=${encodeURIComponent(firstPlacement)}&device=pc`;
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (error) {
      console.error('Failed to prepare advertiser preview', error);
      if (popup) popup.close();
      if (label) label.textContent = 'プレビューを開けませんでした';
      window.setTimeout(() => { if (label) label.textContent = before; }, 1800);
    } finally {
      button.disabled = false;
      if (label && label.textContent === '実画面を準備中…') label.textContent = before;
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    #${BUTTON_ID}{display:grid;gap:7px;margin:18px 0 0;padding-top:16px;border-top:1px solid #ded8cc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    #${BUTTON_ID} button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;appearance:none;border:1px solid #171717;border-radius:10px;padding:12px 14px;background:#171717;color:#fff;font-weight:900;font-size:12px;cursor:pointer}
    #${BUTTON_ID} button:hover{background:#2a2a2a}#${BUTTON_ID} button:disabled{opacity:.6;cursor:wait}
    #${BUTTON_ID} button b{color:#d8ff59;font-size:15px}#${BUTTON_ID} small{color:#8a857b;font-size:9px;line-height:1.5}
  `;
  document.head.appendChild(style);

  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('beforeunload', () => {
    restoreSampleTarget();
    revokeSampleUrl();
  });
})();