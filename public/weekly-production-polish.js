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
  @media(max-width:700px){.hw-log,.hw-board,.hw-memo{padding:26px 20px}.hw-updates{grid-template-columns:1fr}.hw-update.feature{grid-row:auto;min-height:260px}.hw-game-title{font-size:26px}.hw-game{padding:18px;box-shadow:4px 4px 0 #111}.hw-game-section-label{font-size:17px}}
  `;

  const baseHtml=html;
  html=function(){
    return baseHtml().replace(
      '<div class="hw-dbnote">今週登場したゲームは、HARF-WAYデータベースにも追加しています。</div>',
      '<div class="hw-dbnote">X / WAYS / HARF-WAY内の記録を、今週の紹介ログとしてまとめています。</div>'
    );
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

  try{renderPreview()}catch{}
})();
