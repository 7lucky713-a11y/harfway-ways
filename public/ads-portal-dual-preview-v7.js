(() => {
  'use strict';

  const ID = 'hwads-creative-preview-v7';
  let objectUrl = '';

  const normalize = (value) => String(value || '').replace(/[\u3000\s]+/g, ' ').trim();

  function findFileInput() {
    return [...document.querySelectorAll('input[type="file"]')]
      .find((input) => /image|video/i.test(input.accept || '') || true) || null;
  }

  function findPlacementHeading() {
    return [...document.querySelectorAll('h1,h2,h3,h4,div,p,span')]
      .find((el) => normalize(el.textContent) === '掲載されたときの見え方') || null;
  }

  function clearUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }

  function build() {
    const section = document.createElement('section');
    section.id = ID;
    section.innerHTML = `
      <div class="hwads-creative-head">
        <div>
          <span class="hwads-kicker">CREATIVE</span>
          <h3>素材・トリミング確認</h3>
          <p>アップロードした横長画像・動画の全体をここで確認します。下の「掲載されたときの見え方」では、各広告枠に合わせてトリミングされた結果を確認できます。</p>
        </div>
        <span class="hwads-status">ORIGINAL</span>
      </div>
      <div class="hwads-original-stage" data-empty="1">
        <div class="hwads-empty">素材を選ぶと、ここに全体が表示されます。</div>
      </div>
      <div class="hwads-meta">
        <span data-hwads-meta-kind>素材未選択</span>
        <span data-hwads-meta-size></span>
        <span class="hwads-tip">上：全体 ／ 下：掲載時の crop</span>
      </div>
    `;
    return section;
  }

  function mount() {
    if (document.getElementById(ID)) return true;
    const heading = findPlacementHeading();
    if (!heading) return false;

    let host = heading.parentElement;
    for (let i = 0; host?.parentElement && host !== document.body && i < 5; i += 1) {
      const text = normalize(host.textContent || '');
      if (/プレイリスト/.test(text) && /切れ端/.test(text) && /WAYS/.test(text)) break;
      host = host.parentElement;
    }

    const section = build();
    if (host?.parentElement) host.parentElement.insertBefore(section, host);
    else heading.insertAdjacentElement('beforebegin', section);
    return true;
  }

  function render(file) {
    if (!mount()) return;
    const stage = document.querySelector(`#${ID} .hwads-original-stage`);
    const kind = document.querySelector(`#${ID} [data-hwads-meta-kind]`);
    const size = document.querySelector(`#${ID} [data-hwads-meta-size]`);
    if (!stage || !kind || !size) return;

    stage.innerHTML = '';
    clearUrl();
    if (!file) {
      stage.dataset.empty = '1';
      stage.innerHTML = '<div class="hwads-empty">素材を選ぶと、ここに全体が表示されます。</div>';
      kind.textContent = '素材未選択';
      size.textContent = '';
      return;
    }

    objectUrl = URL.createObjectURL(file);
    stage.dataset.empty = '0';
    const mb = (file.size / 1024 / 1024).toFixed(file.size >= 1024 * 1024 ? 1 : 2);
    kind.textContent = file.type.startsWith('video/') ? 'VIDEO / ORIGINAL' : 'IMAGE / ORIGINAL';
    size.textContent = `${mb} MB`;

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = objectUrl;
      video.controls = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      stage.appendChild(video);
      video.addEventListener('loadedmetadata', () => {
        size.textContent = `${video.videoWidth}×${video.videoHeight} / ${mb} MB`;
      }, { once: true });
    } else {
      const img = document.createElement('img');
      img.src = objectUrl;
      img.alt = 'アップロード素材の全体プレビュー';
      stage.appendChild(img);
      img.addEventListener('load', () => {
        size.textContent = `${img.naturalWidth}×${img.naturalHeight} / ${mb} MB`;
      }, { once: true });
    }
  }

  const style = document.createElement('style');
  style.id = 'hwads-dual-preview-style-v7';
  style.textContent = `
    #${ID}{margin:18px 0 24px;padding:18px;border:1px solid #d9cfbf;border-radius:18px;background:#fffdf8;color:#171714;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    #${ID} .hwads-creative-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:14px}
    #${ID} .hwads-kicker{display:block;color:#7a6343;font:900 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em}
    #${ID} h3{margin:7px 0 5px;font-size:18px;letter-spacing:-.03em;color:#171714}
    #${ID} p{max-width:680px;margin:0;color:#786e62;font-size:11px;line-height:1.65}
    #${ID} .hwads-status{flex:none;border:1px solid #d7cdbd;border-radius:999px;padding:7px 9px;color:#7b6e5d;font:900 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
    #${ID} .hwads-original-stage{width:100%;min-height:190px;display:grid;place-items:center;overflow:hidden;border:1px solid #d9d0c3;border-radius:13px;background:linear-gradient(135deg,#eee8dd,#f8f5ee)}
    #${ID} .hwads-original-stage[data-empty="0"]{padding:12px;background:#181917}
    #${ID} .hwads-original-stage img,#${ID} .hwads-original-stage video{display:block;max-width:100%;max-height:420px;width:auto;height:auto;object-fit:contain;background:#0e0f0e}
    #${ID} .hwads-empty{padding:30px;color:#9a8c79;font-size:11px;text-align:center}
    #${ID} .hwads-meta{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:10px;color:#887b69;font:800 9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
    #${ID} .hwads-tip{margin-left:auto;color:#5d6c32}
    @media(max-width:700px){#${ID}{padding:14px}#${ID} .hwads-creative-head{display:grid}#${ID} .hwads-original-stage{min-height:150px}#${ID} .hwads-original-stage img,#${ID} .hwads-original-stage video{max-height:300px}#${ID} .hwads-tip{margin-left:0;width:100%}}
  `;
  document.head.appendChild(style);

  document.addEventListener('change', (event) => {
    const input = event.target?.closest?.('input[type="file"]');
    if (!input) return;
    render(input.files?.[0] || null);
  }, true);

  const observer = new MutationObserver(() => {
    if (!document.getElementById(ID)) mount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  mount();
  const input = findFileInput();
  if (input?.files?.[0]) render(input.files[0]);
  window.addEventListener('beforeunload', clearUrl);
})();