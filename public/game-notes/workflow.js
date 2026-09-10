(() => {
  const CHANNELS = [
    { id: 'ways', label: 'WAYS' },
    { id: 'x', label: 'X' },
    { id: 'scraps', label: '切れ端' }
  ];
  const MODE_LABELS = { play: 'PLAY', edit: 'EDIT', publish: 'PUBLISH', archive: 'ARCHIVE' };
  const flow = { games: [], mode: 'play', initialized: false, busy: new Set() };
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const authHeaders = (extra = {}) => {
    const key = sessionStorage.getItem('harfway_game_notes_key') || '';
    return { ...extra, ...(key ? { 'x-admin-key': key } : {}) };
  };

  async function api(options = {}) {
    const headers = authHeaders(options.body ? { 'content-type': 'application/json' } : {});
    const res = await fetch('/api/game-notes-workflow', { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
    let data = {};
    if ((res.headers.get('content-type') || '').includes('application/json')) data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `http_${res.status}`), { status: res.status, data });
    return data;
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .flow-view{padding:35px 36px 70px}.flow-head{display:flex;justify-content:space-between;gap:22px;align-items:flex-end;margin-bottom:18px}.flow-head small{font:900 9px ui-monospace,monospace;color:var(--accent);letter-spacing:.12em}.flow-head h1{font-size:42px;line-height:1;margin:7px 0 0;letter-spacing:-.045em}.flow-head p{color:var(--muted);font-size:12px;margin:9px 0 0}.flow-rule{font:800 10px ui-monospace,monospace;color:#7f8a81;text-align:right;line-height:1.6}
      .flow-recommend{display:flex;justify-content:space-between;align-items:center;gap:18px;border:1px solid #4e624f;background:linear-gradient(135deg,#1d271f,#171d19);border-radius:13px;padding:14px 16px;margin-bottom:12px}.flow-recommend b{display:block;font-size:14px}.flow-recommend span{display:block;color:var(--muted);font-size:10px;margin-top:4px}.flow-recommend strong{white-space:nowrap;color:var(--accent2);font:900 11px ui-monospace,monospace;letter-spacing:.08em}
      .flow-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:18px}.flow-tab{border:1px solid var(--line);background:var(--panel);color:#89958b;border-radius:10px;padding:12px;cursor:pointer;text-align:left}.flow-tab b{display:block;font:900 11px ui-monospace,monospace;letter-spacing:.08em}.flow-tab span{display:block;font-size:22px;font-weight:900;color:#d9e1da;margin-top:5px}.flow-tab.on{background:#273229;border-color:#5c735f;color:var(--accent2)}
      .flow-mode-note{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:0 2px 13px;margin-bottom:2px}.flow-mode-note b{font-size:13px}.flow-mode-note span{font-size:10px;color:var(--muted)}
      .flow-list{display:grid}.flow-card{display:grid;grid-template-columns:minmax(170px,1fr) minmax(180px,.8fr) auto;gap:18px;align-items:center;border-bottom:1px solid var(--line);padding:17px 3px}.flow-card h3{font-size:15px;margin:0 0 5px}.flow-meta{display:flex;gap:12px;flex-wrap:wrap;color:#78847a;font:750 9px ui-monospace,monospace}.flow-state{display:inline-flex;border:1px solid #536357;border-radius:999px;padding:5px 8px;color:var(--accent2);font:900 9px ui-monospace,monospace;letter-spacing:.08em}.flow-copy{font-size:10px;color:var(--muted);line-height:1.6}.flow-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.flow-actions button{white-space:nowrap}.flow-primary{border:0;background:var(--accent);color:#111610;border-radius:8px;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer}.flow-secondary{border:1px solid var(--line);background:var(--panel);color:#b8c2b9;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:850;cursor:pointer}.flow-primary:disabled,.flow-secondary:disabled{opacity:.35;cursor:not-allowed}
      .flow-channels{display:flex;gap:6px;flex-wrap:wrap}.flow-channel{border:1px solid var(--line);background:#151a17;color:#748077;border-radius:999px;padding:7px 9px;font:850 9px ui-monospace,monospace;cursor:pointer}.flow-channel.planned{border-color:#78885a;color:#d7df91;background:#242919}.flow-channel.done{border-color:#55745d;color:#bce2c3;background:#1a2a1f}.flow-empty{border:1px dashed var(--line2);border-radius:12px;padding:34px;text-align:center;color:var(--muted);font-size:12px;margin-top:16px}.flow-footnote{margin-top:18px;color:#667269;font-size:9px;line-height:1.7}.flow-nav-highlight{border:1px solid #425044!important;background:#1c241e!important;color:#d7dfd8!important}
      @media(max-width:850px){.flow-view{padding:24px 14px 50px}.flow-head{align-items:flex-start;flex-direction:column}.flow-rule{text-align:left}.flow-card{grid-template-columns:1fr}.flow-actions{justify-content:flex-start}.flow-tabs{grid-template-columns:1fr 1fr}}
      @media(max-width:500px){.flow-tabs{grid-template-columns:1fr 1fr}.flow-recommend{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    if ($('#view-flow')) return;
    injectStyle();
    const nav = $('#nav');
    const navButton = document.createElement('button');
    navButton.className = 'nav flow-nav-highlight';
    navButton.id = 'flow-nav';
    navButton.innerHTML = 'FLOW <em id="count-flow">0</em>';
    nav.prepend(navButton);

    const section = document.createElement('section');
    section.className = 'view flow-view';
    section.id = 'view-flow';
    section.innerHTML = `
      <div class="flow-head"><div><small>ONE MODE AT A TIME</small><h1>WORKFLOW</h1><p>遊ぶ、編集する、登録するを混ぜない。ゲームごとの現在地だけを持つ。</p></div><div class="flow-rule">PLAY = 録画 + プレイメモ<br>EDIT = 動画編集<br>PUBLISH = 各媒体へ登録</div></div>
      <div class="flow-recommend" id="flow-recommend"></div>
      <div class="flow-tabs" id="flow-tabs"></div>
      <div class="flow-mode-note" id="flow-mode-note"></div>
      <div class="flow-list" id="flow-list"></div>
      <div class="flow-footnote">ARCHIVEは「捨てる」ではなく、この制作サイクルを閉じるだけです。ゲームメモや素材はPRIVATE GAME NOTEBOOKに残ります。</div>`;
    $('.main').appendChild(section);

    navButton.addEventListener('click', () => openFlow(true));
    $('#flow-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-flow-mode]');
      if (!b) return;
      flow.mode = b.dataset.flowMode;
      render();
    });
    $('#flow-list').addEventListener('click', handleFlowClick);
  }

  function counts() {
    return ['play','edit','publish','archive'].reduce((acc, key) => {
      acc[key] = flow.games.filter(g => g.workflowStatus === key).length;
      return acc;
    }, {});
  }
  function recommendation(c) {
    if (c.edit >= 4) return { mode: 'edit', title: '編集待ちが溜まっています', copy: '新しく遊ぶ前に、EDITをまとめて捌くのがおすすめです。', badge: 'EDIT MODE 推奨' };
    if (c.publish >= 4) return { mode: 'publish', title: '登録待ちが溜まっています', copy: '編集済み素材を各媒体へまとめて登録すると、未完了感を減らせます。', badge: 'PUBLISH MODE 推奨' };
    return { mode: 'play', title: 'PLAYしてOK', copy: '編集待ちは許容量内です。録画とプレイメモまでで閉じて大丈夫です。', badge: 'PLAY MODE' };
  }
  function modeNote(mode) {
    if (mode === 'play') return ['PLAY MODE', 'ゲームを遊ぶ → 録画 → プレイメモ。ここで一度終了。'];
    if (mode === 'edit') return ['EDIT MODE', '編集待ちだけをまとめて処理。媒体登録にはまだ移らない。'];
    if (mode === 'publish') return ['PUBLISH MODE', '完成した素材をWAYS / X / 切れ端へ登録。使わない媒体は選ばなくてOK。'];
    return ['ARCHIVE', 'この制作サイクルを閉じたゲーム。メモと素材は残っています。'];
  }
  function channelState(game, id) {
    if ((game.publishedTargets || []).includes(id)) return 'done';
    if ((game.publishTargets || []).includes(id)) return 'planned';
    return 'off';
  }
  function channelsHtml(game) {
    return `<div class="flow-channels">${CHANNELS.map(ch => {
      const state = channelState(game, ch.id);
      const suffix = state === 'done' ? ' ✓' : state === 'planned' ? ' 予定' : ' ＋';
      return `<button class="flow-channel ${state}" data-channel="${ch.id}" data-game-id="${esc(game.id)}">${ch.label}${suffix}</button>`;
    }).join('')}</div>`;
  }
  function cardHtml(game) {
    const busy = flow.busy.has(game.id);
    const meta = `<div class="flow-meta"><span>${game.noteCount} NOTES</span><span>${game.mediaCount} MEDIA</span><span class="flow-state">${MODE_LABELS[game.workflowStatus]}</span></div>`;
    if (game.workflowStatus === 'play') return `<article class="flow-card"><div><h3>${esc(game.name)}</h3>${meta}</div><div class="flow-copy">録画とプレイメモを残したらEDITへ。投稿や動画編集はここではやらない。</div><div class="flow-actions"><button class="flow-secondary" data-open-note="${esc(game.id)}">プレイメモを追加</button><button class="flow-primary" data-move="edit" data-game-id="${esc(game.id)}" ${busy?'disabled':''}>記録完了 → EDIT</button></div></article>`;
    if (game.workflowStatus === 'edit') return `<article class="flow-card"><div><h3>${esc(game.name)}</h3>${meta}</div><div class="flow-copy">録画素材を編集する時間。メモを見返してから必要な部分だけ切り出す。</div><div class="flow-actions"><button class="flow-secondary" data-open-game="${esc(game.id)}">メモを見る</button><button class="flow-secondary" data-move="archive" data-game-id="${esc(game.id)}" ${busy?'disabled':''}>今回は出さない</button><button class="flow-primary" data-move="publish" data-game-id="${esc(game.id)}" ${busy?'disabled':''}>編集完了 → PUBLISH</button></div></article>`;
    if (game.workflowStatus === 'publish') {
      const targets = game.publishTargets || [], done = game.publishedTargets || [];
      const allDone = targets.length === 0 || targets.every(x => done.includes(x));
      return `<article class="flow-card"><div><h3>${esc(game.name)}</h3>${meta}</div><div>${channelsHtml(game)}<div class="flow-copy" style="margin-top:7px">クリックで「使わない → 予定 → 完了」を切り替え。</div></div><div class="flow-actions"><button class="flow-secondary" data-move="edit" data-game-id="${esc(game.id)}" ${busy?'disabled':''}>EDITへ戻す</button><button class="flow-primary" data-move="archive" data-game-id="${esc(game.id)}" ${!allDone||busy?'disabled':''}>${targets.length?'登録完了 → ARCHIVE':'公開せずARCHIVE'}</button></div></article>`;
    }
    const used = (game.publishedTargets || []).map(id => CHANNELS.find(c => c.id === id)?.label).filter(Boolean).join(' / ') || '公開なし';
    return `<article class="flow-card"><div><h3>${esc(game.name)}</h3>${meta}</div><div class="flow-copy">${esc(used)} · 制作サイクル完了</div><div class="flow-actions"><button class="flow-secondary" data-open-game="${esc(game.id)}">メモを見る</button><button class="flow-primary" data-move="play" data-game-id="${esc(game.id)}" ${busy?'disabled':''}>もう一度PLAYへ</button></div></article>`;
  }

  function render() {
    if (!$('#view-flow')) return;
    const c = counts();
    const rec = recommendation(c);
    $('#count-flow').textContent = c.edit + c.publish;
    $('#flow-recommend').innerHTML = `<div><b>${esc(rec.title)}</b><span>${esc(rec.copy)}</span></div><strong>${esc(rec.badge)}</strong>`;
    $('#flow-tabs').innerHTML = ['play','edit','publish','archive'].map(mode => `<button class="flow-tab ${flow.mode===mode?'on':''}" data-flow-mode="${mode}"><b>${MODE_LABELS[mode]}</b><span>${c[mode]}</span></button>`).join('');
    const [title, copy] = modeNote(flow.mode);
    $('#flow-mode-note').innerHTML = `<b>${title}</b><span>${copy}</span>`;
    const games = flow.games.filter(g => g.workflowStatus === flow.mode);
    $('#flow-list').innerHTML = games.length ? games.map(cardHtml).join('') : `<div class="flow-empty">${MODE_LABELS[flow.mode]} に待っているゲームはありません。</div>`;
  }

  function openFlow(refresh = false) {
    $$('.view').forEach(v => v.classList.remove('show'));
    $$('.nav').forEach(v => v.classList.remove('on'));
    $('#view-flow').classList.add('show');
    $('#flow-nav').classList.add('on');
    if (refresh) refreshFlow(false).catch(() => {});
  }
  function openGame(gameId, addNote = false) {
    const gameNav = $('[data-view="game"]');
    if (gameNav) gameNav.click();
    setTimeout(() => {
      const choice = $$('[data-game]').find(x => x.dataset.game === gameId);
      if (choice) choice.click();
      if (addNote) setTimeout(() => $('#game-add')?.click(), 0);
    }, 0);
  }
  async function patchGame(game, patch) {
    if (!game || flow.busy.has(game.id)) return;
    flow.busy.add(game.id); render();
    const payload = {
      gameId: game.id,
      workflowStatus: patch.workflowStatus || game.workflowStatus,
      publishTargets: patch.publishTargets ?? game.publishTargets ?? [],
      publishedTargets: patch.publishedTargets ?? game.publishedTargets ?? []
    };
    try {
      await api({ method: 'PATCH', body: JSON.stringify(payload) });
      await refreshFlow(false);
    } catch (e) {
      const toast = $('#toast');
      if (toast) { toast.textContent = `FLOW更新失敗: ${e.message}`; toast.style.background = '#d58d8d'; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 2200); }
    } finally {
      flow.busy.delete(game.id); render();
    }
  }
  async function handleFlowClick(e) {
    const openNote = e.target.closest('[data-open-note]');
    if (openNote) return openGame(openNote.dataset.openNote, true);
    const openGameButton = e.target.closest('[data-open-game]');
    if (openGameButton) return openGame(openGameButton.dataset.openGame, false);
    const move = e.target.closest('[data-move]');
    if (move) {
      const game = flow.games.find(g => g.id === move.dataset.gameId);
      return patchGame(game, { workflowStatus: move.dataset.move });
    }
    const channel = e.target.closest('[data-channel]');
    if (channel) {
      const game = flow.games.find(g => g.id === channel.dataset.gameId);
      if (!game) return;
      const id = channel.dataset.channel;
      const targets = [...(game.publishTargets || [])];
      const completed = [...(game.publishedTargets || [])];
      const ti = targets.indexOf(id), ci = completed.indexOf(id);
      if (ti < 0) targets.push(id);
      else if (ci < 0) completed.push(id);
      else { targets.splice(ti, 1); completed.splice(ci, 1); }
      return patchGame(game, { workflowStatus: 'publish', publishTargets: targets, publishedTargets: completed });
    }
  }

  async function refreshFlow(selectRecommendation = false) {
    const data = await api();
    flow.games = data.games || [];
    if (!flow.initialized || selectRecommendation) {
      flow.mode = recommendation(counts()).mode;
      flow.initialized = true;
    }
    render();
  }

  function init() {
    ensureUi();
    refreshFlow(true).then(() => openFlow(false)).catch(() => {});
    $('#unlock-form')?.addEventListener('submit', () => setTimeout(() => refreshFlow(true).then(() => openFlow(false)).catch(() => {}), 700));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
