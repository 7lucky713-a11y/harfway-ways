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
    '<div class="group"><label>FORMAT</label><div class="format-card"><b>B5 / 182 × 257 mm</b><small>FULL NOTES · EDITABLE FRONT/BACK MATTER · FLUID PAGE SWIPE</small></div></div><div class="group"><label>TEXT SIZE</label><select id="body-font-size"><option value="12">12px / SMALL</option><option value="13">13px</option><option value="14">14px</option><option value="15" selected>15px / DEFAULT</option><option value="16">16px</option><option value="18">18px / LARGE</option></select><div class="hint">GAME NOTES本文・INTRO・AFTER・COLOPHONの本文サイズ。</div></div>',
    'text size editor control'
  );

  html = replaceOnce(
    html,
    '</head>',
    '<style>.page-body,.run-body,.after-list{font-size:var(--mini-body-size,15px)!important}</style></head>',
    'body size css variable'
  );

  html = replaceOnce(
    html,
    "  $$('.page-editor input,.page-editor textarea').forEach(el=>el.addEventListener('input',()=>{clearTimeout(state._t);state._t=setTimeout(()=>render(),120)}));",
    "  $$('.page-editor input,.page-editor textarea').forEach(el=>el.addEventListener('input',()=>{clearTimeout(state._t);state._t=setTimeout(()=>render(),120)}));const applyBodyFontSize=()=>{const v=Math.max(12,Math.min(18,Number($('#body-font-size')?.value||15)));document.documentElement.style.setProperty('--mini-body-size',v+'px')};$('#body-font-size').addEventListener('change',applyBodyFontSize);applyBodyFontSize();",
    'font size change binding'
  );

  const oldLoad = "  async function load(){showStatus('GAME NOTESを読み込んでいます…');const headers=state.adminKey?{'x-admin-key':state.adminKey}:{};const res=await fetch('/api/game-notes',{headers,cache:'no-store'}),data=await res.json().catch(()=>({}));if(res.status===401){showStatus('管理キーを入力するとGAME NOTESを読み込めます。',true);$('#book').innerHTML='<div class=\"empty\">GAME NOTESへの認証が必要です。</div>';return}if(!res.ok){showStatus(`読み込みに失敗しました: ${data.error||res.status}`);return}state.games=data.games||[];state.notes=data.notes||[];state.facets=data.facets||[];showStatus('');renderGames()}";
  const newLoad = "  function gameNotesApiUrl(){let token='';try{const searches=[location.search,window.parent?.location?.search,window.top?.location?.search];for(const search of searches){const v=new URLSearchParams(search||'').get('_vercel_share');if(v){token=v;break}}}catch{}return token?`/api/game-notes?_vercel_share=${encodeURIComponent(token)}`:'/api/game-notes'}\n  async function load(){showStatus('GAME NOTESを読み込んでいます…');const headers=state.adminKey?{'x-admin-key':state.adminKey}:{},controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const res=await fetch(gameNotesApiUrl(),{headers,cache:'no-store',signal:controller.signal}),data=await res.json().catch(()=>({}));if(res.status===401){showStatus('管理キーを入力するとGAME NOTESを読み込めます。',true);$('#book').innerHTML='<div class=\"empty\">GAME NOTESへの認証が必要です。</div>';return}if(!res.ok){showStatus(`読み込みに失敗しました: ${data.error||res.status}`);$('#book').innerHTML='<div class=\"empty\">GAME NOTESを読み込めませんでした。</div>';return}state.games=data.games||[];state.notes=data.notes||[];state.facets=data.facets||[];showStatus('');renderGames()}catch(err){const timeout=err?.name==='AbortError';showStatus(timeout?'GAME NOTESの読み込みがタイムアウトしました。ページを再読み込みしてください。':`読み込みに失敗しました: ${err?.message||err}`);$('#book').innerHTML='<div class=\"empty\">GAME NOTESを読み込めませんでした。ページを再読み込みしてください。</div>'}finally{clearTimeout(timer)}}";
  html = replaceOnce(html, oldLoad, newLoad, 'preview share token and load timeout');

  if (!html.includes('id="body-font-size"') || !html.includes('--mini-body-size') || !html.includes('gameNotesApiUrl') || !html.includes('_vercel_share')) {
    throw new Error('[minibook-wordpress-fix] editor injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched MINI BOOK editor body font size + preview API auth');
}

function patchWordpressExporter() {
  const file = path.resolve('dist/game-notes/minibook-wordpress-v3/index.html');
  if (!fs.existsSync(file)) throw new Error(`[minibook-wordpress-fix] missing ${file}`);
  let html = fs.readFileSync(file, 'utf8');

  const lines = html.split('\n');
  const buildAllIndex = lines.findIndex((line) => line.includes('function buildAll(pages)'));
  if (buildAllIndex < 0) throw new Error('[minibook-wordpress-fix] buildAll function not found');
  lines[buildAllIndex] = "  function buildAll(pages){return buildHtmlCss(pages)+'\\n'+'<scr'+'ipt>'+exportJs()+'</scr'+'ipt>'}";
  html = lines.join('\n');

  html = replaceOnce(
    html,
    '長文はページ内スクロール · 1ページ時は左右ドラッグ / ← → でめくる',
    '長文はページ内スクロール · 左半分タップで前へ / 右半分タップで次へ · 1ページ時は左右ドラッグでもめくれる',
    'tap help copy'
  );

  html = replaceOnce(
    html,
    "function publicPageHtml(doc){\n    const nodes=[...doc.querySelectorAll('#print-stack .print-page')];",
    "function publicPageHtml(doc){\n    const bodySize=Math.max(12,Math.min(18,Number(doc.querySelector('#body-font-size')?.value||15)));\n    const nodes=[...doc.querySelectorAll('#print-stack .print-page')];",
    'export selected body size'
  );

  html = replaceOnce(
    html,
    '      const clone=node.cloneNode(true);',
    "      const clone=node.cloneNode(true);clone.querySelectorAll('.page-body,.run-body,.after-list').forEach(el=>el.style.fontSize=bodySize+'px');",
    'inline exported body size'
  );

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
  if (!html.includes('var spreadTap=null') || !html.includes('const bodySize=Math.max(12')) throw new Error('[minibook-wordpress-fix] exporter injection failed');

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched WordPress exporter + tap navigation + font size export');
}

patchCleanEditor();
patchWordpressExporter();
