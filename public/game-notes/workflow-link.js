(() => {
  const top = document.querySelector('.top');
  if (!top) return;

  let workflow = document.getElementById('workflow-open-link');
  if (!workflow) {
    workflow = document.createElement('a');
    workflow.id = 'workflow-open-link';
    workflow.href = '/game-notes/workflow/';
    workflow.target = '_blank';
    workflow.rel = 'noopener';
    workflow.className = 'ghost';
    workflow.textContent = 'WORKFLOW ↗';
    workflow.style.textDecoration = 'none';
    workflow.style.display = 'inline-flex';
    workflow.style.alignItems = 'center';
    top.appendChild(workflow);
  }

  if (!document.getElementById('private-clips-open-link')) {
    const clips = document.createElement('a');
    clips.id = 'private-clips-open-link';
    clips.href = '/private-clips/';
    clips.target = '_blank';
    clips.rel = 'noopener';
    clips.className = 'ghost';
    clips.textContent = 'CLIPS ↗';
    clips.style.textDecoration = 'none';
    clips.style.display = 'inline-flex';
    clips.style.alignItems = 'center';
    workflow.insertAdjacentElement('afterend', clips);
  }
})();
