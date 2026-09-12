import fs from 'node:fs';
import path from 'node:path';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`[minibook-wordpress-fix] ${label} pattern not found`);
  }
  return source.replace(search, replacement);
}

function patchCleanEditor() {
  const file = path.resolve('dist/game-notes/minibook-clean/index.html');
  if (!fs.existsSync(file)) throw new Error(`[minibook-wordpress-fix] missing ${file}`);
  let html = fs.readFileSync(file, 'utf8');

  html = replaceOnce(
    html,
    '<div class="group"><label>FORMAT</label><div class="format-card"><b>B5 / 182 × 257 mm</b><small>FULL NOTES · EDITABLE FRONT/BACK MATTER · FLUID PAGE SWIPE</small></div></div>',
    '<div class="group"><label>FORMAT</label><div class="format-card"><b>B5 / 182 × 257 mm</b><small>FULL NOTES · EDITABLE FRONT/BACK MATTER · FLUID PAGE SWIPE</small></div></div><div class="group"><label>TEXT SIZE</label><select id="body-font-size"><option value="12">12px / SMALL</option><option value="13">13px</option><option value="14">14px</option><option value="15" selected>15px / DEFAULT</option><option value="16">16px</option><option value="18">18px / LARGE</option></select><div class="hint">GAME NOTES本文・INTRO・AFTER・COLOPHONの本文サイズ。サイズに合わせてページ分割量も自動調整します。</div></div>',
    'text size editor control'
  );

  html = replaceOnce(
    html,
    "function paginate(body,first=520,next=760){const t=String(body||'').replace(/\\r/g,'').trim();",
    "function paginate(body,first=520,next=760){const fs=Number($('#body-font-size')?.value||15),scale=Math.max(.65,Math.min(1.35,15/fs));first=Math.round(first*scale);next=Math.round(next*scale);const t=String(body||'').replace(/\\r/g,'').trim();",
    'font aware pagination'
  );

  html = replaceOnce(
    html,
    "function build(){\n    const notes=chosen(),g=gameById(gameId()),raw=[];",
    "function build(){\n    const notes=chosen(),g=gameById(gameId()),raw=[],bodySize=Math.max(12,Math.min(18,Number($('#body-font-size')?.value||15)));",
    'build body font size state'
  );

  html = replaceOnce(
    html,
    '    state.pages=raw;state.page=Math.max(0,Math.min(state.page,raw.length-1));renderPrint();return raw;',
    '    const sized=raw.map(p=>({...p,html:p.html.replaceAll(\'class="page-body"\',`class="page-body" style="font-size:${bodySize}px"`).replaceAll(\'class="run-body"\',`class="run-body" style="font-size:${bodySize}px"`).replaceAll(\'class="after-list"\',`class="after-list" style="font-size:${bodySize}px"`)}));state.pages=sized;state.page=Math.max(0,Math.min(state.page,sized.length-1));renderPrint();return sized;',
    'inline body size on text elements'
  );

  html = replaceOnce(
    html,
    "  $$('.page-editor input,.page-editor textarea').forEach(el=>el.addEventListener('input',()=>{clearTimeout(state._t);state._t=setTimeout(()=>render(),120)}));",
    "  $$('.page-editor input,.page-editor textarea').forEach(el=>el.addEventListener('input',()=>{clearTimeout(state._t);state._t=setTimeout(()=>render(),120)}));$('#body-font-size').addEventListener('change',()=>{state.page=0;render()});",
    'font size change binding'
  );

  if (!html.includes('id="body-font-size"') || !html.includes('font-size:${bodySize}px')) {
    throw new Error('[minibook-wordpress-fix] editor font size injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched MINI BOOK editor body font size');
}

function patchWordpressExporter() {
  const file = path.resolve('dist/game-notes/minibook-wordpress-v3/index.html');
  if (!fs.existsSync(file)) throw new Error(`[minibook-wordpress-fix] missing ${file}`);
  let html = fs.readFileSync(file, 'utf8');

  // Fix the split-export script wrapper so the exporter page itself parses.
  const lines = html.split('\n');
  const buildAllIndex = lines.findIndex((line) => line.includes('function buildAll(pages)'));
  if (buildAllIndex < 0) throw new Error('[minibook-wordpress-fix] buildAll function not found');
  lines[buildAllIndex] = "  function buildAll(pages){return buildHtmlCss(pages)+'\\n'+'<scr'+'ipt>'+exportJs()+'</scr'+'ipt>'}";
  html = lines.join('\n');

  // Explain the direct left/right tap controls in the exported reader.
  html = replaceOnce(
    html,
    '長文はページ内スクロール · 1ページ時は左右ドラッグ / ← → でめくる',
    '長文はページ内スクロール · 左半分タップで前へ / 右半分タップで次へ · 1ページ時は左右ドラッグでもめくれる',
    'tap help copy'
  );

  // Track vertical movement too, so a scroll gesture never becomes an accidental tap-to-turn.
  html = replaceOnce(
    html,
    "drag={id:e.pointerId,start:e.clientX,w:slot.getBoundingClientRect().width,active:false,dir:null,target:null,p:0}",
    "drag={id:e.pointerId,start:e.clientX,startY:e.clientY,w:slot.getBoundingClientRect().width,active:false,dir:null,target:null,p:0}",
    'single tap startY'
  );

  const oldPointerUp = "book.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;if(!drag.active){drag=null;return}var d=drag,slot=book.querySelector('[data-hw-single]');drag=null;anim=true;var commit=d.p>.2;tween(slot,d.p,commit?1:0,d.dir,260+Math.round(360*Math.abs((commit?1:0)-d.p)),function(){if(commit)index=d.target;anim=false;render()})});";
  const newPointerUp = "book.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;if(!drag.active){var d0=drag;drag=null;if(Math.abs(e.clientX-d0.start)>9||Math.abs(e.clientY-d0.startY)>12)return;if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,video,[contenteditable=\\\"true\\\"]'))return;var rect0=book.getBoundingClientRect();navigate(e.clientX<rect0.left+rect0.width/2?'prev':'next');return}var d=drag,slot=book.querySelector('[data-hw-single]');drag=null;anim=true;var commit=d.p>.2;tween(slot,d.p,commit?1:0,d.dir,260+Math.round(360*Math.abs((commit?1:0)-d.p)),function(){if(commit)index=d.target;anim=false;render()})});var spreadTap=null;book.addEventListener('pointerdown',function(e){if(mode!=='spread'||anim)return;if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,video,[contenteditable=\\\"true\\\"]'))return;spreadTap={id:e.pointerId,x:e.clientX,y:e.clientY}});book.addEventListener('pointerup',function(e){if(mode!=='spread'||!spreadTap||spreadTap.id!==e.pointerId)return;var s=spreadTap;spreadTap=null;if(Math.abs(e.clientX-s.x)>9||Math.abs(e.clientY-s.y)>12)return;var rect=book.getBoundingClientRect();navigate(e.clientX<rect.left+rect.width/2?'prev':'next')});book.addEventListener('pointercancel',function(){spreadTap=null;if(drag&&!drag.active)drag=null});";
  html = replaceOnce(html, oldPointerUp, newPointerUp, 'left-right tap navigation');

  if (html.includes("replace(/<\\\\/script/gi")) throw new Error('[minibook-wordpress-fix] broken script escape still present');
  if (html.includes('data-hw-zoom-reset') || html.includes("root.addEventListener('wheel'")) throw new Error('[minibook-wordpress-fix] zoom runtime unexpectedly present');
  if (!html.includes('var spreadTap=null') || !html.includes("navigate(e.clientX<rect0.left+rect0.width/2?'prev':'next')")) throw new Error('[minibook-wordpress-fix] tap navigation injection failed');

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched WordPress exporter + tap navigation');
}

patchCleanEditor();
patchWordpressExporter();
