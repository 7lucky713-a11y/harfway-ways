(()=>{
  if(window.__MINIBOOK_DESIGN_LAYER__) return;
  window.__MINIBOOK_DESIGN_LAYER__=true;

  const STORAGE_KEY='harfway_minibook_design_v1';
  const PRESETS={
    relaxed:{verticalCharsPerColumn:32,verticalColumns:9,horizontalCharsPerLine:25,horizontalLines:16},
    standard:{verticalCharsPerColumn:36,verticalColumns:12,horizontalCharsPerLine:28,horizontalLines:18},
    dense:{verticalCharsPerColumn:40,verticalColumns:14,horizontalCharsPerLine:32,horizontalLines:20}
  };
  const DEFAULTS={
    bodyFontSize:15,
    writingMode:'horizontal',
    densityPreset:'standard',
    ...PRESETS.standard
  };
  const KINSOKU_SELECTOR='.book-page,.page-body,.run-body,.run-quote,.page-title,.run-title,.cover-title,.cover-sub,.after-list,.colophon-body';
  let design={...DEFAULTS};

  const clamp=(min,max,value)=>Math.max(min,Math.min(max,Number(value)));

  try{
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(saved&&typeof saved==='object') design={...design,...saved};
  }catch{}

  function normalize(){
    design.bodyFontSize=clamp(12,18,design.bodyFontSize||15);
    design.writingMode=design.writingMode==='vertical'?'vertical':'horizontal';
    design.densityPreset=['relaxed','standard','dense','custom'].includes(design.densityPreset)?design.densityPreset:'standard';
    design.verticalCharsPerColumn=Math.round(clamp(24,48,design.verticalCharsPerColumn||DEFAULTS.verticalCharsPerColumn));
    design.verticalColumns=Math.round(clamp(6,18,design.verticalColumns||DEFAULTS.verticalColumns));
    design.horizontalCharsPerLine=Math.round(clamp(20,40,design.horizontalCharsPerLine||DEFAULTS.horizontalCharsPerLine));
    design.horizontalLines=Math.round(clamp(12,26,design.horizontalLines||DEFAULTS.horizontalLines));
  }

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

  function currentGrid(){
    if(design.writingMode==='vertical'){
      return {
        unitLabel:'1列の文字数',
        countLabel:'本文列数',
        units:design.verticalCharsPerColumn,
        count:design.verticalColumns,
        firstRatio:.74
      };
    }
    return {
      unitLabel:'1行の文字数',
      countLabel:'本文行数',
      units:design.horizontalCharsPerLine,
      count:design.horizontalLines,
      firstRatio:.62
    };
  }

  function estimateCapacity(){
    const grid=currentGrid();
    const bodyScale=15/design.bodyFontSize;
    const layoutScale=Math.max(.34,Math.min(1,Number(window.__MINIBOOK_LAYOUT__?.capacityScale||1)));
    const base=grid.units*grid.count*bodyScale*layoutScale;
    return {first:Math.max(1,Math.round(base*grid.firstRatio)),next:Math.max(1,Math.round(base)),layoutScale};
  }

  function syncControls(){
    const panel=document.getElementById('minibook-design-panel');
    if(!panel) return;
    const writing=panel.querySelector('#minibook-design-writing');
    const size=panel.querySelector('#minibook-design-body-size');
    const unit=panel.querySelector('#minibook-density-unit');
    const count=panel.querySelector('#minibook-density-count');
    const unitLabel=panel.querySelector('[data-density-unit-label]');
    const countLabel=panel.querySelector('[data-density-count-label]');
    const estimate=panel.querySelector('[data-density-estimate]');
    if(writing) writing.value=design.writingMode;
    if(size) size.value=String(design.bodyFontSize);
    const grid=currentGrid();
    if(unit){
      unit.value=String(grid.units);
      unit.min=design.writingMode==='vertical'?'24':'20';
      unit.max=design.writingMode==='vertical'?'48':'40';
    }
    if(count){
      count.value=String(grid.count);
      count.min=design.writingMode==='vertical'?'6':'12';
      count.max=design.writingMode==='vertical'?'18':'26';
    }
    if(unitLabel) unitLabel.textContent=grid.unitLabel;
    if(countLabel) countLabel.textContent=grid.countLabel;
    panel.querySelectorAll('[data-density-preset]').forEach(btn=>{
      btn.classList.toggle('active',design.densityPreset===btn.dataset.densityPreset);
    });
    if(estimate){
      const cap=estimateCapacity();
      estimate.textContent=`現在の目安：最初のRUN 約${cap.first}字 / 続き 約${cap.next}字${cap.layoutScale<.99?'（端末補正込み）':''}`;
    }
  }

  function apply(){
    normalize();
    document.documentElement.style.setProperty('--mini-design-body-size',design.bodyFontSize+'px');
    document.documentElement.dataset.miniWriting=design.writingMode;
    applyJapaneseTypography(document);
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(design))}catch{}
    expose();
    syncControls();
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

      #minibook-design-panel .design-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      #minibook-design-panel .design-title b{font:850 11px ui-monospace,monospace;letter-spacing:.11em;color:#dff238}
      #minibook-design-panel .design-title small{font-size:9px;color:#6d796f}
      #minibook-design-panel .design-control{display:grid;gap:6px;margin-bottom:10px}
      #minibook-design-panel .design-control:last-of-type{margin-bottom:0}
      #minibook-design-panel .design-control label{margin:0;font-size:9px;color:#8f9a91}
      #minibook-design-panel .density-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      #minibook-design-panel .density-presets button{border:1px solid #414f46;background:#101511;color:#aeb8b0;border-radius:8px;padding:8px 5px;font-size:10px;font-weight:850;cursor:pointer}
      #minibook-design-panel .density-presets button.active{border-color:#dff238;background:#202617;color:#dff238}
      #minibook-design-panel .density-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      #minibook-design-panel .density-grid input{width:100%;min-width:0}
      #minibook-design-panel .density-estimate{margin-top:7px;padding:8px 9px;border:1px solid #2d3831;border-radius:8px;background:#0f1411;color:#9fac9f;font:800 9px ui-monospace,monospace;line-height:1.55}
    `;
    document.head.appendChild(style);
  }

  function observePages(){
    if(window.__MINIBOOK_DESIGN_OBSERVER__||!document.body) return;
    window.__MINIBOOK_DESIGN_OBSERVER__=new MutationObserver(records=>{
      for(const record of records){
        record.addedNodes.forEach(node=>{
          if(node.nodeType===1) applyJapaneseTypography(node);
        });
      }
    });
    window.__MINIBOOK_DESIGN_OBSERVER__.observe(document.body,{childList:true,subtree:true});
  }

  function applyPreset(name){
    const preset=PRESETS[name];
    if(!preset) return;
    design={...design,...preset,densityPreset:name};
    apply();
  }

  function mount(){
    ensureStyle();
    observePages();
    const tools=document.querySelector('.tools');
    if(!tools) return false;
    if(document.getElementById('minibook-design-panel')){apply();return true}

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
      <div class="design-control">
        <label>DENSITY PRESET</label>
        <div class="density-presets">
          <button type="button" data-density-preset="relaxed">ゆったり</button>
          <button type="button" data-density-preset="standard">標準</button>
          <button type="button" data-density-preset="dense">ぎっしり</button>
        </div>
      </div>
      <div class="design-control">
        <label>DETAIL</label>
        <div class="density-grid">
          <div><label data-density-unit-label for="minibook-density-unit">1行の文字数</label><input id="minibook-density-unit" type="number" step="1"></div>
          <div><label data-density-count-label for="minibook-density-count">本文行数</label><input id="minibook-density-count" type="number" step="1"></div>
        </div>
        <div class="density-estimate" data-density-estimate></div>
      </div>
      <div class="hint">密度はページ分割の目安です。縦書きは「1列の文字数 × 本文列数」、横書きは「1行の文字数 × 本文行数」で調整します。最初のRUNはタイトル・引用ぶんを自動で差し引き、端末が小さい場合はLAYOUT側の安全補正もかかります。</div>
    `;

    const format=[...tools.querySelectorAll('.group')].find(group=>group.querySelector('label')?.textContent?.trim()==='FORMAT');
    if(format) format.insertAdjacentElement('afterend',panel);
    else tools.appendChild(panel);

    const writing=panel.querySelector('#minibook-design-writing');
    const size=panel.querySelector('#minibook-design-body-size');
    const unit=panel.querySelector('#minibook-density-unit');
    const count=panel.querySelector('#minibook-density-count');

    writing.addEventListener('change',()=>{
      design={...design,writingMode:writing.value==='vertical'?'vertical':'horizontal'};
      apply();
    });
    size.addEventListener('change',()=>{
      design={...design,bodyFontSize:Number(size.value)||15};
      apply();
    });
    panel.querySelectorAll('[data-density-preset]').forEach(btn=>btn.addEventListener('click',()=>applyPreset(btn.dataset.densityPreset)));
    unit.addEventListener('change',()=>{
      if(design.writingMode==='vertical') design.verticalCharsPerColumn=Number(unit.value);
      else design.horizontalCharsPerLine=Number(unit.value);
      design.densityPreset='custom';
      apply();
    });
    count.addEventListener('change',()=>{
      if(design.writingMode==='vertical') design.verticalColumns=Number(count.value);
      else design.horizontalLines=Number(count.value);
      design.densityPreset='custom';
      apply();
    });

    window.addEventListener('minibook:layoutchange',syncControls);
    apply();
    return true;
  }

  window.__MINIBOOK_DESIGN_API__={
    get:()=>({...design}),
    set:next=>{design={...design,...(next||{})};apply()},
    applyPreset,
    applyJapaneseTypography:()=>applyJapaneseTypography(document)
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
