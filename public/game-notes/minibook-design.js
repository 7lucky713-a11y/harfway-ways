(()=>{
  if(window.__MINIBOOK_DESIGN_LAYER__) return;
  window.__MINIBOOK_DESIGN_LAYER__=true;

  const STORAGE_KEY='harfway_minibook_design_v1';
  const DEFAULTS={bodyFontSize:15};
  const KINSOKU_SELECTOR='.book-page,.page-body,.run-body,.run-quote,.page-title,.run-title,.cover-title,.cover-sub,.after-list,.colophon-body';
  let design={...DEFAULTS};

  try{
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(saved&&Number.isFinite(Number(saved.bodyFontSize))){
      design.bodyFontSize=Math.max(12,Math.min(18,Number(saved.bodyFontSize)));
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

  function apply(){
    const size=Math.max(12,Math.min(18,Number(design.bodyFontSize)||15));
    design.bodyFontSize=size;
    document.documentElement.style.setProperty('--mini-design-body-size',size+'px');
    applyJapaneseTypography(document);
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(design))}catch{}
    expose();
  }

  function ensureStyle(){
    if(document.getElementById('minibook-design-layer-style')) return;
    const style=document.createElement('style');
    style.id='minibook-design-layer-style';
    style.textContent=`
      .page-body,.run-body,.after-list,.intro-body .page-body{font-size:var(--mini-design-body-size,15px)!important}
      .book-page,.page-body,.run-body,.run-quote,.page-title,.run-title,.cover-title,.cover-sub,.after-list,.colophon-body{line-break:strict;word-break:normal;overflow-wrap:break-word}
      #minibook-design-panel .design-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      #minibook-design-panel .design-title b{font:850 11px ui-monospace,monospace;letter-spacing:.11em;color:#dff238}
      #minibook-design-panel .design-title small{font-size:9px;color:#6d796f}
      #minibook-design-panel .design-control{display:grid;gap:6px}
      #minibook-design-panel .design-control label{margin:0;font-size:9px;color:#8f9a91}
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
      <div class="hint">GAME NOTESの取得・ページ内容・PAGE EDITORには触れず、表示デザインだけ変更します。日本語の行頭・行末禁則も常時適用します。</div>
    `;

    const format=[...tools.querySelectorAll('.group')].find(group=>group.querySelector('label')?.textContent?.trim()==='FORMAT');
    if(format) format.insertAdjacentElement('afterend',panel);
    else tools.appendChild(panel);

    const select=panel.querySelector('#minibook-design-body-size');
    select.value=String(design.bodyFontSize);
    select.addEventListener('change',()=>{
      design={...design,bodyFontSize:Number(select.value)||15};
      apply();
    });

    apply();
    return true;
  }

  window.__MINIBOOK_DESIGN_API__={
    get:()=>({...design}),
    set:next=>{design={...design,...(next||{})};apply()},
    applyJapaneseTypography:()=>applyJapaneseTypography(document)
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
