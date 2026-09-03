(() => {
  const SELECTOR = '.ways-ad-card';

  document.addEventListener('click', (event) => {
    const card = event.target?.closest?.(SELECTOR);
    if (!card) return;

    // Desktop ad cards are a stage-open control, never a direct store link.
    // Cancel any native/default navigation while preserving the existing
    // ways-ads.js card click handler that opens the promoted media in-stage.
    event.preventDefault();
  }, true);
})();
