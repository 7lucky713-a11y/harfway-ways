(() => {
  'use strict';

  const config = window.__HWADS_FAIR_PREVIEW_CONFIG__ || {};
  const placement = String(config.placement || '');
  const TAGS = {
    playback: ['WAYS', 'インディーゲーム'],
    playlist: ['プレイリスト', 'インディーゲーム'],
    scraps: ['切れ端', 'インディーゲーム'],
    sale: ['SALE WATCH', 'Steam Sale', 'セール', 'インディーゲーム'],
  };
  const DEFAULT_EVERY = { playback: 4, playlist: 4, scraps: 3, sale: 6 };
  let ad = null;
  let everyN = DEFAULT_EVERY[placement] || 4;
  let candidateCount = 0;
  let revealed = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function sid() {
    let value = localStorage.getItem('hwads_fair_preview_sid');
    if (!value) {
      value = (`fairpreview-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '');
      localStorage.setItem('hwads_fair_preview_sid', value);
    }
    return value;
  }

  async function req(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function addStyles() {
    if (document.getElementById('hwads-fair-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'hwads-fair-preview-style';
    style.textContent = `
      .hwads-fair-target{position:relative!important;outline:4px solid #dfff49!important;outline-offset:3px!important;box-shadow:0 0 0 8px rgba(223,255,73,.13)!important}
      .hwads-fair-target:before{content:'FAIR v2 · SELECTED SLOT';position:absolute!important;z-index:99998!important;right:8px!important;bottom:8px!important;padding:7px 9px!important;border:1px solid #111!important;border-radius:999px!important;background:#dfff49!important;color:#0b0c0b!important;font:950 9px/1 system-ui,sans-serif!important;letter-spacing:.05em!important;white-space:nowrap!important;pointer-events:none!important;box-shadow:0 6px 20px rgba(0,0,0,.28)!important}
      #hwads-fair-ribbon{position:fixed;z-index:999999;left:12px;top:12px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(223,255,73,.65);border-radius:999px;background:rgba(8,9,8,.94);color:#eaff71;font:900 9px/1 system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none}
      #hwads-fair-ribbon b{width:7px;height:7px;border-radius:50%;background:#dfff49}.hwads-fair-media{width:100%;height:100%;object-fit:cover;display:block}.hwads-fair-fallback{display:grid;place-items:center;width:100%;height:100%;min-height:120px;background:radial-gradient(circle at 70% 25%,#405315,#090b08 68%);color:#dfff49;font:950 20px/1.05 system-ui;text-align:center;padding:18px}
      .hwads-fair-playlist{margin-top:12px;padding:14px;border:1px solid #c7ff4a55;border-radius:16px;background:radial-gradient(circle at 80% 20%,#354716,#10120f 60%);position:relative;overflow:hidden}.hwads-fair-playlist .media{width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:11px;background:#070807;margin-bottom:12px}.hwads-fair-playlist .k{font:900 9px/1 system-ui;letter-spacing:.14em;color:#c7ff4a}.hwads-fair-playlist h3{margin:7px 0;font:900 18px/1.1 system-ui}.hwads-fair-playlist p{margin:0;color:#adb2a8;font:10px/1.65 system-ui}
      .hwads-fair-sale{border:1px solid #dfff49!important;background:#10120f!important}.hwads-fair-sale .media{aspect-ratio:16/9;overflow:hidden;background:#090b08}.hwads-fair-sale .body{padding:13px}.hwads-fair-sale h2{margin:7px 0;font:950 22px/1.08 system-ui;color:#fff}.hwads-fair-sale p{margin:0;color:#bdc5ae;font:11px/1.7 system-ui}
    `;
    document.head.appendChild(style);
    const ribbon = document.createElement('div');
    ribbon.id = 'hwads-fair-ribbon';
    ribbon.innerHTML = `<b></b><span>FAIR v2 / ${candidateCount ? `${candidateCount} CANDIDATES` : 'NO ACTIVE CANDIDATE'} / NOT COUNTED</span>`;
    document.body.appendChild(ribbon);
  }

  function mark(el) {
    if (!el) return;
    el.classList.add('hwads-fair-target');
    if (!revealed && el.getClientRects().length) {
      revealed = true;
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }), 350);
      try {
        parent.postMessage({ type: 'hwads-fair-preview-ready', placement, candidateCount, title: ad?.title || '', everyN }, location.origin);
      } catch {}
    }
  }

  function media(innerClass = 'hwads-fair-media') {
    if (!ad?.mediaUrl) return `<div class="hwads-fair-fallback">${candidateCount ? 'PROMOTED' : 'NO ACTIVE<br>CAMPAIGN'}</div>`;
    if ((ad.mediaMime || '').startsWith('video/')) return `<video class="${innerClass}" src="${esc(ad.mediaUrl)}" autoplay muted loop playsinline preload="metadata"></video>`;
    return `<img class="${innerClass}" src="${esc(ad.mediaUrl)}" alt="">`;
  }

  function block(root) {
    root?.addEventListener('click', (event) => {
      if (event.target.closest?.('a,button')) event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function title() { return ad?.title || '現在、配信候補なし'; }
  function copy() { return ad?.catchText || ad?.description || (candidateCount ? '' : '公平配信v2の候補は現在0件です。配信中キャンペーンが入ると、この位置に選択結果が表示されます。'); }

  function injectWays() {
    const shelf = document.querySelector('#shelf');
    if (shelf && !shelf.querySelector('[data-hwads-fair="ways-desktop"]')) {
      const cards = [...shelf.querySelectorAll('.game:not(.ways-ad-card)')];
      if (cards.length >= everyN) {
        const thumb = ad?.mediaUrl ? media('hwads-fair-media') : `<div class="hwads-fair-fallback">${candidateCount ? 'PROMOTED' : 'NO ACTIVE'}</div>`;
        cards[everyN - 1].insertAdjacentHTML('afterend', `<button class="game ways-ad-card" type="button" data-hwads-fair="ways-desktop"><div class="cover" style="position:relative;overflow:hidden">${thumb}<span class="num">AD</span></div><div class="gtitle">${esc(title())}</div><div class="glabel">FAIR v2 / NOT COUNTED</div></button>`);
        const el = shelf.querySelector('[data-hwads-fair="ways-desktop"]'); block(el); mark(el);
      }
    }
    const feed = document.querySelector('#mfeed');
    if (feed && !feed.querySelector('[data-hwads-fair="ways-mobile"]')) {
      const cards = [...feed.querySelectorAll('.m-card:not(.ways-ad-mobile)')];
      if (cards.length >= everyN) {
        cards[everyN - 1].insertAdjacentHTML('afterend', `<section class="m-card ways-ad-mobile" data-hwads-fair="ways-mobile" style="position:relative;background:#080a08">${media('hwads-fair-media')}<div class="m-brand">WAYS <b>/ PR</b></div><div class="m-meta"><div style="display:inline-flex;padding:6px 8px;border-radius:999px;background:#dfff49;color:#111;font:950 9px/1 system-ui">FAIR v2 / SPONSORED</div><h2>${esc(title())}</h2><p>${esc(copy())}</p></div></section>`);
        const el = feed.querySelector('[data-hwads-fair="ways-mobile"]'); block(el); mark(el);
      }
    }
  }

  function injectPlaylist() {
    const open = document.querySelector('#openPlaylist');
    const viewer = document.querySelector('#viewer');
    if (open && viewer && !viewer.classList.contains('open') && !open.disabled) { open.click(); return; }
    const tracks = document.querySelector('#tracks');
    if (!tracks || tracks.querySelector('[data-hwads-fair="playlist"]')) return;
    const items = [...tracks.querySelectorAll('[data-g]')];
    if (items.length < everyN) return;
    items[everyN - 1].insertAdjacentHTML('afterend', `<article class="hwads-fair-playlist" data-hwads-fair="playlist"><div class="media">${media()}</div><div class="k">FAIR v2 / PR / SPONSORED</div><h3>${esc(title())}</h3><p>${esc(copy())}</p></article>`);
    const el = tracks.querySelector('[data-hwads-fair="playlist"]'); block(el); mark(el);
  }

  function injectScraps() {
    const grid = document.querySelector('#grid');
    const sponsor = document.querySelector('#sponsor');
    if (!grid || !sponsor || sponsor.dataset.hwadsFair === '1') return;
    const cards = [...grid.querySelectorAll(':scope > .card')];
    if (cards.length < everyN) return;
    cards[everyN - 1].after(sponsor);
    sponsor.dataset.hwadsFair = '1';
    sponsor.classList.add('show');
    const art = sponsor.querySelector('#spArt');
    if (art) art.innerHTML = media('sp-media');
    const t = sponsor.querySelector('#spTitle'); if (t) t.textContent = title();
    const c = sponsor.querySelector('#spCopy'); if (c) c.textContent = copy();
    const meter = sponsor.querySelector('#meter'); if (meter) meter.textContent = 'FAIR v2 / NOT COUNTED';
    const store = sponsor.querySelector('#spStore'); if (store) store.href = '#';
    block(sponsor); mark(sponsor);
  }

  function injectSale() {
    const grid = document.querySelector('#grid');
    if (!grid || grid.querySelector('[data-hwads-fair="sale"]')) return;
    const cards = [...grid.querySelectorAll(':scope > .card:not(.sale-ad-card)')];
    if (cards.length < everyN) return;
    cards[everyN - 1].insertAdjacentHTML('afterend', `<article class="card hwads-fair-sale" data-hwads-fair="sale"><div class="media">${media()}</div><div class="body"><div style="color:#dfff49;font:950 9px/1 system-ui;letter-spacing:.13em">FAIR v2 / SALE WATCH PR</div><h2>${esc(title())}</h2><p>${esc(copy())}</p></div></article>`);
    const el = grid.querySelector('[data-hwads-fair="sale"]'); block(el); mark(el);
  }

  function inject() {
    if (placement === 'playback') injectWays();
    else if (placement === 'playlist') injectPlaylist();
    else if (placement === 'scraps') injectScraps();
    else if (placement === 'sale') injectSale();
  }

  async function boot() {
    if (!Object.prototype.hasOwnProperty.call(TAGS, placement)) return;
    try {
      const data = await req(`/api/ads-fair-serve?placement=${encodeURIComponent(placement)}&tags=${encodeURIComponent(TAGS[placement].join(','))}&sid=${encodeURIComponent(sid())}`);
      ad = data.ad || null;
      candidateCount = Number(data.candidateCount || 0);
      everyN = Math.max(1, Number(data.rule?.everyNItems || everyN));
    } catch (error) {
      console.error('[fair-preview]', error);
      candidateCount = 0;
      ad = null;
    }
    addStyles();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      inject();
      if (revealed || attempts > 100) clearInterval(timer);
    }, 220);
    new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
    inject();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
