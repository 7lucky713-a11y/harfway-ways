(() => {
  const top = document.querySelector('.top');
  if (!top || document.getElementById('workflow-open-link')) return;
  const link = document.createElement('a');
  link.id = 'workflow-open-link';
  link.href = '/game-notes/workflow/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'ghost';
  link.textContent = 'WORKFLOW ↗';
  link.style.textDecoration = 'none';
  link.style.display = 'inline-flex';
  link.style.alignItems = 'center';
  top.appendChild(link);
})();
