(() => {
  const nav = document.getElementById('nav');
  if (!nav || document.getElementById('glossary-nav')) return;
  const button = document.createElement('button');
  button.id = 'glossary-nav';
  button.className = 'nav';
  button.type = 'button';
  button.innerHTML = 'GLOSSARY <em>辞</em>';
  button.addEventListener('click', () => { location.href = '/game-notes/glossary/'; });
  const editor = nav.querySelector('[data-view="editor"]');
  if (editor) nav.insertBefore(button, editor); else nav.appendChild(button);
})();
