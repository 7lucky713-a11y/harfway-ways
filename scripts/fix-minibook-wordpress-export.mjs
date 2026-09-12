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

// Explain the direct left/right tap controls in the exported reader.
replaceOnce(
  '長文はページ内スクロール · 1ページ時は左右ドラッグ / ← → でめくる',
  '長文はページ内スクロール · 左半分タップで前へ / 右半分タップで次へ · 1ページ時は左右ドラッグでもめくれる',
  'tap help copy'
);

// Track vertical movement too, so a scroll gesture never becomes an accidental tap-to-turn.
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
if (!html.includes('var spreadTap=null') || !html.includes("navigate(e.clientX<rect0.left+rect0.width/2?'prev':'next')")) {
  throw new Error('[minibook-wordpress-fix] tap navigation injection failed');
}

fs.writeFileSync(file, html);
console.log('[minibook-wordpress-fix] patched copy exporter runtime + left/right tap navigation');
