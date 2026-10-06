(() => {
  // WAYS videos remain unfiltered. Only the price CTA is limited to confirmed sale offers.
  const STEAM_API = '/api/steam-prices-public?appids=';
  const FAN_API = '/api/fanatical-prices-public?appids=';
  const BATCH_SIZE = 8;
  const offers = new Map();
  const queued = new Set();
  const pending = new Set();
  const watchedCards = new WeakSet();
  let requestActive = false;
  let batchTimer = null;
  let paintQueued = false;
  let mobileObserver = null;

  const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const percent = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : 0;
  };
  const isCurrent = (value) => {
    if (!value) return true;
    const ms = Date.parse(String(value));
    return Number.isFinite(ms) && ms > Date.now();
  };
  const normalize = (steam, fan) => {
    const candidates = [];
    const sPrice = numberOrNull(steam?.finalYen);
    const sOff = percent(steam?.discountPercent);
    if (steam?.ok && steam.priceAvailable && steam.currency === 'JPY' && steam.onSale && sPrice !== null && sOff > 0) {
      candidates.push({ price: sPrice, discount: sOff, store: 'Steam' });
    }
    const fPrice = numberOrNull(fan?.price);
    const fOff = percent(fan?.discountPercent);
    if (fan?.ok && fan.inStock !== false && fan.currency === 'JPY' && fan.onSale && fan.affiliateUrl && isCurrent(fan.validUntil)
      && (!fan.priceRequiresCoupon || fan.couponCode) && fPrice !== null && fOff > 0) {
      candidates.push({ price: fPrice, discount: fOff, store: 'Fanatical', coupon: fan.priceRequiresCoupon ? fan.couponCode : '' });
    }
    candidates.sort((a,b) => a.price - b.price || (a.store === 'Steam' ? -1 : 1));
    return candidates[0] || null;
  };

  function isPromoted(root) {
    if (root?.closest?.('.ways-ad-mobile,[data-ways-ad]')) return true;
    if (root?.id !== 'links') return false;
    return Boolean(document.querySelector('#shelf .ways-ad-card.on, #links .ways-ad-store'))
      || /^AD\s*\/\s*PROMOTED$/i.test(document.querySelector('#count')?.textContent?.trim() || '')
      || /^PR\s*\/\s*SPONSORED$/i.test(document.querySelector('#stageLabel')?.textContent?.trim() || '');
  }
  function steamId(root) {
    if (isPromoted(root)) return '';
    const id = String(root?.querySelector('.hw-take-home[data-steam]')?.dataset.steam || '');
    return /^\d{1,12}$/.test(id) ? id : '';
  }

  function addStyle() {
    if (document.getElementById('hwSaleBadgeStyle')) return;
    const style = document.createElement('style');
    style.id = 'hwSaleBadgeStyle';
    style.textContent = '.hw-price-compare{position:relative;z-index:6;display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:44px;padding:7px 10px;border:1px solid #67864c;border-radius:8px;background:#142015;color:#dcffae;font-size:10px;line-height:1.3;font-weight:900;text-decoration:none;pointer-events:auto;touch-action:manipulation}.hw-price-compare:hover{border-color:#eaff35;color:#eaff35}#links a.hw-price-compare{order:99;flex-basis:100%;width:100%}.hw-price-detail{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.hw-price-cta{font-size:11px;font-weight:950;color:#dcffae}.hw-price-amount{font-size:13px;font-weight:950;color:#fff}.hw-price-discount{padding:3px 5px;border-radius:4px;background:#eaff35;color:#10130a;font-size:10px;font-weight:950}.hw-price-store{font-size:9px;color:#b8ccab}.hw-price-compare:hover .hw-price-store{color:#eaff35}@media(max-width:899px){.m-meta a.hw-price-compare{display:flex;flex-direction:column;align-items:flex-start;width:max-content;max-width:100%;margin:10px 0 0;border-radius:12px;background:#111a13dd;color:#dcffae}}';
    document.head.appendChild(style);
  }

  function show(root) {
    if (!root) return;
    const id = steamId(root);
    const deal = id && offers.get(id);
    const existing = root.querySelector('.hw-price-compare');
    if (!deal) { existing?.remove(); return; }
    const href = '/sales?appid=' + encodeURIComponent(id) + '&from=ways';
    const key = deal.store + ':' + deal.price + ':' + deal.discount + ':' + (deal.coupon || '');
    if (existing?.dataset.steam === id && existing.dataset.offerKey === key && existing.getAttribute('href') === href) return;
    const link = existing || document.createElement('a');
    link.className = 'hw-price-compare';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.steam = id;
    link.dataset.offerKey = key;
    link.setAttribute('aria-label', 'ほかのセール情報をチェック。' + deal.store + 'の割引価格 ' + deal.price + '円、' + deal.discount + '%オフ。');
    link.replaceChildren();
    const amount = document.createElement('span');
    amount.className = 'hw-price-amount';
    amount.textContent = '¥' + deal.price.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    const off = document.createElement('span');
    off.className = 'hw-price-discount';
    off.textContent = '-' + deal.discount + '%';
    const store = document.createElement('span');
    store.className = 'hw-price-store';
    store.textContent = deal.store + (deal.coupon ? ' 要クーポン' : '');
    const label=document.createElement('span');label.className='hw-price-cta';label.textContent='ほかのセール情報をチェック ↗';const detail=document.createElement('span');detail.className='hw-price-detail';detail.append(amount,off,store);link.append(label,detail);
    if (!existing) {
      root.appendChild(link);
    }
  }

  function enqueue(id) {
    if (!/^\d{1,12}$/.test(id) || offers.has(id) || queued.has(id) || pending.has(id)) return;
    queued.add(id);
    if (batchTimer === null) batchTimer = setTimeout(flush, 90);
  }

  async function getPrices(endpoint, ids, key) {
    const res = await fetch(endpoint + encodeURIComponent(ids.join(',')), { cache: 'default' });
    if (!res.ok) throw new Error('price_http_' + res.status);
    const data = await res.json();
    if (!data.ok || data.currency && data.currency !== 'JPY') throw new Error('price_currency_or_source');
    return data[key] || {};
  }

  async function flush() {
    if (batchTimer !== null) { clearTimeout(batchTimer); batchTimer = null; }
    if (requestActive || !queued.size) return;
    const ids = [...queued].slice(0, BATCH_SIZE);
    ids.forEach(id => { queued.delete(id); pending.add(id); });
    requestActive = true;
    try {
      const [steamResult, fanResult] = await Promise.allSettled([
        getPrices(STEAM_API, ids, 'prices'),
        getPrices(FAN_API, ids, 'products')
      ]);
      const steamMap = steamResult.status === 'fulfilled' ? steamResult.value : {};
      const fanMap = fanResult.status === 'fulfilled' ? fanResult.value : {};
      ids.forEach(id => offers.set(id, normalize(steamMap[id], fanMap[id])));
    } catch {
      ids.forEach(id => offers.set(id, null));
    } finally {
      ids.forEach(id => pending.delete(id));
      requestActive = false;
      schedulePaint();
      if (queued.size && batchTimer === null) batchTimer = setTimeout(flush, 100);
    }
  }

  function observeMobile(card) {
    if (isPromoted(card)) return;
    if (watchedCards.has(card) || !card.querySelector('.hw-take-home[data-steam]')) return;
    if (!mobileObserver) {
      mobileObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = steamId(entry.target);
          if (id) enqueue(id);
          mobileObserver.unobserve(entry.target);
        }
      }, { root: document.querySelector('#mfeed') || null, rootMargin: '280px 0px', threshold: 0 });
    }
    watchedCards.add(card);
    mobileObserver.observe(card);
  }

  function paint() {
    paintQueued = false;
    addStyle();
    const desktop = document.querySelector('#links');
    if (desktop) {
      const id = steamId(desktop);
      if (id) enqueue(id);
      show(desktop);
    }
    document.querySelectorAll('.m-card').forEach(card => {
      const body = card.querySelector('.m-meta');
      if (body) show(body);
      observeMobile(card);
    });
  }
  function schedulePaint() {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(paint);
  }

  function start() {
    addStyle();
    schedulePaint();
    new MutationObserver(schedulePaint).observe(document.body, { childList: true, subtree: true });
    // Keep the selected WAYS desktop game in sync with selection changes.
    setInterval(schedulePaint, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
