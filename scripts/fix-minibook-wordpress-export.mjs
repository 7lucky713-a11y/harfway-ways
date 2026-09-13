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
    "function notePages(n,index){const run=runNumber(n,index),label=String(run).padStart(2,'0'),bodySize=Math.max(12,Math.min(18,Number(window.__MINIBOOK_DESIGN__?.bodyFontSize||15))),vertical=window.__MINIBOOK_DESIGN__?.writingMode==='vertical',scale=15/bodySize,firstLimit=Math.max(vertical?160:190,Math.min(vertical?260:320,Math.round((vertical?210:260)*scale))),nextLimit=Math.max(vertical?250:320,Math.min(vertical?430:540,Math.round((vertical?330:420)*scale))),chunks=paginate(n.body,firstLimit,nextLimit),tags=tagsOf(n),out=[];",
    'font / writing-mode aware run pagination'
  );

  replaceOnce(
    "  $('#game').addEventListener('change',onGame);",
    "  window.addEventListener('minibook:designchange',()=>{if(state.games.length)render()});\n  $('#game').addEventListener('change',onGame);",
    'design-change repagination'
  );

  replaceOnce(
    "<div class=\"reader-nav\"><button data-nav=\"prev\" ${i===0?'disabled':''}>← 前</button><div class=\"progress\">B5 · PAGE ${i+1} / ${pages.length}</div><button data-nav=\"next\" ${i===pages.length-1?'disabled':''}>次 →</button></div>",
    "<div class=\"reader-nav\"><button data-nav=\"next\" ${i===pages.length-1?'disabled':''}>← 次</button><div class=\"progress\">B5 · PAGE ${i+1} / ${pages.length}</div><button data-nav=\"prev\" ${i===0?'disabled':''}>前 →</button></div>",
    'reverse reader nav order'
  );

  replaceOnce(
    "document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;if(e.key==='ArrowLeft')animatePage(state.page-1,'prev');if(e.key==='ArrowRight')animatePage(state.page+1,'next')});",
    "document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;if(e.key==='ArrowLeft')animatePage(state.page+1,'next');if(e.key==='ArrowRight')animatePage(state.page-1,'prev')});",
    'reverse keyboard page direction'
  );

  if (!html.includes("vertical=window.__MINIBOOK_DESIGN__?.writingMode==='vertical'") || !html.includes("window.addEventListener('minibook:designchange'") || !html.includes('← 次') || !html.includes("ArrowLeft')animatePage(state.page+1")) {
    throw new Error('[minibook-wordpress-fix] layout pagination / writing-mode / binding injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched MINI BOOK safe vertical pagination + reverse binding controls');
}

function patchMinibookWrapper() {
  const file = path.resolve('dist/game-notes/minibook/index.html');
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
    '    frame.srcdoc=html;',
    "    html=html.replace('</body>','<scr'+'ipt src=\"/game-notes/minibook-design.js\"></scr'+'ipt></body>');\n    frame.srcdoc=html;",
    'design layer mount'
  );

  replaceOnce(
    '左右の端をタップ / ドラッグ / ← → でめくる',
    '左側で次へ / 右側で前へ · ドラッグ方向も同じ',
    'reverse binding help copy'
  );

  replaceOnce(
    "state.drag={id:e.pointerId,startX:e.clientX,lastX:e.clientX,startAt:performance.now(),lastAt:performance.now(),active:false,dir:null,next:null,width:stage.getBoundingClientRect().width,progress:0}",
    "state.drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,startAt:performance.now(),lastAt:performance.now(),active:false,dir:null,next:null,width:stage.getBoundingClientRect().width,progress:0}",
    'click start coordinates'
  );

  replaceOnce(
    "const dir=dx<0?'next':'prev',next=state.page+(dir==='next'?1:-1);",
    "const dir=dx>0?'next':'prev',next=state.page+(dir==='next'?1:-1);",
    'reverse drag direction'
  );

  replaceOnce(
    "const directional=d.dir==='next'?-dx:dx;",
    "const directional=d.dir==='next'?dx:-dx;",
    'reverse drag progress'
  );

  replaceOnce(
    "const wave=Math.sin(Math.PI*p),foldW=4+17*wave,angle=(dir==='next'?-1:1)*(8+70*wave);",
    "const wave=Math.sin(Math.PI*p),foldW=4+17*wave,angle=(dir==='next'?1:-1)*(8+70*wave);",
    'reverse curl angle'
  );

  const oldCurl = `    if(dir==='next'){
      const x=(1-p)*100;
      current.style.clipPath='inset(0 '+(p*100).toFixed(3)+'% 0 0)';
      fold.style.left=x.toFixed(3)+'%';
      shadow.style.left=x.toFixed(3)+'%';
    }else{
      const x=p*100;
      current.style.clipPath='inset(0 0 0 '+(p*100).toFixed(3)+'%)';
      fold.style.left=x.toFixed(3)+'%';
      shadow.style.left=x.toFixed(3)+'%';
    }`;
  const newCurl = `    if(dir==='next'){
      const x=p*100;
      current.style.clipPath='inset(0 0 0 '+(p*100).toFixed(3)+'%)';
      fold.style.left=x.toFixed(3)+'%';
      shadow.style.left=x.toFixed(3)+'%';
    }else{
      const x=(1-p)*100;
      current.style.clipPath='inset(0 '+(p*100).toFixed(3)+'% 0 0)';
      fold.style.left=x.toFixed(3)+'%';
      shadow.style.left=x.toFixed(3)+'%';
    }`;
  replaceOnce(oldCurl, newCurl, 'reverse curl edge');

  replaceOnce(
    '.curl-stage.curl-next .curl-shadow{transform:translateX(-58%)}',
    '.curl-stage.curl-next .curl-shadow{transform:translateX(-42%) scaleX(-1)}',
    'reverse next shadow'
  );
  replaceOnce(
    '.curl-stage.curl-prev .curl-shadow{transform:translateX(-42%) scaleX(-1)}',
    '.curl-stage.curl-prev .curl-shadow{transform:translateX(-58%)}',
    'reverse prev shadow'
  );

  replaceOnce(
    "if(!d.active||!stage){state.drag=null;return}",
    "if(!d.active||!stage){state.drag=null;if(!stage)return;if(Math.abs(e.clientX-d.startX)>8||Math.abs(e.clientY-d.startY)>10)return;if(e.target?.closest?.('video,a,input,textarea,select,[contenteditable=\\\"true\\\"]'))return;const rect=stage.getBoundingClientRect(),dir=e.clientX<rect.left+rect.width/2?'next':'prev';state.suppressClickUntil=performance.now()+280;animatePage(state.page+(dir==='next'?1:-1),dir);return}",
    'reverse half-click navigation'
  );

  if (!html.includes('/game-notes/minibook-design.js') || !html.includes('startY:e.clientY') || !html.includes("dir=e.clientX<rect.left+rect.width/2?'next':'prev'") || !html.includes("const dir=dx>0?'next':'prev'") || !html.includes('左側で次へ / 右側で前へ')) {
    throw new Error('[minibook-wordpress-fix] wrapper reverse-binding injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] attached design layer + reversed MINI BOOK binding direction');
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

  const lines = html.split('\n');
  const buildAllIndex = lines.findIndex((line) => line.includes('function buildAll(pages)'));
  if (buildAllIndex < 0) {
    throw new Error('[minibook-wordpress-fix] buildAll function not found');
  }
  lines[buildAllIndex] = "  function buildAll(pages){return buildHtmlCss(pages)+'\\n'+'<scr'+'ipt>'+exportJs()+'</scr'+'ipt>'}";
  html = lines.join('\n');

  replaceOnce(
    "  function publicPageHtml(doc){\n    const nodes=[...doc.querySelectorAll('#print-stack .print-page')];",
    "  function publicPageHtml(doc){\n    const bodySize=Math.max(12,Math.min(18,Number(doc.defaultView?.__MINIBOOK_DESIGN__?.bodyFontSize||15)));\n    const writingMode=doc.defaultView?.__MINIBOOK_DESIGN__?.writingMode==='vertical'?'vertical':'horizontal';\n    const nodes=[...doc.querySelectorAll('#print-stack .print-page')];",
    'design state export'
  );
  replaceOnce(
    '      const clone=node.cloneNode(true);',
    "      const clone=node.cloneNode(true);clone.querySelectorAll('.page-body,.run-body,.after-list').forEach(el=>el.style.fontSize=bodySize+'px');if(writingMode==='vertical')clone.querySelector('.book-page')?.classList.add('mini-writing-vertical');",
    'body size / writing mode freeze'
  );

  replaceOnce(
    "function exportCss(){return `<style>\n.hw-minibook,.hw-minibook *{box-sizing:border-box}",
    "function exportCss(){return `<style>\n.hw-minibook,.hw-minibook *{box-sizing:border-box}\n.hw-minibook .mini-writing-vertical .hw-mb-run-main{flex:1!important;width:100%!important;min-width:0!important;min-height:0!important;overflow:hidden!important;writing-mode:vertical-rl!important;text-orientation:mixed!important;line-break:strict!important}.hw-minibook .mini-writing-vertical .hw-mb-run-title{margin:0!important;margin-block-end:16px!important;max-width:none!important;font-size:26px!important;line-height:1.42!important;letter-spacing:.02em!important}.hw-minibook .mini-writing-vertical .hw-mb-run-quote{margin:0!important;margin-block-end:18px!important;padding:10px 12px!important;border-top:0!important;border-bottom:0!important;border-right:3px solid var(--hw-mb-ink)!important;border-left:1px solid var(--hw-mb-line)!important;font-size:18px!important;line-height:1.75!important}.hw-minibook .mini-writing-vertical .hw-mb-run-body{margin:0!important;max-width:none!important;min-width:0!important;min-height:0!important;line-height:1.9!important;white-space:pre-wrap!important;overflow:hidden!important}.hw-minibook .mini-writing-vertical.hw-mb-run-cont .hw-mb-run-title,.hw-minibook .mini-writing-vertical .hw-mb-run-cont .hw-mb-run-title{font-size:17px!important;color:var(--hw-mb-muted)!important}@media(max-width:560px){.hw-minibook .mini-writing-vertical .hw-mb-run-title{font-size:19px!important;line-height:1.35!important}.hw-minibook .mini-writing-vertical .hw-mb-run-quote{font-size:13px!important;padding:7px 8px!important}.hw-minibook .mini-writing-vertical .hw-mb-run-body{line-height:1.7!important}}",
    'vertical writing export css'
  );

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

  replaceOnce(
    '長文はページ内スクロール · 1ページ時は左右ドラッグ / ← → でめくる',
    '長文は自動で複数ページに分割 · 左半分タップで次へ / 右半分タップで前へ · ドラッグ方向も同じ',
    'reverse binding help copy'
  );

  replaceOnce(
    "drag={id:e.pointerId,start:e.clientX,w:slot.getBoundingClientRect().width,active:false,dir:null,target:null,p:0}",
    "drag={id:e.pointerId,start:e.clientX,startY:e.clientY,w:slot.getBoundingClientRect().width,active:false,dir:null,target:null,p:0}",
    'single tap startY'
  );

  replaceOnce(
    "function blank(){return '<div class=\"hw-minibook__slot hw-minibook__slot--left hw-minibook__slot--blank\"></div>'}",
    "function blank(){return '<div class=\"hw-minibook__slot hw-minibook__slot--right hw-minibook__slot--blank\"></div>'}",
    'reverse cover blank side'
  );

  replaceOnce(
    "function renderSingle(){book.innerHTML='<div class=\"hw-minibook__slot hw-minibook__slot--right\" data-hw-single>'+scrollPage(index)+'</div>'}function renderSpread(){if(index===0){book.innerHTML=blank()+'<div class=\"hw-minibook__slot hw-minibook__slot--right\">'+scrollPage(0)+'</div>';return}var left=index,right=index+1;book.innerHTML='<div class=\"hw-minibook__slot hw-minibook__slot--left\">'+scrollPage(left)+'</div><div class=\"hw-minibook__slot hw-minibook__slot--right\">'+(right<pages.length?scrollPage(right):'')+'</div>'}",
    "function renderSingle(){book.innerHTML='<div class=\"hw-minibook__slot hw-minibook__slot--left\" data-hw-single>'+scrollPage(index)+'</div>'}function renderSpread(){if(index===0){book.innerHTML='<div class=\"hw-minibook__slot hw-minibook__slot--left\">'+scrollPage(0)+'</div>'+blank();return}var right=index,left=index+1;book.innerHTML='<div class=\"hw-minibook__slot hw-minibook__slot--left\">'+(left<pages.length?scrollPage(left):'')+'</div><div class=\"hw-minibook__slot hw-minibook__slot--right\">'+scrollPage(right)+'</div>'}",
    'reverse spread page order'
  );

  replaceOnce(
    "var wave=Math.sin(Math.PI*p),w=4+17*wave,a=(dir==='next'?-1:1)*(8+70*wave),x;if(dir==='next'){x=(1-p)*100;cur.style.clipPath='inset(0 '+(p*100)+'% 0 0)'}else{x=p*100;cur.style.clipPath='inset(0 0 0 '+(p*100)+'%)'}",
    "var wave=Math.sin(Math.PI*p),w=4+17*wave,a=(dir==='next'?1:-1)*(8+70*wave),x;if(dir==='next'){x=p*100;cur.style.clipPath='inset(0 0 0 '+(p*100)+'%)'}else{x=(1-p)*100;cur.style.clipPath='inset(0 '+(p*100)+'% 0 0)'}",
    'reverse exported curl edge'
  );

  replaceOnce(
    "drag.dir=dx<0?'next':'prev';drag.target=drag.dir==='next'?index+1:index-1;",
    "drag.dir=dx>0?'next':'prev';drag.target=drag.dir==='next'?index+1:index-1;",
    'reverse exported drag direction'
  );
  replaceOnce(
    "drag.p=Math.max(0,Math.min(1,(drag.dir==='next'?-dx:dx)/(drag.w||1)));",
    "drag.p=Math.max(0,Math.min(1,(drag.dir==='next'?dx:-dx)/(drag.w||1)));",
    'reverse exported drag progress'
  );

  const oldPointerUp = "book.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;if(!drag.active){drag=null;return}var d=drag,slot=book.querySelector('[data-hw-single]');drag=null;anim=true;var commit=d.p>.2;tween(slot,d.p,commit?1:0,d.dir,260+Math.round(360*Math.abs((commit?1:0)-d.p)),function(){if(commit)index=d.target;anim=false;render()})});";
  const newPointerUp = "book.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;if(!drag.active){var d0=drag;drag=null;if(Math.abs(e.clientX-d0.start)>9||Math.abs(e.clientY-d0.startY)>12)return;if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,video,[contenteditable=\\\"true\\\"]'))return;var rect0=book.getBoundingClientRect();navigate(e.clientX<rect0.left+rect0.width/2?'next':'prev');return}var d=drag,slot=book.querySelector('[data-hw-single]');drag=null;anim=true;var commit=d.p>.2;tween(slot,d.p,commit?1:0,d.dir,260+Math.round(360*Math.abs((commit?1:0)-d.p)),function(){if(commit)index=d.target;anim=false;render()})});var spreadTap=null;book.addEventListener('pointerdown',function(e){if(mode!=='spread'||anim)return;if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,video,[contenteditable=\\\"true\\\"]'))return;spreadTap={id:e.pointerId,x:e.clientX,y:e.clientY}});book.addEventListener('pointerup',function(e){if(mode!=='spread'||!spreadTap||spreadTap.id!==e.pointerId)return;var s=spreadTap;spreadTap=null;if(Math.abs(e.clientX-s.x)>9||Math.abs(e.clientY-s.y)>12)return;var rect=book.getBoundingClientRect();navigate(e.clientX<rect.left+rect.width/2?'next':'prev')});book.addEventListener('pointercancel',function(){spreadTap=null;if(drag&&!drag.active)drag=null});";
  replaceOnce(oldPointerUp, newPointerUp, 'reverse left-right tap navigation');

  replaceOnce(
    "if(e.key==='ArrowLeft')navigate('prev');if(e.key==='ArrowRight')navigate('next')",
    "if(e.key==='ArrowLeft')navigate('next');if(e.key==='ArrowRight')navigate('prev')",
    'reverse exported keyboard direction'
  );

  replaceOnce(
    '<div class=\"hw-minibook__nav\"><button type=\"button\" data-hw-prev>← 前</button><div class=\"hw-minibook__progress\"></div><button type=\"button\" data-hw-next>次 →</button></div>',
    '<div class=\"hw-minibook__nav\"><button type=\"button\" data-hw-next>← 次</button><div class=\"hw-minibook__progress\"></div><button type=\"button\" data-hw-prev>前 →</button></div>',
    'reverse exported nav order'
  );

  if (html.includes("replace(/<\\\\/script/gi")) {
    throw new Error('[minibook-wordpress-fix] broken script escape still present');
  }
  if (html.includes('data-hw-zoom-reset') || html.includes("root.addEventListener('wheel'")) {
    throw new Error('[minibook-wordpress-fix] zoom runtime unexpectedly present');
  }
  if (!html.includes('var spreadTap=null') || !html.includes("navigate(e.clientX<rect0.left+rect0.width/2?'next':'prev')") || !html.includes("writingMode=doc.defaultView?.__MINIBOOK_DESIGN__?.writingMode") || !html.includes('mini-writing-vertical') || !html.includes('左半分タップで次へ') || !html.includes("drag.dir=dx>0?'next':'prev'") || !html.includes('← 次')) {
    throw new Error('[minibook-wordpress-fix] exporter vertical / reverse-binding injection failed');
  }

  fs.writeFileSync(file, html);
  console.log('[minibook-wordpress-fix] patched exporter + safe vertical writing + reversed binding');
}

patchMinibookLayout();
patchMinibookWrapper();
patchWordpressExporter();