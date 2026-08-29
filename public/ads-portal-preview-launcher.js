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

  function readDraft() {
    const scope = formScope();
    const title = findField(scope, [/作品名/i,/ゲーム名/i,/タイトル/i,/title/i]);
    const catchField = findField(scope, [/キャッチコピー/i,/キャッチ/i,/一番伝えたい/i,/catch/i]);
    const description = findField(scope, [/紹介文/i,/特徴/i,/説明/i,/description/i], { multiline: true });
    const storeUrl = findField(scope, [/ストアURL/i,/作品URL/i,/リンク先/i,/store.*url/i,/url/i], { url: true });
    const fileInput = scope.querySelector('input[type="file"]');
    return {
      id: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      title: normalize(title?.value) || '作品タイトル',
      catchText: normalize(catchField?.value) || 'キャッチコピーがここに入ります。',
      description: normalize(description?.value) || '紹介文がここに入ります。',
      storeUrl: normalize(storeUrl?.value),
      placements: readPlacements(scope),
      tags: readTags(scope),
      mediaFile: fileInput?.files?.[0] || null,
      mediaName: fileInput?.files?.[0]?.name || '',
      mediaType: fileInput?.files?.[0]?.type || '',
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

  function mount() {
    if (document.getElementById(BUTTON_ID)) return true;
    const heading = findHeading();
    if (!heading) return false;
    const wrap = document.createElement('div');
    wrap.id = BUTTON_ID;
    wrap.innerHTML = '<button type="button"><span>実際の掲載プレビューを開く</span><b>↗</b></button><small>現在の入力内容を別ページで確認できます。PC / スマホ切替対応。</small>';
    heading.insertAdjacentElement('afterend', wrap);
    return true;
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.(`#${BUTTON_ID} button`);
    if (!button) return;
    event.preventDefault();
    const popup = window.open('about:blank', '_blank');
    const label = button.querySelector('span');
    const before = label?.textContent || '';
    if (label) label.textContent = 'プレビューを準備中…';
    button.disabled = true;
    try {
      const draft = readDraft();
      await saveDraft(draft);
      const url = `/ads-preview/?id=${encodeURIComponent(draft.id)}`;
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (error) {
      console.error('Failed to prepare advertiser preview', error);
      if (popup) popup.close();
      if (label) label.textContent = 'プレビューを開けませんでした';
      window.setTimeout(() => { if (label) label.textContent = before; }, 1800);
    } finally {
      button.disabled = false;
      if (label && label.textContent === 'プレビューを準備中…') label.textContent = before;
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    #${BUTTON_ID}{display:grid;gap:6px;margin:10px 0 14px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    #${BUTTON_ID} button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;appearance:none;border:1px solid #171717;border-radius:10px;padding:11px 13px;background:#171717;color:#fff;font-weight:900;font-size:12px;cursor:pointer}
    #${BUTTON_ID} button:hover{background:#2a2a2a}#${BUTTON_ID} button:disabled{opacity:.6;cursor:wait}
    #${BUTTON_ID} button b{color:#d8ff59;font-size:15px}#${BUTTON_ID} small{color:#8a857b;font-size:9px;line-height:1.5}
  `;
  document.head.appendChild(style);

  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
