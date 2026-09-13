(()=>{
  if(window.__MINIBOOK_DESIGN_LAYER__) return;
  window.__MINIBOOK_DESIGN_LAYER__=true;

  const STORAGE_KEY='harfway_minibook_design_v1';
  const DEFAULTS={bodyFontSize:15,writingMode:'horizontal'};
  const KINSOKU_SELECTOR='.book-page,.page-body,.run-body,.run-quote,.page-title,.run-title,.cover-title,.cover-sub,.after-list,.colophon-body';
  let design={...DEFAULTS};
  let fitRaf=0;

  try{
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(saved&&Number.isFinite(Number(saved.bodyFontSize))){
      design.bodyFontSize=Math.max(12,Math.min(18,Number(saved.bodyFontSize)));
    }
    if(saved?.writingMode==='vertical'||saved?.writingMode==='horizontal'){
      design.writingMode=saved.writingMode;
    }
  }catch{}

  function expose(){
    window.__MINIBOOK_DESIGN__={...design};
    window.dispatchEvent(new CustomEvent('minibook:designchange',{detail:{...design}}));
  }

  function applyJapaneseTypography(root=document){
    const nodes=[];
    if(root?.nodeType===1&&root.matches?.(KINSOKU_SELECTOR)) nodes.push(root);
    root?.querySelectorAll?.(KINSOKU_SELECTOR).forEach(el=>nodes.push(el));
    nodes.forEach(el=>{
      el.style.lineBreak='strict';
      el.style.wordBreak='normal';
      el.style.overflowWrap='break-word';
    });
  }

  function fitReaderToViewport(){
    const preview=document.querySelector('.preview');
    const reader=preview?.querySelector('.reader');
    if(!preview||!reader) return;

    document.documentElement.dataset.miniReaderFit='1';
    reader.style.zoom='1';
    reader.style.transform='none';
    reader.style.transformOrigin='center center';

    const cs=getComputedStyle(preview);
    const padX=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0);
    const padY=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);
    const availableWidth=Math.max(1,preview.clientWidth-padX);
    const availableHeight=Math.max(1,preview.clientHeight-padY);
    const baseWidth=Math.max(1,reader.offsetWidth);
    const baseHeight=Math.max(1,reader.offsetHeight);
    let scale=Math.min(1,availableWidth/baseWidth,availableHeight/baseHeight);
    if(!Number.isFinite(scale)||scale<=0) scale=1;
    scale=Math.max(.2,scale);

    if(window.CSS?.supports?.('zoom','1')){
      reader.style.zoom=String(scale);
      reader.style.transform='none';
    }else{
      reader.style.zoom='';
      reader.style.transform=`scale(${scale})`;
    }
    reader.dataset.miniFitScale=scale.toFixed(3);
  }

  function scheduleReaderFit(){
    cancelAnimationFrame(fitRaf);
    fitRaf=requestAnimationFrame(()=>requestAnimationFrame(fitReaderToViewport));
  }

  function apply(){
    const size=Math.max(12,Math.min(18,Number(design.bodyFontSize)||15));
    design.bodyFontSize=size;
    design.writingMode=design.writingMode==='vertical'?'vertical':'horizontal';
    document.documentElement.style.setProperty('--mini-design-body-size',size+'px');
    document.documentElement.dataset.miniWriting=design.writingMode;
    applyJapaneseTypography(document);
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(design))}catch{}
    expose();
    scheduleReaderFit();
  }

  function ensureStyle(){
    if(document.getElementById('minibook-design-layer-style')) return;
    const style=document.createElement('style');
    style.id='minibook-design-layer-style';
    style.textContent=`
      .page-body,.run-body,.after-list,.intro-body .page-body{font-size:var(--mini-design-body-size,15px)!important}
      .book-page,.page-body,.run-body,.run-quote,.page-title,.run-title,.cover-title,.cover-sub,.after-list,.colophon-body{line-break:strict;word-break:normal;overflow-wrap:break-word}

      /* Vertical writing is deliberately limited to RUN content.
         Page chrome, tags and special pages remain horizontal so the fixed B5 layout stays stable. */
      html[data-mini-writing="vertical"] .run-main{
        flex:1!important;
        width:100%!important;
        min-width:0!important;
        min-height:0!important;
        overflow:hidden!important;
        writing-mode:vertical-rl!important;
        text-orientation:mixed!important;
        line-break:strict!important;
      }
      html[data-mini-writing="vertical"] .run-main .run-title{
        margin:0!important;
        margin-block-end:16px!important;
        max-width:none!important;
        font-size:26px!important;
        line-height:1.42!important;
        letter-spacing:.02em!important;
      }
      html[data-mini-writing="vertical"] .run-main .run-quote{
        margin:0!important;
        margin-block-end:18px!important;
        padding:10px 12px!important;
        border-top:0!important;
        border-bottom:0!important;
        border-right:3px solid var(--book-ink)!important;
        border-left:1px solid var(--book-line)!important;
        font-size:18px!important;
        line-height:1.75!important;
      }
      html[data-mini-writing="vertical"] .run-main .run-body{
        margin:0!important;
        max-width:none!important;
        min-width:0!important;
        min-height:0!important;
        line-height:1.9!important;
        white-space:pre-wrap!important;
        overflow:hidden!important;
      }
      html[data-mini-writing="vertical"] .run-cont .run-title{
        font-size:17px!important;
        color:var(--book-muted)!important;
      }
      html[data-mini-writing="vertical"] .cont-mark{
        margin:0!important;
        margin-block-end:12px!important;
        padding:0 0 0 8px!important;
        border-top:0!important;
        border-left:1px solid var(--book-line)!important;
        writing-mode:vertical-rl!important;
      }
      @media(max-width:560px){
        html[data-mini-writing="vertical"] .run-main .run-title{font-size:19px!important;line-height:1.35!important}
        html[data-mini-writing="vertical"] .run-main .run-quote{font-size:13px!important;padding:7px 8px!important}
        html[data-mini-writing="vertical"] .run-main .run-body{line-height:1.7!important}
      }

      /* Reading viewport: keep the complete page + nav inside one visible screen.
         The B5 composition stays fixed; only the on-screen reader is scaled. */
      @media screen{
        html[data-mini-reader-fit="1"] .preview{
          height:calc(100dvh - 57px)!important;
          min-height:320px!important;
          overflow:hidden!important;
          align-items:center!important;
          align-content:center!important;
          justify-items:center!important;
        }
        html[data-mini-reader-fit="1"] .preview .reader{
          margin:0 auto!important;
          transform-origin:center center!important;
        }
      }

      #minibook-design-panel .design-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      #minibook-design-panel .design-title b{font:850 11px ui-monospace,monospace;letter-spacing:.11em;color:#dff238}
      #minibook-design-panel .design-title small{font-size:9px;color:#6d796f}
      #minibook-design-panel .design-control{display:grid;gap:6px;margin-bottom:10px}
      #minibook-design-panel .design-control:last-of-type{margin-bottom:0}
      #minibook-design-panel .design-control label{margin:0;font-size:9px;color:#8f9a91}
    `;
    document.head.appendChild(style);
  }

  function observePages(){
    if(window.__MINIBOOK_DESIGN_OBSERVER__||!document.body) return;
    window.__MINIBOOK_DESIGN_OBSERVER__=new MutationObserver(records=>{
      let changed=false;
      for(const record of records){
        record.addedNodes.forEach(node=>{
          if(node.nodeType===1){applyJapaneseTypography(node);changed=true}
        });
      }
      if(changed) scheduleReaderFit();
    });
    window.__MINIBOOK_DESIGN_OBSERVER__.observe(document.body,{childList:true,subtree:true});
  }

  function observeViewport(){
    if(window.__MINIBOOK_FIT_VIEWPORT_BOUND__) return;
    window.__MINIBOOK_FIT_VIEWPORT_BOUND__=true;
    window.addEventListener('resize',scheduleReaderFit,{passive:true});
    window.addEventListener('orientationchange',scheduleReaderFit,{passive:true});
    window.visualViewport?.addEventListener('resize',scheduleReaderFit,{passive:true});
    if('ResizeObserver' in window){
      const preview=document.querySelector('.preview');
      if(preview){
        window.__MINIBOOK_FIT_RESIZE_OBSERVER__=new ResizeObserver(scheduleReaderFit);
        window.__MINIBOOK_FIT_RESIZE_OBSERVER__.observe(preview);
      }
    }
  }

  function mount(){
    ensureStyle();
    observePages();
    const tools=document.querySelector('.tools');
    if(!tools) return false;
    if(document.getElementById('minibook-design-panel')){apply();observeViewport();scheduleReaderFit();return true}

    const panel=document.createElement('div');
    panel.className='group';
    panel.id='minibook-design-panel';
    panel.innerHTML=`
      <div class="design-title"><b>DESIGN</b><small>CONTENTとは独立</small></div>
      <div class="design-control">
        <label for="minibook-design-writing">WRITING</label>
        <select id="minibook-design-writing">
          <option value="horizontal">横書き / DEFAULT</option>
          <option value="vertical">縦書き / RUN本文</option>
        </select>
      </div>
      <div class="design-control">
        <label for="minibook-design-body-size">BODY TEXT</label>
        <select id="minibook-design-body-size">
          <option value="12">12px / SMALL</option>
          <option value="13">13px</option>
          <option value="14">14px</option>
          <option value="15">15px / DEFAULT</option>
          <option value="16">16px</option>
          <option value="18">18px / LARGE</option>
        </select>
      </div>
      <div class="hint">縦書きはRUN本文だけに適用し、ヘッダー・フッター・タグ・表紙は横組みを維持します。通常表示はB5組版を変えず、端末の可視領域に合わせて本全体を縮小し、ページ送りだけで読める高さへ収めます。</div>
    `;

    const format=[...tools.querySelectorAll('.group')].find(group=>group.querySelector('label')?.textContent?.trim()==='FORMAT');
    if(format) format.insertAdjacentElement('afterend',panel);
    else tools.appendChild(panel);

    const writing=panel.querySelector('#minibook-design-writing');
    const select=panel.querySelector('#minibook-design-body-size');
    writing.value=design.writingMode;
    select.value=String(design.bodyFontSize);
    writing.addEventListener('change',()=>{
      design={...design,writingMode:writing.value==='vertical'?'vertical':'horizontal'};
      apply();
    });
    select.addEventListener('change',()=>{
      design={...design,bodyFontSize:Number(select.value)||15};
      apply();
    });

    apply();
    observeViewport();
    scheduleReaderFit();
    return true;
  }

  window.__MINIBOOK_DESIGN_API__={
    get:()=>({...design}),
    set:next=>{design={...design,...(next||{})};apply()},
    applyJapaneseTypography:()=>applyJapaneseTypography(document),
    fitReaderToViewport:()=>{fitReaderToViewport()}
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
