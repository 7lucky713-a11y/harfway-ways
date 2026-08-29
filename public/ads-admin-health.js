(() => {
  const API = '/api/ads-surface-health';
  const ORDER = ['page', 'serve', 'media', 'tracking'];
  const LABELS = { page: 'ページ', serve: '配信API', media: 'R2素材', tracking: '計測経路' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function addStyles() {
    if (document.getElementById('ads-health-style')) return;
    const style = document.createElement('style');
    style.id = 'ads-health-style';
    style.textContent = `
      .ads-health{margin:18px 0;background:#171712;color:#f7f2e8;border:1px solid #171712;border-radius:14px;overflow:hidden}
      .ads-health-head{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:16px 18px;border-bottom:1px solid #ffffff22}
      .ads-health-head h2{margin:0;font:800 13px/1.2 ui-monospace,monospace;letter-spacing:.08em}.ads-health-head p{margin:5px 0 0;color:#bdb6a8;font-size:10px;line-height:1.55}
      .ads-health-run{flex:0 0 auto;min-height:40px;padding:0 15px;border:1px solid #c9ff3d;border-radius:999px;background:#c9ff3d;color:#111;font-weight:900;cursor:pointer}.ads-health-run:disabled{opacity:.55;cursor:wait}
      .ads-health-summary{padding:12px 18px;border-bottom:1px solid #ffffff16;color:#bdb6a8;font-size:11px}.ads-health-summary b{color:#fff}.ads-health-summary.ok b{color:#c9ff3d}.ads-health-summary.bad b{color:#ff9f91}
      .ads-health-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#ffffff16}.ads-health-card{background:#171712;padding:15px;min-width:0}.ads-health-card-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.ads-health-name{font-weight:900;font-size:14px}.ads-health-open{color:#c9ff3d;text-decoration:none;font-size:10px;border-bottom:1px solid #c9ff3d66}
      .ads-health-overall{display:inline-flex;align-items:center;gap:6px;font:850 9px/1 ui-monospace,monospace;letter-spacing:.08em}.ads-health-overall:before{content:'';width:8px;height:8px;border-radius:50%;background:#777}.ads-health-overall.ok{color:#c9ff3d}.ads-health-overall.ok:before{background:#c9ff3d}.ads-health-overall.bad{color:#ff9f91}.ads-health-overall.bad:before{background:#ff6758}
      .ads-health-checks{display:grid;gap:7px}.ads-health-check{display:grid;grid-template-columns:76px 12px 1fr;gap:7px;align-items:start;padding-top:7px;border-top:1px solid #ffffff12}.ads-health-check:first-child{border-top:0;padding-top:0}.ads-health-key{color:#a9a293;font-size:9px;font-weight:800}.ads-health-dot{width:8px;height:8px;margin-top:2px;border-radius:50%;background:#777}.ads-health-check.ok .ads-health-dot{background:#c9ff3d}.ads-health-check.bad .ads-health-dot{background:#ff6758}.ads-health-check.skip .ads-health-dot{background:#d4b35f}.ads-health-detail{color:#d7d1c5;font-size:9px;line-height:1.45;word-break:break-word}.ads-health-ms{color:#777;font-size:8px;margin-top:2px}
      .ads-health-foot{padding:11px 18px;color:#8f887b;font-size:9px;line-height:1.55}.ads-health-foot strong{color:#d4cdbf}
      @media(max-width:1050px){.ads-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.ads-health-head{align-items:flex-start;flex-direction:column}.ads-health-run{width:100%}.ads-health-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function panelHtml() {
    return `<section class="ads-health" id="adsHealth">
      <div class="ads-health-head">
        <div><h2>4掲載面 動作チェック</h2><p>Productionのページ・配信API・R2素材・計測経路を読み取りだけで確認します。</p></div>
        <button class="ads-health-run" id="adsHealthRun" type="button">4面をチェック</button>
      </div>
      <div class="ads-health-summary" id="adsHealthSummary">未チェックです。</div>
      <div class="ads-health-grid" id="adsHealthGrid">
        ${['WAYS','PLAYLIST','切れ端','SALE WATCH'].map((name) => `<div class="ads-health-card"><div class="ads-health-name">${name}</div><div class="ads-health-detail" style="margin-top:10px;color:#777">CHECK WAITING</div></div>`).join('')}
      </div>
      <div class="ads-health-foot">この診断では <strong>IMP / CLICK / STORE VISITを送信しません</strong>。実カウント増加まで確認したい場合だけ、各掲載面を「開く」から手動E2Eしてください。</div>
    </section>`;
  }

  function checkHtml(key, value) {
    const cls = value?.skipped ? 'skip' : value?.ok ? 'ok' : 'bad';
    const ms = Number.isFinite(value?.ms) ? `<div class="ads-health-ms">${value.ms}ms</div>` : '';
    return `<div class="ads-health-check ${cls}"><div class="ads-health-key">${esc(LABELS[key])}</div><span class="ads-health-dot"></span><div><div class="ads-health-detail">${esc(value?.detail || '未確認')}</div>${ms}</div></div>`;
  }

  function render(data) {
    const summary = document.getElementById('adsHealthSummary');
    const grid = document.getElementById('adsHealthGrid');
    if (!summary || !grid) return;
    const healthy = Number(data?.healthy || 0);
    const total = Number(data?.total || 4);
    summary.className = `ads-health-summary ${data?.allHealthy ? 'ok' : 'bad'}`;
    summary.innerHTML = `<b>${healthy} / ${total} 掲載面 OK</b>　${data?.allHealthy ? 'すべての接続が正常です。' : '赤い項目を確認してください。'}　<span style="color:#777">${esc(data?.checkedAt ? new Date(data.checkedAt).toLocaleTimeString('ja-JP') : '')}</span>`;
    grid.innerHTML = (data?.surfaces || []).map((surface) => {
      const checks = surface.checks || {};
      return `<article class="ads-health-card">
        <div class="ads-health-card-top"><div><div class="ads-health-name">${esc(surface.label)}</div><div class="ads-health-overall ${surface.ok ? 'ok' : 'bad'}">${surface.ok ? 'OK' : 'CHECK'}</div></div><a class="ads-health-open" href="${esc(surface.pageUrl)}" target="_blank" rel="noopener">開く ↗</a></div>
        <div class="ads-health-checks">${ORDER.map((key) => checkHtml(key, checks[key])).join('')}</div>
      </article>`;
    }).join('');
  }

  async function run() {
    const btn = document.getElementById('adsHealthRun');
    const summary = document.getElementById('adsHealthSummary');
    if (!btn || !summary) return;
    btn.disabled = true;
    btn.textContent = '確認中…';
    summary.className = 'ads-health-summary';
    summary.textContent = '4掲載面を確認しています。IMP/CLICKは送信しません…';
    try {
      const response = await fetch(`${API}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
      render(data);
    } catch (error) {
      summary.className = 'ads-health-summary bad';
      summary.innerHTML = `<b>診断APIエラー</b>　${esc(error?.message || 'unknown error')}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'もう一度チェック';
    }
  }

  function mount() {
    addStyles();
    const app = document.getElementById('app');
    if (!app || document.getElementById('adsHealth')) return;
    const notice = app.querySelector('.notice');
    if (notice) notice.insertAdjacentHTML('afterend', panelHtml());
    else app.insertAdjacentHTML('afterbegin', panelHtml());
    document.getElementById('adsHealthRun')?.addEventListener('click', run);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
