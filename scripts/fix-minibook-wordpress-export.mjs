import fs from 'node:fs';
import path from 'node:path';

function patchMinibookLayout() {
  const file = path.resolve('dist/game-notes/minibook-clean/index.html');
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

  replaceOnce(
    "function notePages(n,index){const run=runNumber(n,index),label=String(run).padStart(2,'0'),chunks=paginate(n.body),tags=tagsOf(n),out=[];",
    "function notePages(n,index){const run=runNumber(n,index),label=String(run).padStart(2,'0'),bodySize=Math.max(12,Math.min(18,Number(window.__MINIBOOK_DESIGN__?.bodyFontSize||15))),scale=15/bodySize,firstLimit=Math.max(190,Math.min(320,Math.round(260*scale))),nextLimit=Math.max(320,Math.min(540,Math.round(420*scale))),chunks=paginate(n.body,firstLimit,nextLimit),tags=tagsOf(n),out=[];",
    'font-aware run pagination'
  );

  replaceOnce(
    "  $('#game').addEventListener('change',onGame);",
    "  window.addEventListener('minibook:designchange',()=>{if(state.games.length)render()});\n  $('#game').addEventListener('change',onGame);",
    'design-change repagination'
  );

  if (!html.includes('firstLimit=Math.max(190') || !html.includes("window.addEventListener('minibook:designchange'")) {
    throw new Error('[minibook-wordpress-fix] layout pagination injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched MINI BOOK layout pagination');
}

function patchMinibookWrapper() {
  const file = path.resolve('dist/game-notes/minibook/index.html');
  if (!fs.existsSync(file)) {
    throw new Error(`[minibook-wordpress-fix] missing ${file}`);
  }

  let html = fs.readFileSync(file, 'utf8');
  const search = '    frame.srcdoc=html;';
  const replacement = "    html=html.replace('</body>','<scr'+'ipt src=\"/game-notes/minibook-design.js\"></scr'+'ipt></body>');\n    frame.srcdoc=html;";

  if (!html.includes(search)) {
    throw new Error('[minibook-wordpress-fix] MINI BOOK wrapper mount pattern not found');
  }

  html = html.replace(search, replacement);

  const dragSearch = "state.drag={id:e.pointerId,startX:e.clientX,lastX:e.clientX,startAt:performance.now(),lastAt:performance.now(),active:false,dir:null,next:null,width:stage.getBoundingClientRect().width,progress:0}";
  const dragReplacement = "state.drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,startAt:performance.now(),lastAt:performance.now(),active:false,dir:null,next:null,width:stage.getBoundingClientRect().width,progress:0}";
  if (!html.includes(dragSearch)) {
    throw new Error('[minibook-wordpress-fix] MINI BOOK click start pattern not found');
  }
  html = html.replace(dragSearch, dragReplacement);

  const clickSearch = "if(!d.active||!stage){state.drag=null;return}";
  const clickReplacement = "if(!d.active||!stage){state.drag=null;if(!stage)return;if(Math.abs(e.clientX-d.startX)>8||Math.abs(e.clientY-d.startY)>10)return;if(e.target?.closest?.('video,a,input,textarea,select,[contenteditable=\\\"true\\\"]'))return;const rect=stage.getBoundingClientRect(),dir=e.clientX<rect.left+rect.width/2?'prev':'next';state.suppressClickUntil=performance.now()+280;animatePage(state.page+(dir==='next'?1:-1),dir);return}";
  if (!html.includes(clickSearch)) {
    throw new Error('[minibook-wordpress-fix] MINI BOOK click turn pattern not found');
  }
  html = html.replace(clickSearch, clickReplacement);

  if (!html.includes('/game-notes/minibook-design.js') || !html.includes('startY:e.clientY') || !html.includes("dir=e.clientX<rect.left+rect.width/2?'prev':'next'")) {
    throw new Error('[minibook-wordpress-fix] wrapper interaction injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] attached isolated MINI BOOK design layer + half-click navigation');
}

function patchWordpressExporter() {
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

  // Carry DESIGN settings into the frozen public artifact without touching GAME NOTES loading/rendering.
  replaceOnce(
    "  function publicPageHtml(doc){\n    const nodes=[...doc.querySelectorAll('#print-stack .print-page')];",
    "  function publicPageHtml(doc){\n    const bodySize=Math.max(12,Math.min(18,Number(doc.defaultView?.__MINIBOOK_DESIGN__?.bodyFontSize||15)));\n    const nodes=[...doc.querySelectorAll('#print-stack .print-page')];",
    'design state export'
  );
  replaceOnce(
    '      const clone=node.cloneNode(true);',
    "      const clone=node.cloneNode(true);clone.querySelectorAll('.page-body,.run-body,.after-list').forEach(el=>el.style.fontSize=bodySize+'px');",
    'body size freeze'
  );

  // The editor now splits long RUNs into real pages; the public artifact must not add an inner scroll layer.
  replaceOnce(
    '.hw-minibook__scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#9b9589 transparent;-webkit-overflow-scrolling:touch}',
    '.hw-minibook__scroll{position:absolute;inset:0;overflow:hidden}',
    'disable inner page scroll'
  );
  replaceOnce(
    '.hw-minibook__scroll>.hw-mb-page{height:auto!important;min-height:100%!important}',
    '.hw-minibook__scroll>.hw-mb-page{height:100%!important;min-height:0!important}',
    'fixed page height'
  );

  // Explain the direct left/right tap controls in the exported reader.
  replaceOnce(
    '長文はページ内スクロール · 1ページ時は左右ドラッグ / ← → でめくる',
    '長文は自動で複数ページに分割 · 左半分タップで前へ / 右半分タップで次へ · 1ページ時は左右ドラッグでもめくれる',
    'tap help copy'
  );

  // Track vertical movement too, so touch movement never becomes an accidental tap-to-turn.
  replaceOnce(
    "drag={id:e.pointerId,start:e.clientX,w:slot.getBoundingClientRect().width,active:false,dir:null,target:null,p:0}",
    "drag={id:e.pointerId,start:e.clientX,startY:e.clientY,w:slot.getBoundingClientRect().width,active:false,dir:null,target:null,p:0}",
    'single tap startY'
  );

  const oldPointerUp = "book.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;if(!drag.active){drag=null;return}var d=drag,slot=book.querySelector('[data-hw-single]');drag=null;anim=true;var commit=d.p>.2;tween(slot,d.p,commit?1:0,d.dir,260+Math.round(360*Math.abs((commit?1:0)-d.p)),function(){if(commit)index=d.target;anim=false;render()})});";
  const newPointerUp = "book.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;if(!drag.active){var d0=drag;drag=null;if(Math.abs(e.clientX-d0.start)>9||Math.abs(e.clientY-d0.startY)>12)return;if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,video,[contenteditable=\\\"true\\\"]'))return;var rect0=book.getBoundingClientRect();navigate(e.clientX<rect0.left+rect0.width/2?'prev':'next');return}var d=drag,slot=book.querySelector('[data-hw-single]');drag=null;anim=true;var commit=d.p>.2;tween(slot,d.p,commit?1:0,d.dir,260+Math.round(360*Math.abs((commit?1:0)-d.p)),function(){if(commit)index=d.target;anim=false;render()})});var spreadTap=null;book.addEventListener('pointerdown',function(e){if(mode!=='spread'||anim)return;if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,video,[contenteditable=\\\"true\\\"]'))return;spreadTap={id:e.pointerId,x:e.clientX,y:e.clientY}});book.addEventListener('pointerup',function(e){if(mode!=='spread'||!spreadTap||spreadTap.id!==e.pointerId)return;var s=spreadTap;spreadTap=null;if(Math.abs(e.clientX-s.x)>9||Math.abs(e.clientY-s.y)>12)return;var rect=book.getBoundingClientRect();navigate(e.clientX<rect.left+rect.width/2?'prev':'next')});book.addEventListener('pointercancel',function(){spreadTap=null;if(drag&&!drag.active)drag=null});";
  replaceOnce(oldPointerUp, newPointerUp, 'left-right tap navigation');

  if (html.includes("replace(/<\\\\/script/gi")) {
    throw new Error('[minibook-wordpress-fix] broken script escape still present');
  }
  if (html.includes('data-hw-zoom-reset') || html.includes("root.addEventListener('wheel'")) {
    throw new Error('[minibook-wordpress-fix] zoom runtime unexpectedly present');
  }
  if (!html.includes('var spreadTap=null') || !html.includes("navigate(e.clientX<rect0.left+rect0.width/2?'prev':'next')") || !html.includes('__MINIBOOK_DESIGN__') || !html.includes('長文は自動で複数ページに分割')) {
    throw new Error('[minibook-wordpress-fix] exporter injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched exporter + tap navigation + paged long notes');
}

patchMinibookLayout();
patchMinibookWrapper();
patchWordpressExporter();
