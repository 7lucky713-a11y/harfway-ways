(() => {
  if (window.__HARFWAY_PRIVATE_TOOL_SHELL__) return;
  const existing = document.querySelector('script[data-private-tools-shell]');
  if (existing) return;
  const script = document.createElement('script');
  script.src = '/private-tools/shell.js';
  script.dataset.privateToolsShell = '1';
  document.head.appendChild(script);
})();
