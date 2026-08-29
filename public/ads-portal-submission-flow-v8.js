(() => {
  'use strict';

  const FLOW_ID = 'hwads-submission-flow-v8';
  const SUMMARY_ID = 'hwads-submission-summary-v8';
  const STEP_ATTR = 'data-hwads-flow-step-v8';
  let timer = 0;

  const STEPS = [
    ['01', '広告素材', '画像・動画を選ぶ'],
    ['02', '広告内容', 'ゲーム情報とリンク'],
    ['03', '掲載先', '掲載する場所を選ぶ'],
    ['04', '素材確認', '元画像を切らずに確認'],
    ['05', '掲載プレビュー', '実際のトリミングを確認'],
    ['06', '入稿確認', '内容を確認して送信'],
  ];

  const normalize = (value) => String(value || '').replace(/[\u3000\s]+/g, ' ').trim();

  function visible(el) {
    if (!el?.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function root() {
    const file = document.querySelector('input[type="file"]');
    if (!file) return null;
    return file.closest('form') || file.closest('main') || document.querySelector('main') || document.body;
  }

  function ascend(start, test, max = 7) {
    let node = start;
    for (let i = 0; node && node !== document.body && i < max; i += 1) {
      if (test(node)) return node;
      node = node.parentElement;
    }
    return start?.parentElement || null;
  }

  function compactSectionAround(el) {
    if (!el) return null;
    return ascend(el, (node) => {
      const rect = node.getBoundingClientRect();
      const controls = node.querySelectorAll('input,textarea,button,select').length;
      return rect.width >= 260 && controls >= 1 && controls <= 12 && node.children.length >= 1;
    }, 6);
  }

  function commonAncestor(nodes, stop) {
    const clean = nodes.filter(Boolean);
    if (!clean.length) return null;
    let node = clean[0];
    while (node && node !== stop && node !== document.body) {
      if (clean.every((item) => node === item || node.contains(item))) return node;
      node = node.parentElement;
    }
    return null;
  }

  function placementButtons(scope) {
    return [...scope.querySelectorAll('button,[role="button"]')].filter((el) => {
      const text = normalize(el.textContent || el.getAttribute('aria-label') || '');
      return /^(プレイリスト|切れ端|WAYS|SALE\s*WATCH)$/i.test(text);
    });
  }

  function findPreviewHeading(scope) {
    return [...scope.querySelectorAll('h1,h2,h3,h4,p,div,span')]
      .find((el) => normalize(el.textContent) === '掲載されたときの見え方') || null;
  }

  function findSubmit(scope) {
    const candidates = [...scope.querySelectorAll('button,input[type="submit"]')].filter(visible);
    return candidates.find((el) => {
      const text = normalize(el.textContent || el.value || el.getAttribute('aria-label') || '');
      return /(入稿|送信|申請|申し込|登録)/.test(text) && !/プレビュー|確認画面/.test(text);
    }) || null;
  }

  function findSections(scope) {
    const file = scope.querySelector('input[type="file"]');
    const upload = compactSectionAround(file);

    const textControls = [...scope.querySelectorAll('input,textarea')]
      .filter((el) => el.type !== 'file' && !['hidden','checkbox','radio','submit','button'].includes(el.type || '') && !el.closest(`#${FLOW_ID},#${SUMMARY_ID},#hwads-dual-preview-v7`));
    let content = commonAncestor(textControls.slice(0, Math.min(6, textControls.length)), scope);
    if (!content || content === scope || content.contains(upload)) {
      content = textControls.length ? compactSectionAround(textControls[0]) : null;
    }

    const pButtons = placementButtons(scope);
    let placement = commonAncestor(pButtons, scope);
    if (!placement || placement === scope) placement = pButtons.length ? compactSectionAround(pButtons[0]) : null;

    const material = document.getElementById('hwads-dual-preview-v7');
    const previewHeading = findPreviewHeading(scope);
    const preview = previewHeading ? compactSectionAround(previewHeading) : null;
    const submit = findSubmit(scope);
    const confirm = submit ? compactSectionAround(submit) : null;

    return { upload, content, placement, material, preview, submit, confirm };
  }

  function stepHeader(number, title, hint) {
    const node = document.createElement('div');
    node.className = 'hwads-flow-step-head-v8';
    node.innerHTML = `<span class="hwads-flow-step-no-v8">${number}</span><div><strong>${title}</strong><small>${hint}</small></div>`;
    return node;
  }

  function markSection(section, number, title, hint) {
    if (!section || section.id === FLOW_ID || section.id === SUMMARY_ID) return;
    if (section.getAttribute(STEP_ATTR) === number) return;
    section.setAttribute(STEP_ATTR, number);
    const existing = section.querySelector(':scope > .hwads-flow-step-head-v8');
    if (!existing) section.prepend(stepHeader(number, title, hint));
  }

  function mountFlowRail(scope) {
    let rail = document.getElementById(FLOW_ID);
    if (rail) return rail;
    rail = document.createElement('nav');
    rail.id = FLOW_ID;
    rail.setAttribute('aria-label', '入稿の流れ');
    rail.innerHTML = `
      <div class="hwads-flow-kicker-v8">SUBMISSION FLOW</div>
      <div class="hwads-flow-title-v8">6ステップで入稿</div>
      <div class="hwads-flow-rail-v8">
        ${STEPS.map(([no,title]) => `<span><b>${no}</b>${title}</span>`).join('')}
      </div>
    `;
    const h1 = [...scope.querySelectorAll('h1,h2')].find((el) => /HARF[- ]?WAY\s*ADS|入稿/i.test(normalize(el.textContent)));
    const anchor = h1?.parentElement || scope.firstElementChild;
    if (anchor?.parentElement) anchor.insertAdjacentElement('afterend', rail);
    else scope.prepend(rail);
    return rail;
  }

  function labelFor(control) {
    if (!control) return '';
    if (control.labels?.length) return normalize([...control.labels].map((l) => l.textContent).join(' '));
    const id = control.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return normalize(label.textContent);
    }
    return normalize(control.getAttribute('placeholder') || control.getAttribute('name') || '');
  }

  function textField(scope, patterns, type) {
    return [...scope.querySelectorAll('input,textarea')].find((el) => {
      if (type && el.type !== type) return false;
      const hay = `${labelFor(el)} ${el.name || ''} ${el.placeholder || ''}`;
      return patterns.some((re) => re.test(hay));
    }) || null;
  }

  function selectedPlacements(scope) {
    const hits = placementButtons(scope).filter((button) => {
      const aria = button.getAttribute('aria-pressed') || button.getAttribute('aria-checked');
      if (aria === 'true') return true;
      if (/active|selected|checked|on/i.test(String(button.className || ''))) return true;
      const style = getComputedStyle(button);
      const bg = style.backgroundColor || '';
      return !/rgba?\(255, 255, 255|transparent/.test(bg) && style.color !== '';
    }).map((button) => normalize(button.textContent));
    return [...new Set(hits)];
  }

  function summaryValue(value, fallback = '未入力') {
    const text = normalize(value);
    return text || fallback;
  }

  function ensureSummary(scope, sections) {
    if (!sections.submit) return null;
    let box = document.getElementById(SUMMARY_ID);
    if (!box) {
      box = document.createElement('section');
      box.id = SUMMARY_ID;
      box.innerHTML = `
        <div class="hwads-flow-step-head-v8"><span class="hwads-flow-step-no-v8">06</span><div><strong>入稿確認</strong><small>内容を確認して送信</small></div></div>
        <div class="hwads-summary-grid-v8">
          <div><span>素材</span><b data-summary="file">未選択</b></div>
          <div><span>ゲーム</span><b data-summary="title">未入力</b></div>
          <div><span>リンク</span><b data-summary="url">未入力</b></div>
          <div><span>掲載先</span><b data-summary="placements">未選択</b></div>
        </div>
        <p>上の素材確認と掲載プレビューを確認してから入稿してください。</p>
      `;
      sections.submit.parentElement?.insertBefore(box, sections.submit);
    }

    const file = scope.querySelector('input[type="file"]')?.files?.[0];
    const title = textField(scope, [/作品名|ゲーム名|title|game/i]);
    const url = textField(scope, [/URL|リンク|store|steam|website/i], 'url') || textField(scope, [/URL|リンク|store|steam|website/i]);
    const placements = selectedPlacements(scope);

    const set = (key, value) => {
      const target = box.querySelector(`[data-summary="${key}"]`);
      if (target) target.textContent = value;
    };
    set('file', file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB` : '未選択');
    set('title', summaryValue(title?.value));
    set('url', summaryValue(url?.value));
    set('placements', placements.length ? placements.join(' / ') : '未選択');
    return box;
  }

  function mount() {
    const scope = root();
    if (!scope) return false;
    document.body.dataset.hwadsSubmissionFlowV8 = '1';
    mountFlowRail(scope);
    const sections = findSections(scope);

    markSection(sections.upload, '01', '広告素材', '横長のゲーム画像・動画を選択');
    markSection(sections.content, '02', '広告内容', 'ゲーム名・文言・リンクを入力');
    markSection(sections.placement, '03', '掲載先', '掲載するHARF-WAYの場所を選択');
    markSection(sections.material, '04', '素材確認', '元画像を切らずに確認');
    markSection(sections.preview, '05', '掲載プレビュー', 'PC / スマホで実際のトリミングを確認');

    if (sections.confirm && sections.confirm !== sections.upload && sections.confirm !== sections.content && sections.confirm !== sections.placement) {
      sections.confirm.dataset.hwadsConfirmHostV8 = '1';
    }
    ensureSummary(scope, sections);
    return true;
  }

  function schedule(delay = 60) {
    clearTimeout(timer);
    timer = setTimeout(mount, delay);
  }

  const style = document.createElement('style');
  style.id = 'hwads-submission-flow-v8-style';
  style.textContent = `
    body[data-hwads-submission-flow-v8="1"]{background:#0f1115!important;color:#e7e9ee!important}
    body[data-hwads-submission-flow-v8="1"] main{max-width:1040px!important;margin-inline:auto!important}
    body[data-hwads-submission-flow-v8="1"] input:not([type="checkbox"]):not([type="radio"]),
    body[data-hwads-submission-flow-v8="1"] textarea,
    body[data-hwads-submission-flow-v8="1"] select{min-height:48px!important;font-size:15px!important;background:#12151b!important;color:#f3f4f6!important;border-color:#343943!important}
    body[data-hwads-submission-flow-v8="1"] textarea{min-height:112px!important}
    body[data-hwads-submission-flow-v8="1"] label{font-size:13px!important;color:#c6cad3!important}
    body[data-hwads-submission-flow-v8="1"] button{font-size:14px}

    #${FLOW_ID}{margin:22px 0 28px;padding:22px;border:1px solid #303641;border-radius:20px;background:#171a20;color:#f5f6f8;box-shadow:0 18px 60px rgba(0,0,0,.16);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    #${FLOW_ID} .hwads-flow-kicker-v8{font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;color:#8f98a8}
    #${FLOW_ID} .hwads-flow-title-v8{margin-top:8px;font-size:22px;font-weight:850;letter-spacing:-.03em}
    #${FLOW_ID} .hwads-flow-rail-v8{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:17px}
    #${FLOW_ID} .hwads-flow-rail-v8 span{display:grid;gap:5px;min-width:0;padding:11px 10px;border:1px solid #2e343e;border-radius:11px;background:#11141a;color:#bfc5cf;font-size:10px;font-weight:750;line-height:1.3}
    #${FLOW_ID} .hwads-flow-rail-v8 b{font:850 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#f2f4f7}

    [${STEP_ATTR}]{position:relative;margin-top:22px!important;padding:22px!important;border:1px solid #303641!important;border-radius:18px!important;background:#171a20!important;color:#e9ebef!important;box-shadow:0 12px 38px rgba(0,0,0,.10)!important}
    .hwads-flow-step-head-v8{display:flex;align-items:center;gap:12px;margin:0 0 18px;padding:0 0 15px;border-bottom:1px solid #2d333d;color:#f3f4f7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    .hwads-flow-step-no-v8{display:grid;place-items:center;width:38px;height:30px;border:1px solid #414957;border-radius:9px;background:#101319;color:#d9dde5;font:850 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;flex:0 0 auto}
    .hwads-flow-step-head-v8>div{display:grid;gap:3px}
    .hwads-flow-step-head-v8 strong{font-size:16px;line-height:1.15;letter-spacing:-.01em}
    .hwads-flow-step-head-v8 small{font-size:11px;line-height:1.35;color:#969eab;font-weight:650}

    #hwads-dual-preview-v7[${STEP_ATTR}="04"]{margin-top:22px!important}
    #hwads-dual-preview-v7[${STEP_ATTR}="04"] .hwads-flow-step-head-v8+*{margin-top:0!important}
    [${STEP_ATTR}="05"] #hwads-inline-preview-controls{border-top-color:#303641!important}

    #${SUMMARY_ID}{margin:26px 0 14px;padding:22px;border:1px solid #38404c;border-radius:18px;background:#171a20;color:#e9ebef;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    #${SUMMARY_ID} .hwads-summary-grid-v8{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    #${SUMMARY_ID} .hwads-summary-grid-v8>div{display:grid;gap:5px;min-width:0;padding:13px;border:1px solid #2d333d;border-radius:12px;background:#11141a}
    #${SUMMARY_ID} .hwads-summary-grid-v8 span{font-size:10px;font-weight:800;letter-spacing:.08em;color:#8f98a8;text-transform:uppercase}
    #${SUMMARY_ID} .hwads-summary-grid-v8 b{overflow:hidden;text-overflow:ellipsis;font-size:13px;line-height:1.45;color:#edf0f4;white-space:nowrap}
    #${SUMMARY_ID}>p{margin:13px 0 0;font-size:11px;line-height:1.55;color:#9ca4b1}
    [data-hwads-confirm-host-v8="1"]>button:last-child,
    body[data-hwads-submission-flow-v8="1"] button[type="submit"]{min-height:52px!important;font-size:15px!important;font-weight:850!important;border-radius:12px!important}

    @media(max-width:780px){
      #${FLOW_ID}{padding:17px;margin:16px 0 22px;border-radius:16px}
      #${FLOW_ID} .hwads-flow-title-v8{font-size:20px}
      #${FLOW_ID} .hwads-flow-rail-v8{grid-template-columns:repeat(3,minmax(0,1fr))}
      [${STEP_ATTR}],#${SUMMARY_ID}{padding:17px!important;border-radius:15px!important}
      #${SUMMARY_ID} .hwads-summary-grid-v8{grid-template-columns:1fr}
    }
    @media(max-width:460px){
      #${FLOW_ID} .hwads-flow-rail-v8{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
  `;
  document.head.appendChild(style);

  ['input','change','click'].forEach((type) => document.addEventListener(type, () => schedule(type === 'input' ? 80 : 120), true));
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) schedule(100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();