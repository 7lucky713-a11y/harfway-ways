(() => {
  const nativeFetch = window.fetch.bind(window);

  const shuffle = (items) => {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';

    if (!/\/api\/games-live(?:[?#]|$)/.test(url)) return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data?.entries) || data.entries.length < 2) return response;

      const shuffled = { ...data, entries: shuffle(data.entries) };
      return new Response(JSON.stringify(shuffled), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };
})();
