(() => {
  'use strict';

  const ACTIVE = '[data-hwads-inline-preview-active-frame="1"]';
  const PC_PANEL = '[data-hwads-preview-device="pc"]';
  let timer = 0;

  const style = document.createElement('style');
  style.textContent = `
    ${PC_PANEL} ${ACTIVE}{
      aspect-ratio:auto!important;
      height:auto!important;
      min-height:var(--hwads-pc-preview-min-height,360px)!important;
      max-height:none!important;
      overflow:hidden!important;
    }
  `;
  document.head.appendChild(style);

  function fitPcFrame() {
    const panel = document.querySelector(PC_PANEL);
    const frame = panel?.querySelector(ACTIVE);
    if (!panel || !frame) return;

    frame.style.removeProperty('--hwads-pc-preview-min-height');
    const needed = Math.max(360, Math.ceil(frame.scrollHeight || 0));
    frame.style.setProperty('--hwads-pc-preview-min-height', `${needed}px`);
  }

  function schedule(delay = 0) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      fitPcFrame();
      window.requestAnimationFrame(fitPcFrame);
    }, delay);
  }

  document.addEventListener('click', () => {
    schedule(20);
    window.setTimeout(fitPcFrame, 120);
  }, true);

  document.addEventListener('change', () => {
    schedule(40);
    window.setTimeout(fitPcFrame, 180);
    window.setTimeout(fitPcFrame, 360);
  }, true);

  document.addEventListener('load', (event) => {
    if (event.target?.matches?.('img,video')) schedule(20);
  }, true);

  window.addEventListener('resize', () => schedule(80), { passive: true });

  schedule(60);
})();
