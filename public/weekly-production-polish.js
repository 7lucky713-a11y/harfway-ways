(()=>{
  const copyCssExtra=`
  .hw-log .hw-section-title,.hw-board .hw-section-title{margin:10px 0 14px;font-size:clamp(34px,6vw,62px);line-height:1;letter-spacing:-.055em;color:#111;font-weight:950}
  .hw-board .hw-section-title{color:#fff}
  .hw-game{padding:24px;margin:18px 0 0;border:1px solid #111;background:#fff;box-shadow:6px 6px 0 #111}
  .hw-game:first-of-type{margin-top:0}
  .hw-xembed{margin:18px 0 0;padding:14px;background:#f5f5f5;border:1px solid #cfd3d6}
  .hw-xembed .twitter-tweet{margin:0 auto!important}
  .hw-xfallback{display:inline-flex;margin-top:10px;color:#111;text-decoration:none;border-bottom:2px solid #111;font-size:12px;font-weight:900}
  .hw-game-section{display:flex;align-items:center;gap:12px;margin:38px 0 12px;padding:13px 15px;border:1px solid #111;font-weight:950;letter-spacing:-.02em}
  .hw-game-section-num{font:950 10px/1 ui-monospace,monospace;letter-spacing:.12em}
  .hw-game-section-label{font-size:20px;line-height:1.25}
  .hw-game-section-x{background:#111;color:#fff}
  .hw-game-section-ways{background:#eaff38;color:#111}
  .hw-game-section-other{background:#e9e9e9;color:#111}
  .hw-game-video{width:100%;display:block;margin:15px 0 0;border:1px solid #111;background:#000}
  @media(min-width:701px){
    .hw-kicker{font-size:13px}
    .hw-intro{font-size:18px;line-height:1.9}
    .hw-date{font-size:16px}.hw-date small{font-size:12px}
    .hw-pick{font-size:12px}.hw-game-kicker{font-size:11px}
    .hw-game-title{font-size:35px}
    .hw-game-text{font-size:18px;line-height:1.95}
    .hw-link,.hw-xfallback{font-size:15px}
    .hw-dbnote{font-size:16px;line-height:1.9}
    .hw-board-stat span{font-size:10px}
    .hw-update-label{font-size:11px}.hw-update-title{font-size:27px}
    .hw-update-text{font-size:15px;line-height:1.9}.hw-update a{font-size:13px}
    .hw-board-foot{font-size:13px;line-height:1.8}.hw-tags span{font-size:10px}
  }
  @media(max-width:700px){.hw-log,.hw-board,.hw-memo{padding:26px 20px}.hw-updates{grid-template-columns:1fr}.hw-update.feature{grid-row:auto;min-height:260px}.hw-game-title{font-size:26px}.hw-game{padding:18px;box-shadow:4px 4px 0 #111}.hw-game-section-label{font-size:17px}}
  `;

  if(!document.getElementById('weeklyOutputPolishPreviewStyle')){
    const previewStyle=document.createElement('style');
    previewStyle.id='weeklyOutputPolishPreviewStyle';
    previewStyle.textContent=copyCssExtra+`
      .weekly-ways-pager{display:flex;align-items:center;justify-content:center;gap:10px;margin:16px 0 0;padding:13px;border:1px solid #303943;border-radius:12px;background:#0d1014}
      .weekly-ways-pager[hidden]{display:none}
      .weekly-ways-pager-status{color:#9ca6b0;font:850 10px/1.4 ui-monospace,monospace}
      .weekly-ways-pager button{border:1px solid #eaff38;border-radius:9px;background:#eaff38;color:#090a0b;padding:9px 12px;font-size:10px;font-weight:950;cursor:pointer}
      .weekly-ways-pager button[hidden]{display:none}
    `;
    document.head.appendChild(previewStyle);
  }

  const legacyLead='平日に拾ったゲームを、週末にまとめて振り返ります。\n気になった作品は、Xの映像とHARF-WAYデータベースからどうぞ。';
  const neutralLead='平日に拾ったゲームを、週末にまとめて振り返ります。\n気になった作品は、XやWAYS、それぞれの記録からどうぞ。';
  const gameLead=document.getElementById('gameLead');
  if(gameLead&&gameLead.value===legacyLead)gameLead.value=neutralLead;
  const thirdStat=document.getElementById('thirdStat');
  if(thirdStat&&thirdStat.value==='ALL IN DATABASE')thirdStat.value='WEEKLY PICKS';

  const baseHtml=html;
  const stripMemoOutput=markup=>String(markup).replace(/<section class="hw-memo">[\s\S]*?<\/section>(?=<\/div>$)/,'');
  html=function(){
    return stripMemoOutput(baseHtml().replace(
      '<div class="hw-dbnote">今週登場したゲームは、HARF-WAYデータベースにも追加しています。</div>',
      '<div class="hw-dbnote">X / WAYS / HARF-WAY内の記録を、今週の紹介ログとしてまとめています。</div>'
    ));
  };

  const polishedBaseCss=String(wpCss)
    .replaceAll('.hw-log h2,.hw-board h2','.hw-log .hw-section-title,.hw-board .hw-section-title')
    .replaceAll('.hw-board .hw-kicker,.hw-board h2','.hw-board .hw-kicker,.hw-board .hw-section-title');
  const twitterScript='<scr'+'ipt async src="https://platform.twitter.com/widgets.js" charset="utf-8"></scr'+'ipt>';
  const bundle=()=>`<style>${polishedBaseCss}${copyCssExtra}</style>${html()}${twitterScript}`;

  const copyBundle=document.getElementById('copyBundle');
  if(copyBundle)copyBundle.onclick=()=>copy(bundle(),'HTML + CSSをコピーしました / WP COPY READY');
  const copyHtml=document.getElementById('copyHtml');
  if(copyHtml)copyHtml.onclick=()=>copy(`${html()}${twitterScript}`,'HTMLをコピーしました');

  const tools=document.querySelector('.editor .toolbar');
  if(tools&&!document.getElementById('weeklyWpCopyReady')){
    const badge=document.createElement('span');
    badge.id='weeklyWpCopyReady';
    badge.textContent='WP COPY READY';
    badge.style.cssText='display:inline-flex;align-items:center;padding:7px 9px;border:1px solid #7d8a22;border-radius:999px;color:#eaff38;font:900 8px/1 ui-monospace,monospace;letter-spacing:.08em';
    tools.appendChild(badge);
  }

  const WAYS_PAGE_SIZE=30;
  let waysVisibleLimit=WAYS_PAGE_SIZE;
  let waysFilterKey='';
  const baseFiltered=filtered;
  filtered=function(){
    const full=baseFiltered();
    if(mode!=='games')return full;
    const q=String(document.getElementById('query')?.value||'').trim().toLowerCase();
    const type=String(document.getElementById('typeFilter')?.value||'');
    const key=`${mode}|${q}|${type}|${payload?.generatedAt||''}`;
    if(key!==waysFilterKey){
      waysFilterKey=key;
      waysVisibleLimit=WAYS_PAGE_SIZE;
    }
    return full.slice(0,waysVisibleLimit);
  };

  function ensureWaysPager(){
    const cards=document.getElementById('cards');
    if(!cards)return null;
    let pager=document.getElementById('weeklyWaysPager');
    if(pager)return pager;
    pager=document.createElement('div');
    pager.id='weeklyWaysPager';
    pager.className='weekly-ways-pager';
    pager.innerHTML='<span class="weekly-ways-pager-status" id="weeklyWaysPagerStatus"></span><button type="button" id="weeklyWaysMore">さらに表示</button>';
    cards.insertAdjacentElement('afterend',pager);
    pager.querySelector('#weeklyWaysMore')?.addEventListener('click',()=>{
      waysVisibleLimit+=WAYS_PAGE_SIZE;
      renderCards();
    });
    return pager;
  }

  function updateWaysPager(){
    const pager=ensureWaysPager();
    if(!pager)return;
    if(mode!=='games'){
      pager.hidden=true;
      return;
    }
    const full=baseFiltered();
    const total=full.length;
    const shown=Math.min(waysVisibleLimit,total);
    const status=pager.querySelector('#weeklyWaysPagerStatus');
    const more=pager.querySelector('#weeklyWaysMore');
    if(status)status.textContent=`${shown} / ${total}件表示`;
    if(more){
      const remain=Math.max(0,total-shown);
      more.hidden=remain===0;
      more.textContent=remain?`さらに${Math.min(WAYS_PAGE_SIZE,remain)}件表示`:'すべて表示中';
    }
    pager.hidden=total===0;
  }

  const baseRenderCards=renderCards;
  renderCards=function(){
    baseRenderCards();
    updateWaysPager();
  };

  try{renderCards();renderPreview()}catch{}
})();
