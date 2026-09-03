(() => {
  const STYLE_ID = 'ways-mobile-enhancements-style';
  const VOLUME_KEY = 'ways_mobile_volume_v1';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width:899px){
        .ways-mobile-volume{
          display:flex;
          align-items:center;
          height:32px;
          padding:0 8px;
          border:1px solid #ffffff3d;
          border-radius:999px;
          background:#050505cc;
        }
        .ways-mobile-volume input{
          width:64px;
          height:12px;
          margin:0;
          accent-color:var(--accent,#efff35);
          cursor:pointer;
        }
        .ways-ad-mobile.landscape > video,
        .ways-ad-mobile.landscape .ways-ad-mobile-media{
          object-fit:contain!important;
          object-position:center!important;
          background:#000!important;
        }
        .ways-ad-mobile.portrait > video,
        .ways-ad-mobile.portrait .ways-ad-mobile-media{
          object-fit:cover!important;
          object-position:center!important;
          background:#000!important;
        }
      }
      @media (max-width:380px){
        .ways-mobile-volume{padding:0 6px}
        .ways-mobile-volume input{width:50px}
      }
    `;
    document.head.appendChild(style);
  }

  function readVolume() {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw !== null && raw !== '') {
        const stored = Number(raw);
        if (Number.isFinite(stored)) return Math.max(0, Math.min(1, stored));
      }
    } catch {}
    return 0.7;
  }

  let mobileVolume = readVolume();

  function saveVolume(value) {
    mobileVolume = Math.max(0, Math.min(1, Number(value) || 0));
    try { localStorage.setItem(VOLUME_KEY, String(mobileVolume)); } catch {}
  }

  function applyVolume(scope = document) {
    scope.querySelectorAll?.('.m-card video').forEach((video) => {
      video.volume = mobileVolume;
    });
  }

  function syncSoundToVolume() {
    const sound = document.querySelector('#mSound');
    if (!sound) return;
    const soundOn = sound.classList.contains('on');
    if (mobileVolume <= 0 && soundOn) sound.click();
    if (mobileVolume > 0 && !soundOn) sound.click();
    applyVolume(document);
  }

  function mountVolumeSlider() {
    const tools = document.querySelector('.mobile .m-tools');
    const sound = document.querySelector('#mSound');
    if (!tools || !sound || document.querySelector('#mVolume')) return false;

    const wrap = document.createElement('label');
    wrap.className = 'ways-mobile-volume';
    wrap.setAttribute('aria-label', '音量');

    const slider = document.createElement('input');
    slider.id = 'mVolume';
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(mobileVolume);
    slider.setAttribute('aria-label', '音量');
    slider.title = `音量 ${Math.round(mobileVolume * 100)}%`;

    slider.addEventListener('input', () => {
      saveVolume(slider.value);
      slider.title = `音量 ${Math.round(mobileVolume * 100)}%`;
      applyVolume(document);
      syncSoundToVolume();
    });

    wrap.appendChild(slider);
    sound.insertAdjacentElement('afterend', wrap);
    applyVolume(document);
    return true;
  }

  function setOrientation(card, width, height) {
    if (!card || !width || !height) return;
    card.classList.remove('portrait', 'landscape');
    card.classList.add(height > width ? 'portrait' : 'landscape');
  }

  function prepareAdCard(card) {
    if (!card || card.dataset.waysOrientationReady === '1') return;
    card.dataset.waysOrientationReady = '1';

    card.classList.remove('portrait');
    card.classList.add('landscape');

    const image = card.querySelector('.ways-ad-mobile-media');
    if (image) {
      const applyImage = () => setOrientation(card, image.naturalWidth, image.naturalHeight);
      if (image.complete && image.naturalWidth) applyImage();
      else image.addEventListener('load', applyImage, { once: true });
    }

    const video = card.querySelector('video');
    if (video) {
      const applyVideo = () => setOrientation(card, video.videoWidth, video.videoHeight);
      if (video.videoWidth) applyVideo();
      else video.addEventListener('loadedmetadata', applyVideo, { once: true });
      video.volume = mobileVolume;
    }
  }

  function scan(scope = document) {
    mountVolumeSlider();
    applyVolume(scope);
    scope.querySelectorAll?.('.ways-ad-mobile').forEach(prepareAdCard);
  }

  function boot() {
    addStyles();
    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('.ways-ad-mobile')) prepareAdCard(node);
          node.querySelectorAll?.('.ways-ad-mobile').forEach(prepareAdCard);
          applyVolume(node);
        }
      }
      mountVolumeSlider();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
