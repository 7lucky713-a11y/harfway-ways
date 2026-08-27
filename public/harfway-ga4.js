(() => {
  const script = document.currentScript;
  const src = script?.src || '';
  let hubOrigin = 'https://harfway-playback.vercel.app';
  try { if (src) hubOrigin = new URL(src).origin; } catch {}

  const service = String(script?.dataset?.service || window.HARFWAY_SERVICE || 'unknown').trim().toLowerCase();
  const pageType = String(script?.dataset?.page || window.HARFWAY_PAGE || '').trim().toLowerCase();
  const debug = script?.dataset?.debug === '1';
  const queue = [];
  let ready = false;
  let measurementId = '';

  const normalizeEvent = (name) => String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  const enrich = (params = {}) => ({
    hw_service: service,
    hw_page_type: pageType || undefined,
    hw_game_id: params.gameId || params.game_id || undefined,
    hw_content_id: params.contentId || params.content_id || undefined,
    hw_target: params.target || undefined,
    ...params,
    gameId: undefined,
    contentId: undefined
  });

  function dispatch(name, params = {}) {
    const event = normalizeEvent(name);
    if (!event) return;
    const payload = enrich(params);
    if (!ready || typeof window.gtag !== 'function') {
      queue.push([event, payload]);
      return;
    }
    window.gtag('event', event, payload);
    if (debug) console.info('[HARF-WAY GA4]', event, payload);
  }

  window.HWAnalytics = window.HWAnalytics || {};
  window.HWAnalytics.track = dispatch;
  window.HWAnalytics.service = service;
  window.HWAnalytics.ready = () => ready;
  window.HWAnalytics.measurementId = () => measurementId;

  function bindDeclarativeEvents() {
    document.addEventListener('click', (event) => {
      const el = event.target.closest?.('[data-hw-event]');
      if (!el) return;
      dispatch(el.dataset.hwEvent, {
        gameId: el.dataset.gameId || el.closest?.('[data-game-id]')?.dataset.gameId || '',
        contentId: el.dataset.contentId || '',
        target: el.dataset.hwTarget || '',
        link_url: el.href || ''
      });
    }, true);
  }

  async function boot() {
    bindDeclarativeEvents();
    try {
      const r = await fetch(`${hubOrigin}/api/analytics-config`, { cache: 'no-store', mode: 'cors' });
      const cfg = await r.json();
      if (!r.ok || !cfg?.enabled || !/^G-[A-Z0-9]+$/i.test(cfg.measurementId || '')) {
        if (debug) console.info('[HARF-WAY GA4] disabled');
        return;
      }
      measurementId = cfg.measurementId;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', measurementId, {
        send_page_view: true,
        page_title: document.title,
        page_location: location.href,
        hw_service: service,
        hw_page_type: pageType || undefined
      });

      const tag = document.createElement('script');
      tag.async = true;
      tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(tag);

      ready = true;
      while (queue.length) {
        const [event, params] = queue.shift();
        window.gtag('event', event, params);
      }
      window.dispatchEvent(new CustomEvent('harfway-ga4-ready', { detail: { measurementId, service } }));
    } catch (error) {
      if (debug) console.warn('[HARF-WAY GA4] boot failed', error);
    }
  }

  boot();
})();
