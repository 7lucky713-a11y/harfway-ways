(()=>{
  const baseWaysHtml=html;
  const videoInline='width:100%;height:auto;display:block;margin:15px 0 0;border:1px solid #111;background:#000;max-height:72vh;object-fit:contain';

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
      const videoHtml=`<video class="hw-game-video" controls playsinline preload="metadata"${poster?` poster="${esc(poster)}"`:''} style="${videoInline}"><source src="${esc(video)}" type="video/mp4">動画を再生できないブラウザです。</video>`;
      const withoutImage=article.replace(/<img class="hw-game-image"[^>]*>/,'');
      return withoutImage.replace(/(<div class="hw-game-title">[\s\S]*?<\/div>)/,`$1${videoHtml}`);
    });
  };

  const style=document.createElement('style');
  style.textContent='.hw-game-video{width:100%;height:auto;display:block;margin:15px 0 0;border:1px solid #111;background:#000;max-height:72vh;object-fit:contain}.ways-video-note{display:inline-flex;margin-top:6px;padding:4px 6px;border:1px solid #66711f;border-radius:999px;color:#eaff38;font:900 8px/1 ui-monospace,monospace;letter-spacing:.05em}';
  document.head.appendChild(style);

  const baseRenderGamesSelected=renderGamesSelected;
  renderGamesSelected=function(){
    baseRenderGamesSelected();
    document.querySelectorAll('#gameSelected .sel').forEach(sel=>{
      const field=sel.querySelector('[data-gfield]');
      const id=field?.dataset?.id;
      if(!id||item(id)?.type!=='WAYS'||sel.querySelector('.ways-video-note'))return;
      const meta=sel.querySelector('.selmeta');
      if(meta){const note=document.createElement('span');note.className='ways-video-note';note.textContent='HTML出力：WAYS VIDEO';meta.insertAdjacentElement('afterend',note)}
    });
  };

  try{renderGamesSelected();renderPreview()}catch{}
})();
