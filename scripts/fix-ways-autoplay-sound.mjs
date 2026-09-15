import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'dist/index.html');
let html = await readFile(file, 'utf8');

const replacements = [
  [
    '<video id="mainVideo" playsinline loop preload="auto"></video>',
    '<video id="mainVideo" muted playsinline loop preload="auto"></video>'
  ],
  [
    '<button id="sound" class="icon" title="音声">🔊</button>',
    '<button id="sound" class="icon" title="音声">🔇</button>'
  ],
  [
    '<button id="mSound" class="on">SOUND ON</button>',
    '<button id="mSound">SOUND OFF</button>'
  ],
  [
    "let activeContentType=new URLSearchParams(location.search).get('view')==='tip'?'tip':'discover';let items=[],filtered=[],selected=0,muted=false,userPaused=false,activeTag='',mobileMuted=false,orientationOverride='auto';",
    "let activeContentType=new URLSearchParams(location.search).get('view')==='tip'?'tip':'discover';let items=[],filtered=[],selected=0,muted=true,userPaused=false,activeTag='',mobileMuted=true,orientationOverride='auto';"
  ]
];

for (const [from, to] of replacements) {
  if (!html.includes(from)) {
    throw new Error(`[ways-autoplay-hotfix] expected pattern not found: ${from.slice(0, 80)}`);
  }
  html = html.replace(from, to);
}

html = html.replaceAll(
  '<video playsinline loop preload="none"',
  '<video muted playsinline loop preload="none"'
);

const posterFrom = "if(x.thumbnailUrl)v.setAttribute('poster',x.thumbnailUrl);v.src=nextSrc;userPaused=false;$('#pause').textContent='⏸';const clearPoster=()=>v.removeAttribute('poster');v.addEventListener('playing',clearPoster,{once:true});v.play().catch(()=>{});startShelfAfterMain()";
const posterTo = "v.dataset.waysFrameReady='0';if(x.thumbnailUrl)v.setAttribute('poster',x.thumbnailUrl);v.src=nextSrc;userPaused=false;$('#pause').textContent='⏸';let frameShown=false;const showFrame=()=>{if(frameShown)return;frameShown=true;v.dataset.waysFrameReady='1';requestAnimationFrame(()=>v.removeAttribute('poster'));v.dispatchEvent(new CustomEvent('ways:firstframe'))};if(typeof v.requestVideoFrameCallback==='function'){v.requestVideoFrameCallback(()=>showFrame())}else{v.addEventListener('timeupdate',showFrame,{once:true});v.addEventListener('loadeddata',()=>setTimeout(showFrame,80),{once:true})}v.play().catch(()=>{});startShelfAfterMain()";
if (!html.includes(posterFrom)) {
  throw new Error('[ways-autoplay-hotfix] poster clear pattern not found');
}
html = html.replace(posterFrom, posterTo);

const marker = 'data-ways-sound-unlock="1"';
if (!html.includes(marker)) {
  const unlockScript = `<script ${marker}>
(() => {
  let unlocked = false;
  let pending = false;

  const setUi = (on) => {
    const sound = document.querySelector('#sound');
    if (sound) sound.textContent = on ? '🔊' : '🔇';
    const mobileSound = document.querySelector('#mSound');
    if (mobileSound) {
      mobileSound.textContent = on ? 'SOUND ON' : 'SOUND OFF';
      mobileSound.classList.toggle('on', on);
    }
  };

  const cleanup = () => {
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  const currentVideo = () => {
    if (innerWidth < 900 && typeof currentMobileVideo === 'function') {
      return currentMobileVideo() || document.querySelector('.m-card video');
    }
    return document.querySelector('#mainVideo');
  };

  const frameIsVisible = (video) => {
    if (!video) return false;
    return video.dataset.waysFrameReady === '1' || (video.readyState >= 2 && video.currentTime > 0.03);
  };

  const afterVisibleFrame = (video, callback) => {
    if (!video) return callback();
    if (frameIsVisible(video)) return callback();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.dataset.waysFrameReady = '1';
      requestAnimationFrame(callback);
    };

    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => finish());
    } else {
      video.addEventListener('timeupdate', finish, { once: true });
      video.addEventListener('loadeddata', () => setTimeout(finish, 80), { once: true });
    }
  };

  const enableSound = (video) => {
    try { muted = false; } catch {}
    try { mobileMuted = false; } catch {}

    const main = document.querySelector('#mainVideo');
    if (main) main.muted = false;
    document.querySelectorAll('.m-card video').forEach((node) => { node.muted = false; });
    if (video) video.muted = false;
    setUi(true);

    let playResult = null;
    try {
      const pausedByUser = typeof userPaused !== 'undefined' && userPaused;
      if (video && !pausedByUser) playResult = video.play();
    } catch {}

    if (playResult?.catch) {
      playResult.catch(() => {
        try { muted = true; } catch {}
        try { mobileMuted = true; } catch {}
        if (main) main.muted = true;
        document.querySelectorAll('.m-card video').forEach((node) => { node.muted = true; });
        setUi(false);
        pending = false;
      });
    }

    unlocked = true;
    pending = false;
    cleanup();
  };

  const unlock = (event) => {
    if (unlocked || pending) return;
    const target = event?.target;
    const explicitSoundButton = target?.closest?.('#sound,#mSound');
    if (explicitSoundButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    pending = true;
    const video = currentVideo();
    afterVisibleFrame(video, () => enableSound(video));
  };

  const main = document.querySelector('#mainVideo');
  if (main && !main.dataset.waysFrameReady) main.dataset.waysFrameReady = '0';

  window.addEventListener('click', unlock, true);
  window.addEventListener('keydown', unlock, true);
})();
</script>`;
  if (!html.includes('</body>')) throw new Error('[ways-autoplay-hotfix] </body> not found');
  html = html.replace('</body>', `${unlockScript}</body>`);
}

await writeFile(file, html, 'utf8');
console.log('[ways-autoplay-hotfix] muted autoplay + poster held until first painted frame; sound waits for visible video');
