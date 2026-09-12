(() => {
  const href = '/game-notes/minibook/';

  function addStyles() {
    if (document.getElementById('minibook-link-style')) return;
    const style = document.createElement('style');
    style.id = 'minibook-link-style';
    style.textContent = `
      #nav .minibook-launcher{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        width:100%;
        text-decoration:none;
      }
      #nav .minibook-launcher em{font-style:normal;opacity:.7}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    const nav = document.getElementById('nav');
    if (!nav || nav.querySelector('[data-minibook-launcher]')) return;
    addStyles();
    const link = document.createElement('a');
    link.href = href;
    link.className = 'nav minibook-launcher';
    link.dataset.minibookLauncher = '1';
    link.innerHTML = '<span>MINI BOOK</span><em>↗</em>';
    link.setAttribute('aria-label', 'MINI BOOKを作る');
    nav.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
