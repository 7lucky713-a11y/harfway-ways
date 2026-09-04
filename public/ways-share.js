(() => {
  const SHARE_CLASS = 'hw-ways-share';
  const MODAL_ID = 'hwWaysShareModal';
  const SID_KEY = 'ways_analytics_sid_v1';
  const LIVE = '/api/games-live';
  const PROD_ORIGIN = 'https://harfway-playback.vercel.app';
  const IS_PRODUCTION = location.hostname === 'harfway-playback.vercel.app';
  let live = [];
  let byId = new Map();
  let currentGame = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = (value) => String(value || '').trim();
  const previewGameUrl = (game) => `${location.origin}/share/${encodeURIComponent(game.id)}`;
  const previewEmbedUrl = (game) => `${location.origin}/embed/${encodeURIComponent(game.id)}`;
  const publicGameUrl = (game) => `${PROD_ORIGIN}/share/${encodeURIComponent(game.id)}`;
  const publicEmbedUrl = (game) => `${PROD_ORIGIN}/embed/${encodeURIComponent(game.id)}`;
  const gameUrl = (game) => IS_PRODUCTION ? publicGameUrl(game) : previewGameUrl(game);
  const embedUrl = (game) => IS_PRODUCTION ? publicEmbedUrl(game) : previewEmbedUrl(game);
  const iframeCode = (game) => `<iframe src="${embedUrl(game)}" width="560" height="315" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;

  function sid() {
    let value = sessionStorage.getItem(SID_KEY);
    if (!value) {
      value = crypto.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try { sessionStorage.setItem(SID_KEY, value); } catch {}
    }
    return value;
  }

  function track(action, game) {
    if (!game?.id) return;
    const payload = JSON.stringify({
      event: 'content_click', gameId: game.id, sessionId: sid(), page: 'ways',
      device: innerWidth < 900 ? 'mobile' : 'desktop',
      source: IS_PRODUCTION ? 'ways' : 'ways-preview',
      metadata: { action, title: game.title || '' }
    });
    fetch('/api/track', { method: 'POST', headers: {'content-type':'application/json'}, body: payload, keepalive: true }).catch(() => {});
  }

  function desktopGame() {
    try {
      if (typeof filtered !== 'undefined' && typeof selected !== 'undefined' && Array.isArray(filtered)) {
        const game = filtered[Number(selected)];
        if (game?.id) return byId.get(String(game.id)) || game;
      }
    } catch {}
    const title = norm(document.querySelector('#title')?.textContent);
    return live.find(g => norm(g.title) === title) || null;
  }

  function visibleMobileCard() {
    const cards = [...document.querySelectorAll('#mfeed .m-card:not(.ways-ad-mobile)')];
    return cards.find(card => {
      const r = card.getBoundingClientRect();
      return r.top <= innerHeight * .5 && r.bottom >= innerHeight * .5;
    }) || cards[0] || null;
  }

  function mobileGame(card = visibleMobileCard()) {
    if (!card) return null;
    try {
      const i = Number(card.dataset.i);
      const list = (typeof activeTag !== 'undefined' && activeTag && typeof filtered !== 'undefined') ? filtered : items;
      if (Array.isArray(list) && list[i]?.id) return byId.get(String(list[i].id)) || list[i];
    } catch {}
    const title = norm(card.querySelector('h2')?.textContent);
    return live.find(g => norm(g.title) === title) || null;
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy_failed')); }
      catch (error) { reject(error); }
      area.remove();
    });
  }

  function toast(message) {
    let node = document.querySelector('#hwWaysShareToast');
    if (!node) {
      node = document.createElement('div'); node.id = 'hwWaysShareToast'; node.className = 'hw-share-toast'; document.body.appendChild(node);
    }
    node.textContent = message; node.classList.add('on'); clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('on'), 1800);
  }

  function style() {
    if (document.querySelector('#hwWaysShareStyle')) return;
    const node = document.createElement('style'); node.id = 'hwWaysShareStyle';
    node.textContent = `
.${SHARE_CLASS}{position:relative;z-index:7;pointer-events:auto;touch-action:manipulation;border:1px solid #454951;background:transparent;color:#e9ebef;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer}.` + SHARE_CLASS + `:hover{border-color:var(--accent,#efff35);color:var(--accent,#efff35)}
.hw-share-modal{position:fixed;z-index:120;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:#000b;backdrop-filter:blur(10px)}.hw-share-modal.on{display:flex}.hw-share-panel{width:min(560px,100%);border:1px solid #34373d;background:#101113;color:#f5f5ef;box-shadow:0 30px 90px #000c}.hw-share-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px 18px 14px;border-bottom:1px solid #292c31}.hw-share-kicker{font-size:9px;letter-spacing:.16em;color:var(--accent,#efff35);font-weight:950}.hw-share-title{font-size:22px;line-height:1.05;font-weight:950;margin-top:7px}.hw-share-close{width:34px;height:34px;border:1px solid #3c4047;border-radius:50%;background:transparent;color:#fff;cursor:pointer}.hw-share-body{padding:16px 18px 18px}.hw-share-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hw-share-action{border:1px solid #393d44;background:#17191c;color:#fff;padding:12px 11px;text-align:left;cursor:pointer;font-size:11px;font-weight:900}.hw-share-action.primary{background:var(--accent,#efff35);border-color:var(--accent,#efff35);color:#111}.hw-share-action:hover{border-color:#747982}.hw-share-action[hidden]{display:none}.hw-share-action:disabled{opacity:.35;cursor:not-allowed}.hw-share-code{margin-top:12px;border-top:1px solid #292c31;padding-top:12px}.hw-share-code label{display:block;font-size:8px;letter-spacing:.13em;color:#858a93;font-weight:900;margin-bottom:6px}.hw-share-code input{width:100%;border:1px solid #30343a;background:#090a0b;color:#b9bdc5;padding:10px;font:10px ui-monospace,SFMono-Regular,monospace}.hw-share-note{margin-top:10px;color:#737881;font-size:9px;line-height:1.55}.hw-share-note.preview{color:#c7cf67}.hw-share-toast{position:fixed;z-index:140;left:50%;bottom:24px;transform:translate(-50%,14px);border:1px solid var(--accent,#efff35);background:#0c0d0fee;color:#fff;padding:10px 13px;font-size:10px;font-weight:900;opacity:0;pointer-events:none;transition:.18s}.hw-share-toast.on{opacity:1;transform:translate(-50%,0)}
@media(max-width:899px){.m-meta .${SHARE_CLASS}{display:inline-block;margin:10px 0 0 6px;border-radius:999px;padding:8px 11px;background:#050505cc}.hw-share-modal{align-items:flex-end;padding:0}.hw-share-panel{width:100%;border-width:1px 0 0;border-radius:18px 18px 0 0;padding-bottom:max(10px,env(safe-area-inset-bottom))}.hw-share-actions{grid-template-columns:1fr 1fr}.hw-share-title{font-size:20px}}
`;
    document.head.appendChild(node);
  }

  function ensureModal() {
    let modal = document.querySelector(`#${MODAL_ID}`);
    if (modal) return modal;
    modal = document.createElement('div'); modal.id = MODAL_ID; modal.className = 'hw-share-modal';
    modal.innerHTML = `<section class="hw-share-panel" role="dialog" aria-modal="true" aria-label="WAYSを共有"><div class="hw-share-head"><div><div class="hw-share-kicker">SHARE / WAYS</div><div class="hw-share-title" data-share-title>WAYS</div></div><button class="hw-share-close" type="button" aria-label="閉じる">×</button></div><div class="hw-share-body"><div class="hw-share-actions"><button class="hw-share-action primary" type="button" data-share-action="copy">リンクをコピー</button><button class="hw-share-action" type="button" data-share-action="open">共有ページを見る</button><button class="hw-share-action" type="button" data-share-action="native">端末で共有</button><button class="hw-share-action" type="button" data-share-action="x">Xで共有</button><button class="hw-share-action" type="button" data-share-action="embed">埋め込みをコピー</button></div><div class="hw-share-code"><label>SHARE URL</label><input readonly data-share-url></div><div class="hw-share-note" data-share-note></div></div></section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.hw-share-close')) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('on')) close(); });
    modal.querySelectorAll('[data-share-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.shareAction)));
    return modal;
  }

  function open(game) {
    if (!game?.id) return;
    currentGame = game;
    const modal = ensureModal();
    modal.querySelector('[data-share-title]').textContent = game.title || 'WAYS';
    modal.querySelector('[data-share-url]').value = gameUrl(game);
    const native = modal.querySelector('[data-share-action="native"]');
    const x = modal.querySelector('[data-share-action="x"]');
    const note = modal.querySelector('[data-share-note]');
    native.hidden = !IS_PRODUCTION || !navigator.share;
    x.hidden = !IS_PRODUCTION;
    note.classList.toggle('preview', !IS_PRODUCTION);
    note.textContent = IS_PRODUCTION
      ? 'Xでは安定した大型画像カードを優先し、外部サイト向けには別途iframe埋め込みを利用します。対応サービスではOG Videoも参照できます。'
      : 'PreviewはVercel認証で保護されているため、X・Discordなど外部サービスはこのURLを取得できません。ここでは「共有ページを見る」と「埋め込み」を確認してください。X共有は本番公開後に有効になります。';
    modal.classList.add('on'); document.body.style.overflow = 'hidden'; track('share_open', game);
  }

  function close() {
    document.querySelector(`#${MODAL_ID}`)?.classList.remove('on');
    document.body.style.overflow = '';
  }

  async function action(kind) {
    const game = currentGame; if (!game?.id) return;
    const url = gameUrl(game); const text = `WAYSで「${game.title}」を見る`;
    try {
      if (kind === 'copy') { await copyText(url); toast(IS_PRODUCTION ? '共有リンクをコピーしました' : 'Previewリンクをコピーしました'); }
      else if (kind === 'open') { window.open(url, '_blank', 'noopener,noreferrer'); }
      else if (kind === 'embed') { await copyText(iframeCode(game)); toast(IS_PRODUCTION ? '埋め込みコードをコピーしました' : 'Preview用の埋め込みコードをコピーしました'); }
      else if (kind === 'native' && IS_PRODUCTION && navigator.share) { await navigator.share({ title: `${game.title} | WAYS`, text, url: publicGameUrl(game) }); }
      else if (kind === 'x' && IS_PRODUCTION) { window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(publicGameUrl(game))}`, '_blank', 'noopener,noreferrer'); }
      else if (!IS_PRODUCTION && ['native','x'].includes(kind)) { toast('SNS共有は本番公開後に確認できます'); return; }
      track(`share_${kind}`, game);
    } catch (error) {
      if (error?.name !== 'AbortError') toast('共有できませんでした');
    }
  }

  function button(game) {
    const b = document.createElement('button'); b.type = 'button'; b.className = SHARE_CLASS; b.textContent = innerWidth < 900 ? 'SHARE' : '共有';
    b.dataset.gameId = game.id; b.setAttribute('aria-label', `${game.title || 'この作品'}を共有`);
    b.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); open(byId.get(b.dataset.gameId) || game); });
    return b;
  }

  function decorateDesktop() {
    const box = document.querySelector('#links'); if (!box) return;
    const game = desktopGame(); const old = box.querySelector(`.${SHARE_CLASS}`);
    if (!game?.id) { old?.remove(); return; }
    if (old?.dataset.gameId === game.id) return;
    old?.remove();
    const b = button(game); const take = box.querySelector('.hw-take-home'); const article = box.querySelector('.article'); const store = box.querySelector('.store');
    if (take) take.insertAdjacentElement('afterend', b); else if (article) article.insertAdjacentElement('afterend', b); else if (store) store.insertAdjacentElement('afterend', b); else box.appendChild(b);
  }

  function decorateMobile() {
    document.querySelectorAll('#mfeed .m-card:not(.ways-ad-mobile)').forEach(card => {
      const box = card.querySelector('.m-meta'); if (!box) return;
      const game = mobileGame(card); const old = box.querySelector(`.${SHARE_CLASS}`);
      if (!game?.id) { old?.remove(); return; }
      if (old?.dataset.gameId === game.id) return;
      old?.remove();
      const b = button(game); const take = box.querySelector('.hw-take-home'); const store = box.querySelector('a[href]');
      if (take) take.insertAdjacentElement('afterend', b); else if (store) store.insertAdjacentElement('afterend', b); else box.appendChild(b);
    });
  }

  const decorate = () => { decorateDesktop(); decorateMobile(); };

  async function load() {
    try {
      const data = await fetch(LIVE, { cache: 'no-store' }).then(r => r.json());
      live = Array.isArray(data?.entries) ? data.entries : [];
      byId = new Map(live.map(game => [String(game.id || ''), game]));
    } catch { live = []; byId = new Map(); }
    decorate();
  }

  function boot() {
    style(); ensureModal(); load(); decorate();
    let queued = false;
    const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(schedule, 1000);
  }

  boot();
})();
