(() => {
  const shuffle = (items) => {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const reorder = () => {
    const shelf = document.querySelector('.shelf');
    if (shelf) {
      const cards = Array.from(shelf.children).filter((node) => node.classList?.contains('game'));
      shuffle(cards).forEach((card) => shelf.appendChild(card));
    }

    const mobileFeed = document.querySelector('.m-feed');
    if (mobileFeed) {
      const cards = Array.from(mobileFeed.children).filter((node) => node.classList?.contains('m-card'));
      shuffle(cards).forEach((card) => mobileFeed.appendChild(card));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reorder, { once: true });
  } else {
    reorder();
  }
})();
