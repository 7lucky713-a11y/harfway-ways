(() => {
  'use strict';

  const config = window.__HWADS_LIVE_PREVIEW_CONFIG__ || {};
  const placement = String(config.placement || '');
  const previewId = String(config.id || '');
  const DB_NAME = 'harfway-ads-preview';
  const STORE_NAME = 'drafts';
  let draft = null;
  let mediaUrl = '';
  let revealed = false;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadDraft() {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(previewId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  }

  function addGlobalStyles() {
    if (document.getElementById('hwads-live-frame-style')) return;
    const style = document.createElement('style');
    style.id = 'hwads-live-frame-style';
    style.textContent = `
      .hwads-live-target{position:relative!important;outline:4px solid #dfff49!important;outline-offset:3px!important;box-shadow:0 0 0 8px rgba(223,255,73,.13)!important}
      .hwads-live-target:before{content:'YOUR AD PREVIEW · ここに表示';position:absolute!important;z-index:99998!important;right:8px!important;bottom:8px!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;padding:7px 9px!important;border:1px solid #111!important;border-radius:999px!important;background:#dfff49!important;color:#0b0c0b!important;font:950 9px/1 system-ui,sans-serif!important;letter-spacing:.05em!important;white-space:nowrap!important;pointer-events:none!important;box-shadow:0 6px 20px rgba(0,0,0,.28)!important}
      #hwads-live-ribbon{position:fixed;z-index:999999;left:12px;top:12px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(223,255,73,.65);border-radius:999px;background:rgba(8,9,8,.92);color:#eaff71;font:900 9px/1 system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none}
      #hwads-live-ribbon b{display:inline-block;width:7px;height:7px;border-radius:50%;background:#dfff49}
    `;
    document.head.appendChild(style);
    const ribbon = document.createElement('div');
    ribbon.id = 'hwads-live-ribbon';
    ribbon.innerHTML = '<b></b><span>PREVIEW ONLY / NOT COUNTED</span>';
    document.body.appendChild(ribbon);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  }

  function mark(target) {
    if (!target) return;
    target.classList.add('hwads-live-target');
    if (!revealed && isVisible(target)) {
      revealed = true;
      window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }), 450);
      try { parent.postMessage({ type: 'hwads-live-preview-ready', placement }, location.origin); } catch {}
    }
  }

  function mediaMarkup(className = '') {
    if (!draft?.mediaFile || !mediaUrl) return `<div class="hwads-preview-fallback ${className}">PROMOTED<br>GAME</div>`;
    if ((draft.mediaType || '').startsWith('video/')) {
      return `<video class="${className}" src="${esc(mediaUrl)}" muted autoplay loop playsinline preload="metadata"></video>`;
    }
    return `<img class="${className}" src="${esc(mediaUrl)}" alt="">`;
  }

  function blockAdNavigation(root) {
    root?.addEventListener('click', (event) => {
      const a = event.target.closest?.('a');
      if (a) event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function injectWaysStyles() {
    if (document.getElementById('hwads-live-ways-style')) return;
    const s = document.createElement('style');
    s.id = 'hwads-live-ways-style';
    s.textContent = `
      .ways-ad-card .cover{border-color:#efff35!important;background:radial-gradient(circle at 70% 25%,#405315,#111 52%,#060706)!important;position:relative}
      .ways-ad-card .cover:after{content:'PR';position:absolute;left:7px;bottom:7px;background:#efff35;color:#111;font:900 8px/1 system-ui;padding:5px 6px;border-radius:999px}
      .ways-ad-card .gtitle{color:#efff35!important}.ways-ad-card .glabel{color:#aebc7a!important}
      .ways-ad-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}.ways-ad-fallback{position:absolute;inset:0;display:grid;place-items:center;padding:14px;text-align:center;font:900 12px/1.25 system-ui;letter-spacing:.04em;color:#efff35;background:radial-gradient(circle at 68% 28%,#405315,#0c0d0b 62%)}
      .ways-ad-mobile{background:radial-gradient(circle at 68% 24%,#405315,#070907 65%)!important;position:relative}.ways-ad-mobile .ways-ad-mobile-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}.ways-ad-mobile .ways-ad-mobile-fallback{position:absolute;inset:0;z-index:1;display:grid;place-items:center;padding:30px;background:radial-gradient(circle at 65% 25%,#405315,#070907 65%);font:950 clamp(38px,11vw,70px)/.9 system-ui;letter-spacing:-.06em;color:#efff35;text-align:left}.ways-ad-mobile .m-meta{z-index:5}.ways-ad-mobile .m-brand{z-index:6}.ways-ad-mobile .ways-ad-kicker{display:inline-flex;padding:6px 8px;border-radius:999px;background:#efff35;color:#111;font:950 9px/1 system-ui;letter-spacing:.12em;text-shadow:none;margin-bottom:8px}.ways-ad-mobile .m-tag{border-color:#efff3566;color:#efff35}
    `;
    document.head.appendChild(s);
  }

  function injectWays() {
    injectWaysStyles();
    const shelf = document.querySelector('#shelf');
    if (shelf && !shelf.querySelector('[data-hwads-live="ways-desktop"]')) {
      const cards = [...shelf.querySelectorAll('.game:not(.ways-ad-card)')];
      if (cards.length >= 4) {
        const media = draft?.mediaFile && mediaUrl
          ? ((draft.mediaType || '').startsWith('video/')
            ? `<video class="ways-ad-thumb" muted loop autoplay playsinline preload="metadata" src="${esc(mediaUrl)}"></video>`
            : `<img class="ways-ad-thumb" src="${esc(mediaUrl)}" alt="">`)
          : `<span class="ways-ad-fallback">${esc(draft.title || 'PROMOTED')}</span>`;
        cards[3].insertAdjacentHTML('afterend', `<button class="game ways-ad-card" type="button" data-hwads-live="ways-desktop"><div class="cover">${media}<span class="num">AD</span></div><div class="gtitle">${esc(draft.title || 'PROMOTED')}</div><div class="glabel">PREVIEW / NOT COUNTED</div></button>`);
        const ad = shelf.querySelector('[data-hwads-live="ways-desktop"]');
        blockAdNavigation(ad);
        mark(ad);
      }
    }

    const feed = document.querySelector('#mfeed');
    if (feed && !feed.querySelector('[data-hwads-live="ways-mobile"]')) {
      const cards = [...feed.querySelectorAll('.m-card:not(.ways-ad-mobile)')];
      if (cards.length >= 4) {
        const tags = (draft.tags || []).slice(0, 4).map((t) => `<span class="m-tag"># ${esc(t)}</span>`).join('');
        const media = draft?.mediaFile && mediaUrl
          ? ((draft.mediaType || '').startsWith('video/')
            ? `<video class="ways-ad-mobile-media" src="${esc(mediaUrl)}" muted autoplay loop playsinline preload="metadata"></video>`
            : `<img class="ways-ad-mobile-media" src="${esc(mediaUrl)}" alt="">`)
          : '<div class="ways-ad-mobile-fallback">PROMOTED<br>GAME</div>';
        cards[3].insertAdjacentHTML('afterend', `<section class="m-card ways-ad-mobile" data-hwads-live="ways-mobile">${media}<div class="m-brand">WAYS <b>/ PR</b></div><div class="m-meta"><div class="ways-ad-kicker">PR / SPONSORED</div><h2>${esc(draft.title || 'PROMOTED')}</h2><p>${esc(draft.catchText || draft.description || '')}</p>${tags ? `<div class="m-tags">${tags}</div>` : ''}<a href="#" class="ways-ad-mobile-store">PROMOTED STORE ↗</a></div></section>`);
        const ad = feed.querySelector('[data-hwads-live="ways-mobile"]');
        blockAdNavigation(ad);
        mark(ad);
      }
    }
  }

  function injectPlaylistStyles() {
    if (document.getElementById('hwads-live-playlist-style')) return;
    const s = document.createElement('style');
    s.id = 'hwads-live-playlist-style';
    s.textContent = `
      .playlist-ad{margin-top:12px;padding:14px;border:1px solid #c7ff4a55;border-radius:16px;background:radial-gradient(circle at 80% 20%,#354716,#10120f 60%);cursor:default;position:relative;overflow:hidden}.playlist-ad-media{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:11px;background:#070807;display:block;margin-bottom:12px}.playlist-ad-fallback{width:100%;aspect-ratio:16/9;border-radius:11px;background:radial-gradient(circle at 72% 25%,#405315,#060706 70%);display:grid;place-items:center;color:#c7ff4a;font:900 24px/1 system-ui;letter-spacing:-.04em;margin-bottom:12px}.playlist-ad-kicker{font-size:9px;letter-spacing:.14em;color:#c7ff4a;font-weight:900}.playlist-ad h3{margin:6px 0 7px;font-size:18px;line-height:1.1}.playlist-ad p{margin:0;color:#adb2a8;font-size:10px;line-height:1.65}.playlist-ad a{display:inline-block;margin-top:10px;padding:8px 10px;border-radius:999px;background:#c7ff4a;color:#111;text-decoration:none;font-size:9px;font-weight:900}.playlist-ad-meter{position:absolute;right:10px;top:10px;border:1px solid #ffffff2d;border-radius:999px;padding:5px 7px;background:#080908cc;color:#c7ff4a;font:8px/1 ui-monospace,monospace}
    `;
    document.head.appendChild(s);
  }

  function injectPlaylist() {
    injectPlaylistStyles();
    const open = document.querySelector('#openPlaylist');
    const viewer = document.querySelector('#viewer');
    if (open && viewer && !viewer.classList.contains('open') && !open.disabled) {
      open.click();
      return;
    }
    const tracks = document.querySelector('#tracks');
    if (!tracks || tracks.querySelector('[data-hwads-live="playlist"]')) return;
    const items = [...tracks.querySelectorAll('[data-g]')];
    if (items.length < 4) return;
    const media = draft?.mediaFile && mediaUrl
      ? ((draft.mediaType || '').startsWith('video/')
        ? `<video class="playlist-ad-media" muted autoplay loop playsinline preload="metadata" src="${esc(mediaUrl)}"></video>`
        : `<img class="playlist-ad-media" src="${esc(mediaUrl)}" alt="">`)
      : '<div class="playlist-ad-fallback">PROMOTED</div>';
    items[3].insertAdjacentHTML('afterend', `<article class="playlist-ad" data-hwads-live="playlist"><div class="playlist-ad-meter">PREVIEW / NOT COUNTED</div>${media}<div class="playlist-ad-kicker">PR / SPONSORED</div><h3>${esc(draft.title || 'PROMOTED')}</h3><p>${esc(draft.catchText || draft.description || '')}</p><a href="#">PROMOTED STORE ↗</a></article>`);
    const ad = tracks.querySelector('[data-hwads-live="playlist"]');
    blockAdNavigation(ad);
    mark(ad);
  }

  function injectScraps() {
    const sponsor = document.querySelector('#sponsor');
    if (!sponsor || sponsor.dataset.hwadsLive === 'scraps') return;
    sponsor.dataset.hwadsLive = 'scraps';
    const title = sponsor.querySelector('#spTitle');
    const copy = sponsor.querySelector('#spCopy');
    const store = sponsor.querySelector('#spStore');
    const meter = sponsor.querySelector('#meter');
    const art = sponsor.querySelector('#spArt');
    if (title) title.textContent = draft.title || 'PROMOTED';
    if (copy) copy.textContent = draft.catchText || draft.description || '';
    if (meter) meter.textContent = 'PREVIEW / NOT COUNTED';
    if (store) { store.href = '#'; store.textContent = 'このゲームを見る ↗'; }
    if (art) {
      if (draft?.mediaFile && mediaUrl) art.innerHTML = (draft.mediaType || '').startsWith('video/')
        ? `<video class="sp-media" src="${esc(mediaUrl)}" autoplay muted loop playsinline></video>`
        : `<img class="sp-media" src="${esc(mediaUrl)}" alt="">`;
      else art.textContent = 'P.SP';
    }
    sponsor.classList.add('show');
    blockAdNavigation(sponsor);
    mark(sponsor);
  }

  function injectSaleStyles() {
    if (document.getElementById('hwads-live-sale-style')) return;
    const s = document.createElement('style');
    s.id = 'hwads-live-sale-style';
    s.textContent = `
      .sale-ad-card{border-color:#eaff35!important;background:linear-gradient(180deg,#171b12,#10120f)!important;position:relative}.sale-ad-media{position:relative;aspect-ratio:16/9;overflow:hidden;background:radial-gradient(circle at 68% 24%,#526719,#11150c 58%,#090a08);display:grid;place-items:center}.sale-ad-media img,.sale-ad-media video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}.sale-ad-fallback{padding:24px;color:#eaff35;font:950 clamp(30px,4vw,56px)/.86 system-ui,sans-serif;letter-spacing:-.055em;text-align:left;width:100%}.sale-ad-badge{position:absolute;z-index:3;top:10px;left:10px;padding:7px 9px;border-radius:999px;background:#eaff35;color:#090a0c;font:950 9px/1 system-ui;letter-spacing:.08em}.sale-ad-body{padding:13px;display:flex;flex-direction:column;gap:12px;min-height:238px}.sale-ad-kicker{color:#eaff35;font:950 9px/1.2 system-ui;letter-spacing:.14em}.sale-ad-title{margin:0;font:950 22px/1.08 system-ui;color:#fff}.sale-ad-copy{margin:0;color:#bdc5ae;font:700 11px/1.7 system-ui}.sale-ad-tags{display:flex;gap:5px;flex-wrap:wrap}.sale-ad-tag{border:1px solid #4e5b2a;border-radius:999px;padding:4px 6px;color:#cfdc7c;font:800 8px/1.2 system-ui}.sale-ad-actions{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid #343a26}.sale-ad-store{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 10px;border-radius:8px;background:#eaff35;color:#08090b;text-decoration:none;font:950 9px/1 system-ui}.sale-ad-note{color:#ffd06d;font:800 8px/1.35 system-ui;text-align:right}@media(max-width:640px){.sale-ad-body{min-height:0}}
    `;
    document.head.appendChild(s);
  }

  function injectSale() {
    injectSaleStyles();
    const grid = document.querySelector('#grid');
    if (!grid || grid.querySelector('[data-hwads-live="sale"]')) return;
    const cards = [...grid.querySelectorAll(':scope > .card:not(.sale-ad-card)')];
    if (cards.length < 6) return;
    const tags = (draft.tags || []).slice(0, 4).map((t) => `<span class="sale-ad-tag"># ${esc(t)}</span>`).join('');
    const media = draft?.mediaFile && mediaUrl
      ? ((draft.mediaType || '').startsWith('video/')
        ? `<video muted autoplay loop playsinline preload="metadata" src="${esc(mediaUrl)}"></video>`
        : `<img src="${esc(mediaUrl)}" alt="">`)
      : '<div class="sale-ad-fallback">PROMOTED<br>GAME</div>';
    cards[5].insertAdjacentHTML('afterend', `<article class="card sale-ad-card" data-hwads-live="sale"><div class="sale-ad-media">${media}<span class="sale-ad-badge">PR / SPONSORED</span></div><div class="sale-ad-body"><div class="sale-ad-kicker">HARF-WAY / SALE WATCH PR</div><h2 class="sale-ad-title">${esc(draft.title || 'PROMOTED')}</h2><p class="sale-ad-copy">${esc(draft.catchText || draft.description || '')}</p>${tags ? `<div class="sale-ad-tags">${tags}</div>` : ''}<div class="sale-ad-actions"><a class="sale-ad-store" href="#">ストアで見る ↗</a><span class="sale-ad-note">PREVIEW / NOT COUNTED</span></div></div></article>`);
    const ad = grid.querySelector('[data-hwads-live="sale"]');
    blockAdNavigation(ad);
    mark(ad);
  }

  function injectCurrent() {
    if (!draft) return;
    if (placement === 'playback') injectWays();
    else if (placement === 'playlist') injectPlaylist();
    else if (placement === 'scraps') injectScraps();
    else if (placement === 'sale') injectSale();
  }

  function watch() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      injectCurrent();
      const target = document.querySelector('.hwads-live-target');
      if (target && isVisible(target)) mark(target);
      if (attempts > 90 || (revealed && attempts > 20)) window.clearInterval(timer);
    }, 220);
    new MutationObserver(() => injectCurrent()).observe(document.documentElement, { childList: true, subtree: true });
  }

  async function boot() {
    if (!placement || !previewId) return;
    try {
      draft = await loadDraft();
      if (!draft) throw new Error('Preview draft not found');
      if (draft.mediaFile) mediaUrl = URL.createObjectURL(draft.mediaFile);
      addGlobalStyles();
      watch();
      injectCurrent();
    } catch (error) {
      console.error('HARF-WAY actual-screen ad preview failed', error);
      addGlobalStyles();
      const ribbon = document.querySelector('#hwads-live-ribbon span');
      if (ribbon) ribbon.textContent = 'PREVIEW DATA NOT FOUND';
    }
  }

  window.addEventListener('beforeunload', () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
