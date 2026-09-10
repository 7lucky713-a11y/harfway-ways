(() => {
  const top = document.querySelector('.top');
  if (top && !document.getElementById('workflow-open-link')) {
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
  }

  const nav = document.getElementById('nav');
  if (nav && !document.getElementById('private-clips-nav-link')) {
    const clips = document.createElement('a');
    clips.id = 'private-clips-nav-link';
    clips.href = '/private-clips/';
    clips.target = '_blank';
    clips.rel = 'noopener';
    clips.className = 'nav';
    clips.innerHTML = 'CLIPS <em>↗</em>';
    clips.style.textDecoration = 'none';
    nav.appendChild(clips);
  }

  if (!document.getElementById('game-notes-extra-nav-style')) {
    const style = document.createElement('style');
    style.id = 'game-notes-extra-nav-style';
    style.textContent = '@media(max-width:700px){.side nav{grid-template-columns:repeat(6,minmax(0,1fr))}}';
    document.head.appendChild(style);
  }
})();
