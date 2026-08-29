(() => {
  'use strict';

  const PANEL_ID = 'ads-capacity-panel';
  const fmt = (value, digits = 0) => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(Number(value))
    : '—';
  const pct = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  let capacity = null;

  function addStyles() {
    if (document.getElementById('ads-capacity-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'ads-capacity-panel-style';
    style.textContent = `
      #${PANEL_ID}{grid-column:1/-1;border:1px solid #2a3322;background:radial-gradient(circle at 85% 0,rgba(223,255,73,.055),transparent 30%),#10150e;border-radius:18px;padding:20px}
      #${PANEL_ID} *{box-sizing:border-box}.cap-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.cap-head h2{margin:5px 0 7px;font-size:26px;letter-spacing:-.03em}.cap-head p{margin:0;color:#99a591;font-size:13px;line-height:1.7;max-width:760px}.cap-pill{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #46542e;border-radius:999px;color:#dfff49;background:#182010;font:900 9px/1 ui-monospace,monospace;white-space:nowrap}.cap-pill:before{content:'';width:7px;height:7px;border-radius:50%;background:#dfff49}.cap-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:18px}.cap-metric{padding:14px;border:1px solid #283022;border-radius:13px;background:#0c100b}.cap-metric span{display:block;color:#7f8b78;font-size:9px;letter-spacing:.08em}.cap-metric b{display:block;margin-top:6px;font-size:23px;letter-spacing:-.03em}.cap-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.95fr);gap:14px;margin-top:14px}.cap-box{border:1px solid #283022;border-radius:14px;background:#0c100b;padding:16px}.cap-box h3{margin:0 0 12px;font-size:15px}.cap-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cap-field{display:grid;gap:5px}.cap-field label{color:#87917f;font-size:10px}.cap-field input{width:100%;height:42px;padding:0 10px;border:1px solid #343e2c;border-radius:9px;background:#141a11;color:#f4f6ef;font:800 14px/1 system-ui;outline:none}.cap-field input:focus{border-color:#8ca842}.cap-result{margin-top:12px;padding:14px;border:1px solid #45532e;border-radius:12px;background:#17200f}.cap-result small{display:block;color:#9dac82;font-size:9px;letter-spacing:.08em}.cap-result strong{display:block;margin-top:5px;color:#e8ff78;font-size:25px;letter-spacing:-.04em}.cap-result p{margin:6px 0 0;color:#a4ad9c;font-size:11px;line-height:1.6}.cap-state{margin-top:10px;padding:10px 12px;border-radius:10px;background:#131711;color:#929b8b;font-size:11px;line-height:1.6}.cap-state[data-state='ok']{background:#122016;color:#9ee3ae}.cap-state[data-state='watch']{background:#231d0e;color:#e5c86f}.cap-state[data-state='late']{background:#261313;color:#ef9a9a}.cap-table-wrap{overflow:auto}.cap-table{width:100%;min-width:720px;border-collapse:collapse}.cap-table th,.cap-table td{text-align:left;padding:9px 7px;border-bottom:1px solid #232a1f;font-size:11px}.cap-table th{color:#718069;font-weight:600}.cap-table td{color:#c8cec2}.cap-table b{color:#f1f4eb}.cap-rule{display:inline-flex;padding:4px 6px;border:1px solid #39432f;border-radius:999px;color:#b8c7a2;font:800 8px/1 ui-monospace,monospace}.cap-note{margin-top:12px;color:#7f8b78;font-size:10px;line-height:1.7}.cap-error{padding:18px;border:1px solid #5b3434;border-radius:12px;background:#1e1111;color:#e1a0a0;font-size:12px;line-height:1.7}
      @media(max-width:900px){.cap-metrics{grid-template-columns:repeat(2,1fr)}.cap-layout{grid-template-columns:1fr}.cap-head{flex-direction:column}.cap-pill{white-space:normal}}
      @media(max-width:520px){.cap-metrics,.cap-form{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function simulatorMarkup() {
    return `
      <div class="cap-box">
        <h3>販売シミュレーター</h3>
        <div class="cap-form">
          <div class="cap-field"><label>新規広告主</label><input id="cap-clients" type="number" min="0" max="100" step="1" value="10"></div>
          <div class="cap-field"><label>1社あたりIMP</label><input id="cap-package" type="number" min="100" max="1000000" step="100" value="5000"></div>
          <div class="cap-field"><label>1日の広告IMP能力</label><input id="cap-daily" type="number" min="0" max="10000000" step="1" value="0"></div>
          <div class="cap-field"><label>販売期間（日）</label><input id="cap-days" type="number" min="1" max="365" step="1" value="30"></div>
        </div>
        <div class="cap-result"><small>全部捌くまで</small><strong id="cap-clear-days">—</strong><p id="cap-clear-copy">実測値を読み込んでいます。</p></div>
        <div class="cap-state" id="cap-sell-state">計算中…</div>
        <div class="cap-note">「1日の広告IMP能力」は直近実測の80%を安全値として自動入力します。まだ広告配信実績が少ない場合は手動で仮説値を入れて試算できます。</div>
      </div>`;
  }

  function renderPlacements(rows) {
    return `
      <div class="cap-box">
        <h3>媒体別の在庫・配信ルール</h3>
        <div class="cap-table-wrap"><table class="cap-table"><thead><tr><th>媒体</th><th>挿入</th><th>24h上限</th><th>直近7日IMP</th><th>安全日次</th><th>残IMP</th><th>稼働案件</th></tr></thead><tbody>
        ${rows.map((p) => `<tr><td><b>${esc(({playback:'WAYS',playlist:'PLAYLIST',scraps:'切れ端',sale:'SALE WATCH'})[p.placement] || p.placement)}</b></td><td><span class="cap-rule">every ${fmt(p.everyNItems)}</span></td><td>${fmt(p.sessionCap)}</td><td>${fmt(p.impressions7d)}</td><td>${fmt(p.safeDaily,1)}</td><td>${fmt(p.remainingImpressions)}</td><td>${fmt(p.activeCampaigns)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="cap-note">公平配信v2は「タグ相性 → 締切に対する遅れ → 消化率の低さ → 同条件なら分散」の順で候補を選び、同一ユーザーへの24時間上限も維持します。</div>
      </div>`;
  }

  function renderCampaignPacing(campaigns) {
    if (!campaigns.length) return '<div class="cap-state" data-state="ok">現在、配信中キャンペーンはありません。新規案件を入れる前の基準値を作るフェーズです。</div>';
    const stateLabel = { ok:'順調', watch:'注意', late:'遅れ', done:'完了' };
    return `<div class="cap-box" style="margin-top:14px"><h3>案件ごとのペーシング</h3><div class="cap-table-wrap"><table class="cap-table"><thead><tr><th>案件</th><th>媒体</th><th>消化</th><th>期待進捗</th><th>残IMP</th><th>判定</th></tr></thead><tbody>${campaigns.map((c)=>`<tr><td><b>${esc(c.title)}</b></td><td>${esc((c.placements||[]).join(' / '))}</td><td>${pct(c.progress)}</td><td>${c.expectedProgress===null?'期限なし':pct(c.expectedProgress)}</td><td>${fmt(c.remaining)}</td><td>${stateLabel[c.pacingState]||c.pacingState}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function recalc() {
    if (!capacity) return;
    const clients = Math.max(0, Number(document.getElementById('cap-clients')?.value || 0));
    const packageImp = Math.max(1, Number(document.getElementById('cap-package')?.value || 5000));
    const daily = Math.max(0, Number(document.getElementById('cap-daily')?.value || 0));
    const days = Math.max(1, Number(document.getElementById('cap-days')?.value || 30));
    const current = Number(capacity.summary?.totalRemaining || 0);
    const added = clients * packageImp;
    const inventory = current + added;
    const clearDays = daily > 0 ? Math.ceil(inventory / daily) : null;
    const safeSellable = daily > 0 ? Math.max(0, Math.floor((daily * days - current) / packageImp)) : 0;
    const totalEl = document.getElementById('cap-clear-days');
    const copy = document.getElementById('cap-clear-copy');
    const state = document.getElementById('cap-sell-state');
    if (totalEl) totalEl.textContent = clearDays === null ? '日次IMPを入力' : `${fmt(clearDays)}日`;
    if (copy) copy.textContent = `${fmt(clients)}社 × ${fmt(packageImp)}IMP = ${fmt(added)}IMP追加。既存在庫込み ${fmt(inventory)}IMP。`;
    if (!state) return;
    if (daily <= 0) {
      state.dataset.state = 'watch';
      state.textContent = '配信実績がまだ足りないため、安全な販売上限は未確定です。日次IMPの仮説を入力して試算してください。';
    } else if (clients <= safeSellable) {
      state.dataset.state = 'ok';
      state.textContent = `${fmt(days)}日枠なら安全係数込みで約 ${fmt(safeSellable)}社まで販売可能。今回の ${fmt(clients)}社は範囲内です。`;
    } else {
      state.dataset.state = 'late';
      state.textContent = `${fmt(days)}日枠の安全販売目安は約 ${fmt(safeSellable)}社。今回の ${fmt(clients)}社だと約 ${fmt(clearDays)}日必要なので、販売量か期間の調整が必要です。`;
    }
  }

  async function load() {
    const root = document.getElementById(PANEL_ID);
    try {
      const response = await fetch('/api/ads-capacity', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      capacity = data;
      const s = data.summary || {};
      root.innerHTML = `
        <div class="cap-head"><div><div class="label">PACING & INVENTORY</div><h2>広告在庫・公平配信</h2><p>複数広告主が同時に走っても、案件ごとの消化率と締切を見ながら偏りを抑えて配信するための管理画面。販売前に「何社まで捌けるか」も試算します。</p></div><span class="cap-pill">FAIR DELIVERY V2 / PREVIEW</span></div>
        <div class="cap-metrics">
          <div class="cap-metric"><span>ACTIVE CAMPAIGNS</span><b>${fmt(s.activeCampaigns)}</b></div>
          <div class="cap-metric"><span>REMAINING IMP</span><b>${fmt(s.totalRemaining)}</b></div>
          <div class="cap-metric"><span>LAST 7D IMP</span><b>${fmt(s.impressions7d)}</b></div>
          <div class="cap-metric"><span>SAFE DAILY IMP</span><b>${fmt(s.safeDaily,1)}</b></div>
          <div class="cap-metric"><span>PACING ALERTS</span><b>${fmt(Number(s.pacingLate||0)+Number(s.pacingWatch||0))}</b></div>
        </div>
        <div class="cap-layout">${simulatorMarkup()}${renderPlacements(data.placements || [])}</div>
        ${renderCampaignPacing(data.campaigns || [])}
      `;
      const dailyInput = document.getElementById('cap-daily');
      if (dailyInput) dailyInput.value = Math.max(0, Math.floor(Number(s.safeDaily || 0)));
      root.querySelectorAll('input').forEach((input) => input.addEventListener('input', recalc));
      recalc();
    } catch (error) {
      root.innerHTML = `<div class="cap-head"><div><div class="label">PACING & INVENTORY</div><h2>広告在庫・公平配信</h2></div></div><div class="cap-error">在庫データを読み込めませんでした。Preview環境の ADS_DATABASE_URL と広告DB接続を確認してください。<br><small>${esc(error.message)}</small></div>`;
    }
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    const grid = document.querySelector('section.grid');
    if (!grid) return;
    const performance = document.getElementById('performance-badge')?.closest('.card.full');
    const root = document.createElement('section');
    root.id = PANEL_ID;
    root.innerHTML = '<div class="cap-head"><div><div class="label">PACING & INVENTORY</div><h2>広告在庫・公平配信</h2><p>読み込み中…</p></div></div>';
    if (performance?.nextSibling) grid.insertBefore(root, performance.nextSibling);
    else grid.appendChild(root);
    load();
  }

  addStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
