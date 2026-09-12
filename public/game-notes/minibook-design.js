(()=>{
  if(window.__MINIBOOK_DESIGN_LAYER__) return;
  window.__MINIBOOK_DESIGN_LAYER__=true;

  const STORAGE_KEY='harfway_minibook_design_v1';
  const DEFAULTS={bodyFontSize:15};
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

  function apply(){
    const size=Math.max(12,Math.min(18,Number(design.bodyFontSize)||15));
    design.bodyFontSize=size;
    document.documentElement.style.setProperty('--mini-design-body-size',size+'px');
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(design))}catch{}
    expose();
  }

  function ensureStyle(){
    if(document.getElementById('minibook-design-layer-style')) return;
    const style=document.createElement('style');
    style.id='minibook-design-layer-style';
    style.textContent=`
      .page-body,.run-body,.after-list,.intro-body .page-body{font-size:var(--mini-design-body-size,15px)!important}
      #minibook-design-panel .design-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      #minibook-design-panel .design-title b{font:850 11px ui-monospace,monospace;letter-spacing:.11em;color:#dff238}
      #minibook-design-panel .design-title small{font-size:9px;color:#6d796f}
      #minibook-design-panel .design-control{display:grid;gap:6px}
      #minibook-design-panel .design-control label{margin:0;font-size:9px;color:#8f9a91}
    `;
    document.head.appendChild(style);
  }

  function mount(){
    ensureStyle();
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
      <div class="hint">GAME NOTESの取得・ページ内容・PAGE EDITORには触れず、表示デザインだけ変更します。</div>
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
    set:next=>{design={...design,...(next||{})};apply()}
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
