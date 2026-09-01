(() => {
  const ADS = 'https://harfway-ads-delivery.vercel.app';
  const PLACEMENT = 'playback';
  const DEFAULT_EVERY = 4;
  const PROD_HOSTS = new Set([
    'harfway-playback.vercel.app',
    'harfway-playback-harf-way.vercel.app',
  ]);
  const TRACK_ENABLED = PROD_HOSTS.has(location.hostname);
  const SERVE = '/api/ads-fair-serve';
  const DEMO = new URLSearchParams(location.search).get('ads_demo') === '1';
  const contextTags = ['WAYS', 'インディーゲーム'];
  const LAST_AD_KEY = `hwads_last_${PLACEMENT}`;

  let ad = null;
  let everyN = DEFAULT_EVERY;
  let mobileObserver = null;
  let desktopObserver = null;
  let mobileTimer = null;
  let desktopTimer = null;
  let mobileCounted = false;
  let desktopCounted = false;
  let desktopAdOpen = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const sid = () => {
    let v = localStorage.getItem('hwads_sid');
    if (!v) {
      v = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .replace(/[^a-zA-Z0-9_-]/g, '');
      localStorage.setItem('hwads_sid', v);
    }
    return v;
  };

  const lastAdId = () => {
    try {
      const value = String(localStorage.getItem(LAST_AD_KEY) || '').trim().toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) ? value : '';
    } catch {
      return '';
    }
  };

  const rememberAd = (value) => {
    if (!value || value.__demo || !value.id) return;
    try {
      localStorage.setItem(LAST_AD_KEY, String(value.id).toLowerCase());
    } catch {}
  };

  async function req(url, opt = {}) {
    const r = await fetch(url, { cache: 'no-store', ...opt });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || d.message || `HTTP ${r.status}`);
    return d;
  }

  async function record(type) {
    if (!ad || ad.__demo || !TRACK_ENABLED) return null;
    try {
      return await req(`${ADS}/api/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          campaignId: ad.id,
          placement: PLACEMENT,
          contextTags,
          sessionKey: sid(),
        }),
      });
    } catch {
      return null;
    }
  }

  function demoAd() {
    return {
      id: 'ways-preview-demo',
      title: 'ここにプロモーションが入ります',
      catchText: 'WAYSの流れを止めず、通常コンテンツとは明確に分けた動画広告枠です。',
      description: 'Preview sample / impression is not counted.',
      storeUrl: '#',
      targetTags: ['PROMOTED', 'INDIE GAME'],
      mediaUrl: '',
      mediaMime: '',
      __demo: true,
    };
  }

  function addStyles() {
    if (document.getElementById('ways-ads-style')) return;
    const s = document.createElement('style');
    s.id = 'ways-ads-style';
    s.textContent = `
      .ways-ad-card .cover{border-color:#efff35;background:radial-gradient(circle at 70% 25%,#405315,#111 52%,#060706)}
      .ways-ad-card .cover:after{content:'PR';position:absolute;left:7px;bottom:7px;background:#efff35;color:#111;font:900 8px/1 system-ui;padding:5px 6px;border-radius:999px}
      .ways-ad-card .gtitle{color:#efff35}.ways-ad-card .glabel{color:#aebc7a}
      .ways-ad-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
      .ways-ad-fallback{position:absolute;inset:0;display:grid;place-items:center;padding:14px;text-align:center;font:900 12px/1.25 system-ui;letter-spacing:.04em;color:#efff35;background:radial-gradient(circle at 68% 28%,#405315,#0c0d0b 62%)}
      .ways-ad-stage-media{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#050505;z-index:2}
      .ways-ad-preview-note{position:absolute;z-index:7;left:14px;bottom:14px;padding:6px 8px;border:1px solid #ffffff2c;border-radius:999px;background:#050505cc;color:#bbb;font:8px/1 system-ui;letter-spacing:.08em}
      .ways-ad-mobile{background:radial-gradient(circle at 68% 24%,#405315,#070907 65%)!important}
      .ways-ad-mobile .ways-ad-mobile-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
      .ways-ad-mobile .ways-ad-mobile-fallback{position:absolute;inset:0;z-index:1;display:grid;place-items:center;padding:30px;background:radial-gradient(circle at 65% 25%,#405315,#070907 65%);font:950 clamp(38px,11vw,70px)/.9 system-ui;letter-spacing:-.06em;color:#efff35;text-align:left}
      .ways-ad-mobile .m-meta{z-index:5}.ways-ad-mobile .m-brand{z-index:6}.ways-ad-mobile .m-pause{z-index:6}
      .ways-ad-mobile .ways-ad-kicker{display:inline-flex;padding:6px 8px;border-radius:999px;background:#efff35;color:#111;font:950 9px/1 system-ui;letter-spacing:.12em;text-shadow:none;margin-bottom:8px}
      .ways-ad-mobile .m-meta a{background:#efff35}.ways-ad-mobile .m-tag{border-color:#efff3566;color:#efff35}
      .ways-ad-mobile .ways-ad-meter{position:absolute;z-index:7;right:14px;top:96px;padding:6px 8px;border:1px solid #ffffff2c;border-radius:999px;background:#050505cc;color:#aaa;font:8px/1 ui-monospace,monospace}
      .ways-ad-mobile .ways-ad-meter.ok{background:#efff35;color:#111;border-color:#efff35}
    `;
    document.head.appendChild(s);
  }

  function mediaThumb(a) {
    if (!a.mediaUrl) return `<span class="ways-ad-fallback">${esc(a.title)}</span>`;
    if ((a.mediaMime || '').startsWith('video/')) {
      return `<video class="ways-ad-thumb" muted loop playsinline preload="metadata" src="${esc(a.mediaUrl)}"></video>`;
    }
    return `<img class="ways-ad-thumb" src="${esc(a.mediaUrl)}" alt="">`;
  }

  function desktopCard() {
    const note = (!TRACK_ENABLED || ad.__demo) ? 'PREVIEW / NOT COUNTED' : 'PROMOTED';
    return `<button class="game ways-ad-card" type="button" data-ways-ad="1">
      <div class="cover">${mediaThumb(ad)}<span class="num">AD</span></div>
      <div class="gtitle">${esc(ad.title)}</div>
      <div class="glabel">${note}</div>
    </button>`;
  }

  function clearDesktopAdMedia() {
    document.querySelector('.ways-ad-stage-media')?.remove();
    document.querySelector('.ways-ad-preview-note')?.remove();
    desktopAdOpen = false;
  }

  function observeDesktopImpression(card) {
    desktopObserver?.disconnect();
    if (desktopTimer) clearTimeout(desktopTimer);
    desktopTimer = null;
    if (!card || desktopCounted) return;
    desktopObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (desktopCounted) continue;
        if (en.isIntersecting && en.intersectionRatio > 0) {
          if (!desktopTimer) {
            desktopTimer = setTimeout(async () => {
              desktopTimer = null;
              if (desktopCounted || !card.isConnected) return;
              const x = await record('impression');
              if (!x || x?.result?.accepted === false) return;
              desktopCounted = true;
              desktopObserver?.disconnect();
              desktopObserver = null;
            }, 1000);
          }
        } else if (desktopTimer) {
          clearTimeout(desktopTimer);
          desktopTimer = null;
        }
      }
    }, { threshold: [0, 0.01, 1] });
    desktopObserver.observe(card);
  }

  function openDesktopAd() {
    const frame = document.querySelector('.video-frame');
    const v = document.querySelector('#mainVideo');
    if (!frame || !v) return;
    clearDesktopAdMedia();
    desktopAdOpen = true;
    document.querySelectorAll('#shelf .game').forEach((x) => x.classList.toggle('on', x.matches('.ways-ad-card')));
    document.querySelector('#stageLabel') && (document.querySelector('#stageLabel').textContent = 'PR / SPONSORED');
    document.querySelector('#title') && (document.querySelector('#title').textContent = ad.title || 'PROMOTED');
    document.querySelector('#count') && (document.querySelector('#count').textContent = 'AD / PROMOTED');
    document.querySelector('#desc') && (document.querySelector('#desc').textContent = ad.catchText || ad.description || '');
    const tags = Array.isArray(ad.targetTags) ? ad.targetTags : [];
    const tagBox = document.querySelector('#tags');
    if (tagBox) tagBox.innerHTML = tags.map((t) => `<span class="tag"># ${esc(t)}</span>`).join('');
    const links = document.querySelector('#links');
    if (links) links.innerHTML = ad.storeUrl && ad.storeUrl !== '#'
      ? `<a class="store ways-ad-store" target="_blank" rel="noopener" href="${esc(ad.storeUrl)}">PROMOTED STORE ↗</a>`
      : '<span class="tag-empty">Preview sample</span>';

    v.pause();
    v.removeAttribute('poster');
    v.removeAttribute('src');
    v.load();
    if (ad.mediaUrl && (ad.mediaMime || '').startsWith('video/')) {
      v.src = ad.mediaUrl;
      v.muted = true;
      v.loop = true;
      v.load();
      v.play().catch(() => {});
    } else {
      const img = document.createElement('img');
      img.className = 'ways-ad-stage-media';
      img.alt = '';
      if (ad.mediaUrl) img.src = ad.mediaUrl;
      else {
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><radialGradient id="g" cx="70%" cy="25%"><stop stop-color="#405315"/><stop offset="1" stop-color="#060706"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/><text x="90" y="740" fill="#efff35" font-family="Arial" font-size="112" font-weight="900">PROMOTED</text></svg>`)}`;
      }
      frame.appendChild(img);
    }
    if (!TRACK_ENABLED || ad.__demo) {
      const note = document.createElement('div');
      note.className = 'ways-ad-preview-note';
      note.textContent = 'PREVIEW / IMP NOT COUNTED';
      frame.appendChild(note);
    }
  }

  function injectDesktop() {
    const shelf = document.querySelector('#shelf');
    if (!shelf || !ad || shelf.querySelector('.ways-ad-card')) return;
    const cards = [...shelf.querySelectorAll('.game:not(.ways-ad-card)')];
    if (cards.length < everyN) return;
    cards[everyN - 1].insertAdjacentHTML('afterend', desktopCard());
    const card = shelf.querySelector('.ways-ad-card');
    const preview = card?.querySelector('video');
    card?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDesktopAd();
    });
    if (preview) {
      card.addEventListener('mouseenter', () => preview.play().catch(() => {}));
      card.addEventListener('mouseleave', () => preview.pause());
    }
    observeDesktopImpression(card);
  }

  function mobileCard() {
    const tags = Array.isArray(ad.targetTags) ? ad.targetTags : [];
    const isVideo = !!ad.mediaUrl && (ad.mediaMime || '').startsWith('video/');
    const video = `<video muted playsinline loop preload="none" ${isVideo ? `data-src="${esc(ad.mediaUrl)}"` : ''}></video>`;
    const media = !isVideo && ad.mediaUrl
      ? `<img class="ways-ad-mobile-media" src="${esc(ad.mediaUrl)}" alt="">`
      : !ad.mediaUrl
        ? `<div class="ways-ad-mobile-fallback">PROMOTED<br>GAME</div>`
        : '';
    const store = ad.storeUrl && ad.storeUrl !== '#'
      ? `<a class="ways-ad-mobile-store" href="${esc(ad.storeUrl)}" target="_blank" rel="noopener">PROMOTED STORE ↗</a>`
      : '';
    return `<section class="m-card ways-ad-mobile" data-ways-ad="1">
      ${video}${media}
      <div class="m-brand">WAYS <b>/ PR</b></div>
      ${isVideo ? '<button class="m-pause">⏸</button>' : ''}
      <div class="ways-ad-meter" id="waysAdMeter">${(!TRACK_ENABLED || ad.__demo) ? 'PREVIEW / NOT COUNTED' : 'VIEW WAIT'}</div>
      <div class="m-meta">
        <div class="ways-ad-kicker">PR / SPONSORED</div>
        <h2>${esc(ad.title)}</h2>
        <p>${esc(ad.catchText || ad.description || '')}</p>
        ${tags.length ? `<div class="m-tags">${tags.map((t) => `<span class="m-tag"># ${esc(t)}</span>`).join('')}</div>` : ''}
        ${store}
      </div>
    </section>`;
  }

  function observeMobileImpression(card) {
    mobileObserver?.disconnect();
    const feed = document.querySelector('#mfeed');
    if (!feed || !card) return;
    mobileObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const meter = card.querySelector('.ways-ad-meter');
        if (en.intersectionRatio >= 0.5) {
          if (meter && TRACK_ENABLED && !ad.__demo && !mobileCounted) meter.textContent = '50% VISIBLE';
          if (!mobileCounted && !mobileTimer) {
            mobileTimer = setTimeout(async () => {
              mobileTimer = null;
              if (mobileCounted) return;
              const x = await record('impression');
              if (x?.result?.accepted === false) {
                card.remove();
                return;
              }
              mobileCounted = true;
              if (meter && TRACK_ENABLED && !ad.__demo) {
                meter.textContent = 'IMP COUNTED';
                meter.classList.add('ok');
              }
            }, 1000);
          }
        } else {
          if (mobileTimer) {
            clearTimeout(mobileTimer);
            mobileTimer = null;
          }
          if (meter && TRACK_ENABLED && !ad.__demo && !mobileCounted) meter.textContent = 'VIEW WAIT';
        }
      }
    }, { root: feed, threshold: [0, 0.5, 0.7, 1] });
    mobileObserver.observe(card);
  }

  function injectMobile() {
    const feed = document.querySelector('#mfeed');
    if (!feed || !ad || feed.querySelector('.ways-ad-mobile')) return;
    const cards = [...feed.querySelectorAll('.m-card:not(.ways-ad-mobile)')];
    if (cards.length < everyN) return;
    cards[everyN - 1].insertAdjacentHTML('afterend', mobileCard());
    const card = feed.querySelector('.ways-ad-mobile');
    card?.querySelector('.ways-ad-mobile-store')?.addEventListener('click', async () => {
      await record('click');
      await record('store_visit');
    }, true);
    observeMobileImpression(card);
  }

  function cleanupWhenEditorialReturns(e) {
    if (!desktopAdOpen) return;
    if (e.target.closest?.('.game:not(.ways-ad-card),#prev,#next,#random,#tags [data-tag],[data-reset]')) {
      clearDesktopAdMedia();
    }
  }

  function startDomWatch() {
    const root = document.body;
    const mo = new MutationObserver(() => {
      injectDesktop();
      injectMobile();
    });
    mo.observe(root, { childList: true, subtree: true });
    document.addEventListener('click', cleanupWhenEditorialReturns, true);
    document.addEventListener('click', async (e) => {
      if (e.target.closest?.('.ways-ad-store')) {
        await record('click');
        await record('store_visit');
      }
    }, true);
    injectDesktop();
    injectMobile();
  }

  async function boot() {
    addStyles();
    try {
      const params = new URLSearchParams({
        placement: PLACEMENT,
        tags: contextTags.join(','),
        sid: sid(),
      });
      const previous = lastAdId();
      if (previous) params.set('avoid', previous);
      const d = await req(`${SERVE}?${params.toString()}`);
      everyN = Math.max(1, Number(d.rule?.everyNItems || DEFAULT_EVERY));
      ad = d.ad || (DEMO ? demoAd() : null);
      rememberAd(ad);
    } catch {
      ad = DEMO ? demoAd() : null;
    }
    if (!ad) return;
    startDomWatch();
  }

  boot();
})();
