(() => {
  const TRACK = '/api/track';
  const GAMES = 'https://harfway-playback.vercel.app/api/games';
  const SK = 'ways_analytics_sid_v1';
  const ATTR_KEY = 'ways_analytics_attribution_v1';
  const page = location.pathname.startsWith('/archive') ? 'archive' : 'ways';
  const source = location.hostname === 'harfway-playback.vercel.app' ? 'ways' : 'ways-preview';
  const device = innerWidth < 900 ? 'mobile' : 'desktop';

  let sid = sessionStorage.getItem(SK);
  if (!sid) {
    sid = crypto.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SK, sid);
  }

  const cleanAttr = (value, max = 160) => String(value || '').trim().slice(0, max);
  const params = new URLSearchParams(location.search);
  const incoming = {
    utm_source: cleanAttr(params.get('utm_source')),
    utm_medium: cleanAttr(params.get('utm_medium')),
    utm_campaign: cleanAttr(params.get('utm_campaign')),
    utm_content: cleanAttr(params.get('utm_content')),
    referrer_host: (() => {
      try { return document.referrer ? cleanAttr(new URL(document.referrer).hostname, 120) : ''; }
      catch { return ''; }
    })(),
  };
  const hasCampaign = Boolean(incoming.utm_source || incoming.utm_medium || incoming.utm_campaign || incoming.utm_content);
  let attribution = null;
  try { attribution = JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null'); } catch {}
  if (hasCampaign || !attribution) {
    attribution = {
      utm_source: incoming.utm_source || (incoming.referrer_host ? 'referral' : 'direct'),
      utm_medium: incoming.utm_medium || (incoming.referrer_host ? 'referral' : 'none'),
      utm_campaign: incoming.utm_campaign || '',
      utm_content: incoming.utm_content || '',
      referrer_host: incoming.referrer_host || '',
      landing_path: `${location.pathname}${location.search}`.slice(0, 300),
    };
    try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(attribution)); } catch {}
  }

  const post = (event, gameId = '', extra = {}, beacon = false) => {
    const extraMetadata = extra.metadata && typeof extra.metadata === 'object' ? extra.metadata : {};
    const payload = JSON.stringify({
      event,
      gameId,
      sessionId: sid,
      page,
      device,
      source,
      ...extra,
      metadata: {
        ...attribution,
        ...extraMetadata,
      },
    });
    if (beacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(TRACK, new Blob([payload], { type: 'application/json' }));
        return;
      } catch {}
    }
    fetch(TRACK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  };

  post('page_view');

  let games = [];
  const byTitle = new Map();
  const titleOf = (root) => (root?.querySelector?.('.gtitle,.m-meta h2,.title')?.textContent || '').trim();
  const gameByTitle = (title) => byTitle.get(String(title || '').trim()) || null;
  const currentDesktopGame = () => gameByTitle(document.querySelector('#title')?.textContent || '');

  const makeViewState = () => ({ game: null, marks: new Set(), maxProgress: 0, duration: 0, playSent: false });
  const desktop = makeViewState();
  const mobile = makeViewState();

  const endState = (state, beacon = false) => {
    if (!state.game) return;
    post('view_end', state.game.id, {
      progress: state.maxProgress,
      duration: state.duration,
      metadata: { title: state.game.title || '' },
    }, beacon);
    state.game = null;
    state.marks = new Set();
    state.maxProgress = 0;
    state.duration = 0;
    state.playSent = false;
  };

  const beginState = (state, game) => {
    if (!game?.id) return;
    if (state.game?.id === game.id) return;
    endState(state);
    state.game = game;
    state.marks = new Set();
    state.maxProgress = 0;
    state.duration = 0;
    state.playSent = false;
    post('view', game.id, { metadata: { title: game.title || '' } });
  };

  const recordVideo = (state, video) => {
    if (!state.game || !video?.duration || !Number.isFinite(video.duration)) return;
    const pct = Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100));
    state.maxProgress = Math.max(state.maxProgress, pct);
    state.duration = video.duration;
    const milestones = [[25, 'p25'], [50, 'p50'], [75, 'p75'], [98, 'complete']];
    for (const [threshold, event] of milestones) {
      if (pct >= threshold && !state.marks.has(event)) {
        state.marks.add(event);
        post(event, state.game.id, {
          progress: pct,
          duration: video.duration,
          metadata: { title: state.game.title || '' },
        });
      }
    }
  };

  const setupDesktop = () => {
    const video = document.querySelector('#mainVideo');
    const title = document.querySelector('#title');
    if (!video || !title) return;

    const sync = () => {
      const game = currentDesktopGame();
      if (game) beginState(desktop, game);
    };
    sync();
    new MutationObserver(sync).observe(title, { childList: true, subtree: true, characterData: true });

    video.addEventListener('playing', () => {
      sync();
      if (desktop.game && !desktop.playSent) {
        desktop.playSent = true;
        post('play', desktop.game.id, {
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          metadata: { title: desktop.game.title || '' },
        });
      }
    });
    video.addEventListener('timeupdate', () => recordVideo(desktop, video));

    document.addEventListener('click', (e) => {
      const card = e.target.closest?.('.game');
      if (card) {
        const game = gameByTitle(titleOf(card));
        if (game) post('select', game.id, { metadata: { title: game.title || '', via: 'shelf' } });
      }

      if (e.target.closest?.('#prev,#next,#random')) {
        setTimeout(() => {
          const game = currentDesktopGame();
          if (game) post('select', game.id, { metadata: { title: game.title || '', via: 'nav' } });
        }, 80);
      }

      const tag = e.target.closest?.('#tags [data-tag]');
      if (tag && desktop.game) {
        post('tag_click', desktop.game.id, {
          metadata: { title: desktop.game.title || '', tag: tag.dataset.tag || tag.textContent.trim() },
        });
      }

      const store = e.target.closest?.('#links .store');
      if (store && desktop.game) {
        post('store_click', desktop.game.id, { metadata: { title: desktop.game.title || '' } });
      }

      const article = e.target.closest?.('#links .article');
      if (article && desktop.game) {
        post('article_click', desktop.game.id, { metadata: { title: desktop.game.title || '' } });
      }
    }, true);
  };

  let mobileObserver;
  const observedCards = new WeakSet();
  const bindMobileCard = (card) => {
    if (!card || observedCards.has(card)) return;
    observedCards.add(card);
    const video = card.querySelector('video');
    const game = gameByTitle(titleOf(card));
    if (!video || !game) return;
    card.dataset.analyticsGameId = game.id;

    video.addEventListener('playing', () => {
      if (mobile.game?.id !== game.id) return;
      if (!mobile.playSent) {
        mobile.playSent = true;
        post('play', game.id, {
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          metadata: { title: game.title || '' },
        });
      }
    });
    video.addEventListener('timeupdate', () => {
      if (mobile.game?.id === game.id) recordVideo(mobile, video);
    });
    mobileObserver?.observe(card);
  };

  const setupMobile = () => {
    const feed = document.querySelector('#mfeed');
    if (!feed) return;
    mobileObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.7) {
          const game = games.find(g => g.id === entry.target.dataset.analyticsGameId);
          if (game) beginState(mobile, game);
        }
      }
    }, { root: feed, threshold: [0.2, 0.7] });

    feed.querySelectorAll('.m-card').forEach(bindMobileCard);
    new MutationObserver(() => feed.querySelectorAll('.m-card').forEach(bindMobileCard))
      .observe(feed, { childList: true, subtree: true });

    document.addEventListener('click', (e) => {
      const card = e.target.closest?.('.m-card');
      if (!card) return;
      const game = games.find(g => g.id === card.dataset.analyticsGameId) || gameByTitle(titleOf(card));
      if (!game) return;

      const tag = e.target.closest?.('[data-mtag]');
      if (tag) {
        post('tag_click', game.id, {
          metadata: { title: game.title || '', tag: tag.dataset.mtag || tag.textContent.trim() },
        });
      }
      const store = e.target.closest?.('.m-meta a');
      if (store) post('store_click', game.id, { metadata: { title: game.title || '' } });
    }, true);
  };

  const setupArchive = () => {
    document.addEventListener('click', (e) => {
      const card = e.target.closest?.('.card');
      const game = card ? gameByTitle(titleOf(card)) : null;
      const chip = e.target.closest?.('[data-chip]');
      if (chip) {
        post('tag_click', game?.id || '', {
          metadata: { title: game?.title || '', tag: chip.dataset.chip || chip.textContent.trim(), context: 'archive' },
        });
      }
      if (game && e.target.closest?.('.store')) {
        post('store_click', game.id, { metadata: { title: game.title || '', context: 'archive' } });
      }
      if (game && e.target.closest?.('.article')) {
        post('article_click', game.id, { metadata: { title: game.title || '', context: 'archive' } });
      }
    }, true);
  };

  addEventListener('pagehide', () => {
    endState(desktop, true);
    endState(mobile, true);
  });

  fetch(GAMES, { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      games = (data.entries || []).filter(g => g?.id);
      for (const g of games) byTitle.set(String(g.title || '').trim(), g);
      if (page === 'archive') setupArchive();
      else {
        setupDesktop();
        setupMobile();
      }
    })
    .catch(() => {});
})();
