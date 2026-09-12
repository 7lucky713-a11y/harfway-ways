import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/game-notes/minibook-wordpress-v3/index.html');
if (!fs.existsSync(file)) {
  throw new Error(`[minibook-wordpress-fix] missing ${file}`);
}

let html = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  if (!html.includes(search)) {
    throw new Error(`[minibook-wordpress-fix] ${label} pattern not found`);
  }
  html = html.replace(search, replacement);
}

// Fix the split-export script wrapper so the exporter page itself parses.
const lines = html.split('\n');
const buildAllIndex = lines.findIndex((line) => line.includes('function buildAll(pages)'));
if (buildAllIndex < 0) {
  throw new Error('[minibook-wordpress-fix] buildAll function not found');
}
lines[buildAllIndex] = "  function buildAll(pages){return buildHtmlCss(pages)+'\\n'+'<scr'+'ipt>'+exportJs()+'</scr'+'ipt>'}";
html = lines.join('\n');

// Add zoom-specific fullscreen behavior.
replaceOnce(
  '.hw-minibook:fullscreen .hw-minibook__toolbar,.hw-minibook.hw-minibook--fullscreen .hw-minibook__toolbar{width:min(94vw,1500px)}',
  '.hw-minibook:fullscreen .hw-minibook__toolbar,.hw-minibook.hw-minibook--fullscreen .hw-minibook__toolbar{width:min(94vw,1500px)}\\n.hw-minibook.hw-minibook--zoomed:fullscreen,.hw-minibook.hw-minibook--zoomed.hw-minibook--fullscreen{justify-content:flex-start!important}',
  'zoom fullscreen css'
);

// Add a visible zoom reset / percentage button to exported markup.
replaceOnce(
  '<button type="button" data-hw-fullscreen>全画面で読む</button>\\n  </div>',
  '<button type="button" data-hw-fullscreen>全画面で読む</button>\\n    <button type="button" data-hw-zoom-reset disabled>100%</button>\\n  </div>',
  'zoom button markup'
);

replaceOnce(
  '長文はページ内スクロール · 1ページ時は左右ドラッグ / ← → でめくる',
  '長文はページ内スクロール · 全画面では余白ホイールで拡大縮小 · Ctrl/⌘+ホイールなら紙の上でも拡大縮小',
  'zoom help copy'
);

// Extend the exported common JS with zoom state and references.
replaceOnce(
  "var pages=[].slice.call(root.querySelectorAll('.hw-minibook__source'));var book=root.querySelector('.hw-minibook__book'),progress=root.querySelector('.hw-minibook__progress'),prev=root.querySelector('[data-hw-prev]'),next=root.querySelector('[data-hw-next]'),singleBtn=root.querySelector('[data-hw-view=\"single\"]'),spreadBtn=root.querySelector('[data-hw-view=\"spread\"]'),fullBtn=root.querySelector('[data-hw-fullscreen]');if(!pages.length||!book||!progress||!prev||!next||!singleBtn||!spreadBtn||!fullBtn)return;var index=0,mode='single',anim=false,drag=null,fallback=false;",
  "var pages=[].slice.call(root.querySelectorAll('.hw-minibook__source'));var book=root.querySelector('.hw-minibook__book'),reader=root.querySelector('.hw-minibook__reader'),progress=root.querySelector('.hw-minibook__progress'),prev=root.querySelector('[data-hw-prev]'),next=root.querySelector('[data-hw-next]'),singleBtn=root.querySelector('[data-hw-view=\"single\"]'),spreadBtn=root.querySelector('[data-hw-view=\"spread\"]'),fullBtn=root.querySelector('[data-hw-fullscreen]'),zoomBtn=root.querySelector('[data-hw-zoom-reset]');if(!pages.length||!book||!reader||!progress||!prev||!next||!singleBtn||!spreadBtn||!fullBtn||!zoomBtn)return;var index=0,mode='single',anim=false,drag=null,fallback=false,zoom=1;",
  'zoom js refs'
);

replaceOnce(
  "function isNarrow(){return window.matchMedia('(max-width:760px)').matches}function spreadStart(i){if(i<=0)return 0;return i%2===0?i-1:i}",
  "function isNarrow(){return window.matchMedia('(max-width:760px)').matches}function spreadStart(i){if(i<=0)return 0;return i%2===0?i-1:i}function fullActive(){return document.fullscreenElement===root||fallback}function setZoom(v){zoom=Math.max(.7,Math.min(1.6,Math.round(v*100)/100));if(!fullActive()){reader.style.width='';root.classList.remove('hw-minibook--zoomed');zoomBtn.textContent='100%';return}reader.style.width='';var base=reader.getBoundingClientRect().width;reader.style.width=Math.round(base*zoom)+'px';root.classList.toggle('hw-minibook--zoomed',zoom>1.001);zoomBtn.textContent=Math.round(zoom*100)+'%'}",
  'zoom functions'
);

replaceOnce(
  "function setMode(nextMode){if(nextMode==='spread'&&isNarrow())nextMode='single';mode=nextMode;index=mode==='spread'?spreadStart(index):index;root.classList.toggle('hw-minibook--spread',mode==='spread');singleBtn.setAttribute('aria-pressed',String(mode==='single'));spreadBtn.setAttribute('aria-pressed',String(mode==='spread'));spreadBtn.disabled=isNarrow();render()}",
  "function setMode(nextMode){if(nextMode==='spread'&&isNarrow())nextMode='single';mode=nextMode;index=mode==='spread'?spreadStart(index):index;root.classList.toggle('hw-minibook--spread',mode==='spread');singleBtn.setAttribute('aria-pressed',String(mode==='single'));spreadBtn.setAttribute('aria-pressed',String(mode==='spread'));spreadBtn.disabled=isNarrow();render();if(fullActive())setTimeout(function(){setZoom(zoom)},0)}",
  'zoom mode refresh'
);

replaceOnce(
  "function updateFullLabel(){var active=document.fullscreenElement===root||fallback;fullBtn.textContent=active?'全画面を閉じる':'全画面で読む'}function closeFallback(){if(!fallback)return;fallback=false;root.classList.remove('hw-minibook--fullscreen');document.body.style.overflow='';updateFullLabel()}",
  "function updateFullLabel(){var active=fullActive();fullBtn.textContent=active?'全画面を閉じる':'全画面で読む';zoomBtn.disabled=!active;if(active)setTimeout(function(){setZoom(zoom)},0);else{zoom=1;setZoom(1)}}function closeFallback(){if(!fallback)return;fallback=false;root.classList.remove('hw-minibook--fullscreen');document.body.style.overflow='';updateFullLabel()}",
  'zoom fullscreen label'
);

replaceOnce(
  "fullBtn.addEventListener('click',async function(){if(document.fullscreenElement===root){try{await document.exitFullscreen()}catch(e){}return}if(fallback){closeFallback();return}if(root.requestFullscreen){try{await root.requestFullscreen();return}catch(e){}}fallback=true;root.classList.add('hw-minibook--fullscreen');document.body.style.overflow='hidden';updateFullLabel()});document.addEventListener('fullscreenchange',updateFullLabel);",
  "fullBtn.addEventListener('click',async function(){if(document.fullscreenElement===root){try{await document.exitFullscreen()}catch(e){}return}if(fallback){closeFallback();return}if(root.requestFullscreen){try{await root.requestFullscreen();return}catch(e){}}fallback=true;root.classList.add('hw-minibook--fullscreen');document.body.style.overflow='hidden';updateFullLabel()});zoomBtn.addEventListener('click',function(){setZoom(1)});root.addEventListener('wheel',function(e){if(!fullActive())return;var scroll=e.target&&e.target.closest?e.target.closest('.hw-minibook__scroll'):null;if(scroll&&!e.ctrlKey&&!e.metaKey)return;e.preventDefault();var delta=Math.max(-120,Math.min(120,e.deltaY));setZoom(zoom-delta*.001)}, {passive:false});document.addEventListener('fullscreenchange',updateFullLabel);",
  'zoom wheel listener'
);

replaceOnce(
  "window.addEventListener('resize',function(){spreadBtn.disabled=isNarrow();if(isNarrow()&&mode==='spread')setMode('single')});setMode('single');updateFullLabel();",
  "window.addEventListener('resize',function(){spreadBtn.disabled=isNarrow();if(isNarrow()&&mode==='spread')setMode('single');else if(fullActive())setZoom(zoom)});setMode('single');updateFullLabel();",
  'zoom resize refresh'
);

if (html.includes("replace(/<\\\\/script/gi")) {
  throw new Error('[minibook-wordpress-fix] broken script escape still present');
}
if (!html.includes('data-hw-zoom-reset') || !html.includes("root.addEventListener('wheel'")) {
  throw new Error('[minibook-wordpress-fix] zoom runtime injection failed');
}

fs.writeFileSync(file, html);
console.log('[minibook-wordpress-fix] patched copy exporter runtime + fullscreen wheel zoom');
