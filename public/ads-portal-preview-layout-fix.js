(() => {
  'use strict';

  const LIVE_ID = 'hwads-media-preview';
  const SAMPLE_SWITCH_ID = 'hwads-sample-preview-switch';
  const STYLE_ID = 'hwads-preview-layout-fix-style';
  let sampleDevice = 'pc';
  let timer = 0;

  const normalize = (value) => String(value || '').replace(/[\u3000\s]+/g, ' ').trim();

  function parseRgb(value) {
    const m = String(value || '').match(/rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function lum(rgb) {
    return rgb ? rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 : 255;
  }

  function findText(root, exact) {
    return [...root.querySelectorAll('h1,h2,h3,h4,p,span,div,b,strong')]
      .find((el) => normalize(el.textContent) === exact) || null;
  }

  function findPreviewPanel() {
    const known = document.querySelector('[data-hwads-preview-panel="true"]');
    if (known) return known;
    const heading = findText(document, '掲載されたときの見え方') || findText(document, 'サンプルプレビュー');
    if (!heading) return null;
    let current = heading.parentElement;
    let fallback = current;
    for (let i = 0; current && current !== document.body && i < 8; i += 1) {
      const rect = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      if (rect.width >= 420 && rect.height >= 260) {
        fallback = current;
        if (parseFloat(style.borderRadius || '0') >= 10 || parseFloat(style.borderTopWidth || '0') >= 1) break;
      }
      current = current.parentElement;
    }
    if (fallback) fallback.dataset.hwadsPreviewPanel = 'true';
    return fallback;
  }

  function formScope() {
    const file = document.querySelector('input[type="file"]');
    return file?.closest('form') || null;
  }

  function selectedByStyle(button) {
    if (button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-checked') === 'true') return true;
    if (['on', 'active', 'selected', 'checked'].includes(button.getAttribute('data-state'))) return true;
    const style = getComputedStyle(button);
    return lum(parseRgb(style.backgroundColor)) < 100 && lum(parseRgb(style.color)) > 130;
  }

  function syncPlacementState() {
    const form = formScope();
    if (!form) return;
    const names = ['プレイリスト', '切れ端', 'WAYS', 'SALE WATCH'];
    const buttons = [...form.querySelectorAll('button,[role="checkbox"],[role="switch"]')];
    for (const name of names) {
      const button = buttons.find((el) => normalize(el.textContent) === name);
      if (!button) continue;
      button.setAttribute('aria-pressed', selectedByStyle(button) ? 'true' : 'false');
    }
  }

  function findSampleCard(panel) {
    if (!panel) return null;
    const marker = [...panel.querySelectorAll('div,p,span,small,b')]
      .filter((el) => !el.closest(`#${LIVE_ID}`) && !el.closest(`#${SAMPLE_SWITCH_ID}`))
      .find((el) => /P\.SP\s*\/|今週の寄り道\s*\/\s*PR/i.test(normalize(el.textContent)));
    if (!marker) return null;
    let current = marker.parentElement;
    let best = current;
    for (let i = 0; current && current !== panel && i < 6; i += 1) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 280 && rect.height >= 180) {
        best = current;
        if (rect.height >= 230) break;
      }
      current = current.parentElement;
    }
    return best;
  }

  function applySampleDevice(panel) {
    const card = findSampleCard(panel);
    if (!card) return;
    card.dataset.hwadsSampleCard = 'true';
    if (sampleDevice === 'mobile') {
      card.style.width = 'min(100%, 390px)';
      card.style.maxWidth = '390px';
      card.style.marginLeft = 'auto';
      card.style.marginRight = 'auto';
    } else {
      card.style.width = '';
      card.style.maxWidth = '';
      card.style.marginLeft = '';
      card.style.marginRight = '';
    }
  }

  function ensureSampleSwitch(panel) {
    const card = findSampleCard(panel);
    if (!card) return;
    let root = document.getElementById(SAMPLE_SWITCH_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = SAMPLE_SWITCH_ID;
      root.innerHTML = '<div><small>SAMPLE PREVIEW</small><b>サンプルプレビュー</b><span>媒体の見本を端末別に確認</span></div><div class="hwads-sample-toggle"><button type="button" data-sample-device="pc">PC</button><button type="button" data-sample-device="mobile">スマホ</button></div>';
    }
    if (card.parentElement && root.parentElement !== card.parentElement) card.parentElement.insertBefore(root, card);
    else if (card.parentElement && root.nextElementSibling !== card) card.parentElement.insertBefore(root, card);
    root.querySelectorAll('[data-sample-device]').forEach((button) => {
      button.classList.toggle('active', button.dataset.sampleDevice === sampleDevice);
    });
    applySampleDevice(panel);
  }

  function renameSections(panel) {
    const heading = findText(panel, '掲載されたときの見え方');
    if (heading) heading.textContent = 'サンプルプレビュー';
    const live = document.getElementById(LIVE_ID);
    if (!live) return;
    const eyebrow = live.querySelector('.hwads-preview-eyebrow');
    const title = live.querySelector('.hwads-preview-header h2');
    const desc = live.querySelector('.hwads-preview-header p');
    if (eyebrow) eyebrow.textContent = 'YOUR AD / LIVE PREVIEW';
    if (title) title.textContent = '実際に表示されるプレビュー';
    if (desc) desc.textContent = '現在の入力内容をもとに、掲載時の見え方を確認できます。';
  }

  function moveLivePreview(panel) {
    const live = document.getElementById(LIVE_ID);
    if (!panel || !live) return;
    if (live.parentElement !== panel) panel.appendChild(live);
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${SAMPLE_SWITCH_ID}{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0 10px;padding:11px 12px;border:1px dashed #d5cfc3;border-radius:11px;background:#fbfaf6;color:#171717;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
      #${SAMPLE_SWITCH_ID}>div:first-child{display:grid;gap:2px}#${SAMPLE_SWITCH_ID} small{color:#78736a;font:900 8px/1 ui-monospace,monospace;letter-spacing:.11em}#${SAMPLE_SWITCH_ID} b{font-size:12px}#${SAMPLE_SWITCH_ID} span{color:#89837a;font-size:8px}.hwads-sample-toggle{display:flex;padding:3px;border:1px solid #d6d0c5;border-radius:999px;background:#f0ede6}.hwads-sample-toggle button{appearance:none;border:0;border-radius:999px;padding:7px 10px;background:transparent;color:#726e66;font:900 9px/1 ui-monospace,monospace;cursor:pointer}.hwads-sample-toggle button.active{background:#151515;color:white}
      [data-hwads-sample-card="true"]{transition:width .2s ease,max-width .2s ease,margin .2s ease}
      [data-hwads-preview-panel="true"]>#${LIVE_ID}{width:auto!important;margin:28px 0 4px!important;grid-column:auto!important}
      [data-hwads-preview-panel="true"]>#${LIVE_ID} .hwads-preview-shell{box-shadow:0 16px 45px rgba(20,18,12,.14)}
      @media(max-width:760px){#${SAMPLE_SWITCH_ID}{align-items:flex-start;flex-direction:column}.hwads-sample-toggle{width:100%}.hwads-sample-toggle button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function fix() {
    syncPlacementState();
    const panel = findPreviewPanel();
    if (!panel) return;
    moveLivePreview(panel);
    ensureSampleSwitch(panel);
    renameSections(panel);
  }

  document.addEventListener('click', (event) => {
    const device = event.target.closest?.('[data-sample-device]');
    if (device) {
      event.preventDefault();
      sampleDevice = device.dataset.sampleDevice === 'mobile' ? 'mobile' : 'pc';
      ensureSampleSwitch(findPreviewPanel());
      return;
    }
    if (!event.target.closest?.(`#${LIVE_ID}`)) window.setTimeout(fix, 0);
  }, true);

  document.addEventListener('input', () => window.setTimeout(fix, 0), true);
  document.addEventListener('change', () => window.setTimeout(fix, 0), true);

  addStyles();
  window.setTimeout(fix, 50);
  window.setTimeout(fix, 350);

  const observer = new MutationObserver((mutations) => {
    if (mutations.every((m) => m.target.closest?.(`#${SAMPLE_SWITCH_ID}`))) return;
    clearTimeout(timer);
    timer = window.setTimeout(fix, 100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
