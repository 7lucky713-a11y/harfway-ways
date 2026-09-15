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

const marker = 'data-ways-sound-unlock="1"';
if (!html.includes(marker)) {
  const unlockScript = `<script ${marker}>
(() => {
  let unlocked = false;
  const cleanup = () => {
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  const unlock = (event) => {
    if (unlocked) return;
    const target = event?.target;
    if (target?.closest?.('#sound,#mSound')) {
      unlocked = true;
      cleanup();
      return;
    }
    unlocked = true;
    cleanup();
    try { muted = false; } catch {}
    try { mobileMuted = false; } catch {}
    const main = document.querySelector('#mainVideo');
    if (main) {
      main.muted = false;
      try { if (!userPaused) main.play().catch(() => {}); } catch { main.play().catch(() => {}); }
    }
    const sound = document.querySelector('#sound');
    if (sound) sound.textContent = '🔊';
    const mobileSound = document.querySelector('#mSound');
    if (mobileSound) {
      mobileSound.textContent = 'SOUND ON';
      mobileSound.classList.add('on');
    }
    document.querySelectorAll('.m-card video').forEach((video) => { video.muted = false; });
    const currentMobile = typeof currentMobileVideo === 'function' ? currentMobileVideo() : null;
    currentMobile?.play?.().catch?.(() => {});
  };
  window.addEventListener('click', unlock, true);
  window.addEventListener('keydown', unlock, true);
})();
</script>`;
  if (!html.includes('</body>')) throw new Error('[ways-autoplay-hotfix] </body> not found');
  html = html.replace('</body>', `${unlockScript}</body>`);
}

await writeFile(file, html, 'utf8');
console.log('[ways-autoplay-hotfix] restored muted autoplay; first interaction unlocks sound');
