import fs from 'node:fs';
import path from 'node:path';

const file=path.resolve('dist/game-notes/minibook-wordpress-v3/index.html');
if(!fs.existsSync(file)) throw new Error(`[minibook-reader-fit] missing ${file}`);

let html=fs.readFileSync(file,'utf8');

function replaceOnce(search,replacement,label){
  if(!html.includes(search)) throw new Error(`[minibook-reader-fit] ${label} pattern not found`);
  html=html.replace(search,replacement);
}

replaceOnce(
  'HTML+CSS / JS分離 · 1ページ / 見開き / ページ内スクロール / Hタグなし',
  'HTML+CSS / JS分離 · 1ページ / 見開き / 画面フィット / Hタグなし',
  'exporter header copy'
);

const resizeMarker="window.addEventListener('resize',function(){spreadBtn.disabled=isNarrow();if(isNarrow()&&mode==='spread')setMode('single')});setMode('single');updateFullLabel();";
const fitRuntime=`function fitReaderViewport(){
var reader=root.querySelector('.hw-minibook__reader'),toolbar=root.querySelector('.hw-minibook__toolbar');if(!reader)return;
var full=document.fullscreenElement===root||fallback;
if(full){reader.style.zoom='';reader.style.transform='';reader.style.transformOrigin='';reader.removeAttribute('data-hw-fit-scale');return}
reader.style.zoom='1';reader.style.transform='none';reader.style.transformOrigin='center center';
var vv=window.visualViewport,vh=vv?vv.height:window.innerHeight,vw=vv?vv.width:window.innerWidth;
var rootWidth=Math.min(root.clientWidth||vw,vw),toolbarH=toolbar?toolbar.getBoundingClientRect().height:0;
var availableW=Math.max(220,rootWidth-8),availableH=Math.max(240,vh-toolbarH-72),baseW=Math.max(1,reader.offsetWidth),baseH=Math.max(1,reader.offsetHeight);
var scale=Math.min(1,availableW/baseW,availableH/baseH);if(!isFinite(scale)||scale<=0)scale=1;scale=Math.max(.2,scale);
if(window.CSS&&CSS.supports&&CSS.supports('zoom','1')){reader.style.zoom=String(scale);reader.style.transform='none'}else{reader.style.zoom='';reader.style.transformOrigin='top center';reader.style.transform='scale('+scale+')'}
reader.setAttribute('data-hw-fit-scale',scale.toFixed(3));
}
var fitFrame=0;function scheduleReaderFit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(function(){requestAnimationFrame(fitReaderViewport)})}
var fitObserver=new MutationObserver(scheduleReaderFit);fitObserver.observe(book,{childList:true});
window.addEventListener('resize',function(){spreadBtn.disabled=isNarrow();if(isNarrow()&&mode==='spread')setMode('single');scheduleReaderFit()});
if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleReaderFit);
document.addEventListener('fullscreenchange',scheduleReaderFit);
setMode('single');updateFullLabel();scheduleReaderFit();`;
replaceOnce(resizeMarker,fitRuntime,'exported viewport fit runtime');

if(!html.includes('function fitReaderViewport()')||!html.includes("data-hw-fit-scale")||!html.includes('画面フィット')){
  throw new Error('[minibook-reader-fit] viewport fit injection failed');
}

fs.writeFileSync(file,html);
console.log('[minibook-reader-fit] fitted exported MINI BOOK reader to visual viewport');
