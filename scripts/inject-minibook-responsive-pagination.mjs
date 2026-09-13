import fs from 'node:fs';
import path from 'node:path';

function patchCleanLayout(){
  const file=path.resolve('dist/game-notes/minibook-clean/index.html');
  if(!fs.existsSync(file)) throw new Error(`[minibook-responsive-pagination] missing ${file}`);
  let html=fs.readFileSync(file,'utf8');

  const oldLimits="vertical=window.__MINIBOOK_DESIGN__?.writingMode==='vertical',scale=15/bodySize,firstLimit=Math.max(vertical?160:190,Math.min(vertical?260:320,Math.round((vertical?210:260)*scale))),nextLimit=Math.max(vertical?250:320,Math.min(vertical?430:540,Math.round((vertical?330:420)*scale)))";
  const newLimits="vertical=window.__MINIBOOK_DESIGN__?.writingMode==='vertical',scale=15/bodySize,layoutScale=Math.max(.34,Math.min(1,Number(window.__MINIBOOK_LAYOUT__?.capacityScale||1))),firstLimit=Math.max(vertical?70:90,Math.min(vertical?260:320,Math.round((vertical?210:260)*scale*layoutScale))),nextLimit=Math.max(vertical?110:150,Math.min(vertical?430:540,Math.round((vertical?330:420)*scale*layoutScale)))";
  if(!html.includes(oldLimits)) throw new Error('[minibook-responsive-pagination] pagination limits pattern not found');
  html=html.replace(oldLimits,newLimits);

  const oldListener="window.addEventListener('minibook:designchange',()=>{if(state.games.length)render()});";
  const newListener=oldListener+"window.addEventListener('minibook:layoutchange',()=>{if(state.games.length)render()});";
  if(!html.includes(oldListener)) throw new Error('[minibook-responsive-pagination] design listener pattern not found');
  html=html.replace(oldListener,newListener);

  if(!html.includes('__MINIBOOK_LAYOUT__?.capacityScale')||!html.includes("minibook:layoutchange")){
    throw new Error('[minibook-responsive-pagination] clean layout patch failed');
  }
  fs.writeFileSync(file,html);
}

function patchWrapper(){
  const file=path.resolve('dist/game-notes/minibook/index.html');
  if(!fs.existsSync(file)) throw new Error(`[minibook-responsive-pagination] missing ${file}`);
  let html=fs.readFileSync(file,'utf8');
  const needle='    frame.srcdoc=html;';
  if(!html.includes(needle)) throw new Error('[minibook-responsive-pagination] wrapper srcdoc pattern not found');
  html=html.replace(needle,"    html=html.replace('</body>','<scr'+'ipt src=\"/game-notes/minibook-layout.js\"></scr'+'ipt></body>');\n    frame.srcdoc=html;");
  if(!html.includes('/game-notes/minibook-layout.js')) throw new Error('[minibook-responsive-pagination] wrapper layout script injection failed');
  fs.writeFileSync(file,html);
}

patchCleanLayout();
patchWrapper();
console.log('[minibook-responsive-pagination] responsive page capacity enabled without text scaling');
