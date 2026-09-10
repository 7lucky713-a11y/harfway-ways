(() => {
  function loadScript(src, onload) {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener('load', onload, { once: true });
    document.head.appendChild(script);
  }
  loadScript('/game-notes/runtime-core.js', () => loadScript('/game-notes/workflow.js'));
})();
