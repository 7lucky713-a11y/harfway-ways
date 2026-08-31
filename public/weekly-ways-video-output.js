(()=>{
  const baseWaysHtml=html;
  const videoInline='width:100%;height:auto;display:block;margin:15px 0 0;border:1px solid #111;background:#000;max-height:72vh;object-fit:contain';
  const waysProduction='https://harfway-playback.vercel.app/';
  const rawWaysId=source=>String(source?.id||'').replace(/^ways-/,'').trim();

  html=function(){
    const out=baseWaysHtml();
    const ids=[...gameIds];
    let index=0;
    return out.replace(/<article class="hw-game">[\s\S]*?<\/article>/g,article=>{
      const id=ids[index++];
      const source=item(id);
      const video=String(source?.video||'').trim();
      if(source?.type!=='WAYS'||!video)return article;
      const poster=String(source?.image||source?.thumbnailUrl||'').trim();
      const gameId=rawWaysId(source);
      const waysUrl=gameId?`${waysProduction}?game=${encodeURIComponent(gameId)}`:waysProduction;
      const videoHtml=`<video class="hw-game-video" controls playsinline preload="metadata"${poster?` poster="${esc(poster)}"`:''} style="${videoInline}"><source src="${esc(video)}" type="video/mp4">動画を再生できないブラウザです。</video>`;
      const waysLink=`<a class="hw-link hw-ways-video-link" href="${esc(waysUrl)}" data-ways-game="${esc(gameId)}" target="_blank" rel="noopener">WAYSで見る</a>`;
      const withoutImage=article.replace(/<img class="hw-game-image"[^>]*>/,'');
      const withoutLegacyRecord=withoutImage.replace(/<a class="hw-link"[^>]*>記録を見る<\/a>/,'');
      return withoutLegacyRecord.replace(/(<div class="hw-game-title">[\s\S]*?<\/div>)/,`$1${videoHtml}${waysLink}`);
    });
  };

  const style=document.createElement('style');
  style.textContent='.hw-game-video{width:100%;height:auto;display:block;margin:15px 0 0;border:1px solid #111;background:#000;max-height:72vh;object-fit:contain}.hw-ways-video-link{margin-top:11px}.ways-video-note{display:inline-flex;margin-top:6px;padding:4px 6px;border:1px solid #66711f;border-radius:999px;color:#eaff38;font:900 8px/1 ui-monospace,monospace;letter-spacing:.05em}';
  document.head.appendChild(style);

  const rewritePreviewWaysLinks=()=>{
    if(location.hostname==='harfway-playback.vercel.app')return;
    document.querySelectorAll('#preview .hw-ways-video-link[data-ways-game]').forEach(a=>{
      const gameId=String(a.dataset.waysGame||'').trim();
      if(gameId)a.href=`${location.origin}/?game=${encodeURIComponent(gameId)}`;
    });
  };

  const baseRenderPreview=renderPreview;
  renderPreview=function(){baseRenderPreview();rewritePreviewWaysLinks()};

  const baseRenderGamesSelected=renderGamesSelected;
  renderGamesSelected=function(){
    baseRenderGamesSelected();
    document.querySelectorAll('#gameSelected .sel').forEach(sel=>{
      const field=sel.querySelector('[data-gfield]');
      const id=field?.dataset?.id;
      if(!id||item(id)?.type!=='WAYS'||sel.querySelector('.ways-video-note'))return;
      const meta=sel.querySelector('.selmeta');
      if(meta){const note=document.createElement('span');note.className='ways-video-note';note.textContent='HTML出力：WAYS PLAYER LINK';meta.insertAdjacentElement('afterend',note)}
    });
  };

  try{renderGamesSelected();renderPreview()}catch{}
})();
