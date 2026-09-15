(() => {
  const API='/api/game-glossary-publications';
  const state={entries:new Map(),loading:false};
  const $=(s,r=document)=>r.querySelector(s);
  const authHeaders=(extra={})=>{const key=sessionStorage.getItem('harfway_game_notes_key')||'';return{...extra,...(key?{'x-admin-key':key}:{})}};
  const entryId=()=>String($('#entry-id')?.value||'').trim();
  const editorOpen=()=>Boolean($('#entry-overlay')?.classList.contains('on'));

  function installStyles(){
    if($('#glossary-publication-styles'))return;
    const style=document.createElement('style');style.id='glossary-publication-styles';style.textContent=`
      .glossary-public-index{display:inline-flex;align-items:center;justify-content:center;margin-left:auto;border:1px solid var(--line);background:#171d19;color:var(--text);border-radius:10px;padding:10px 13px;font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap}
      .glossary-public-index:hover{border-color:#65736a;color:#fff}
      .glossary-publication{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-basis:100%;width:100%;padding:10px 0 4px;border-top:1px solid rgba(255,255,255,.08)}
      .glossary-publication-state{border:1px solid var(--line);border-radius:999px;padding:7px 9px;font:850 10px ui-monospace,monospace;letter-spacing:.04em;color:#89958b;background:#111713}
      .glossary-publication-state.on{border-color:#dff238;color:#111610;background:#dff238}
      .glossary-publication button,.glossary-publication a{border:1px solid var(--line);background:#171d19;color:var(--text);border-radius:8px;padding:9px 11px;font-size:12px;font-weight:850;text-decoration:none;cursor:pointer}
      .glossary-publication button.primary{background:#dff238;border-color:#dff238;color:#111610}.glossary-publication button.danger{color:#d79b9b;border-color:#684b4b;background:#211616}
      .glossary-publication button:disabled{opacity:.42;cursor:not-allowed}.glossary-publication-help{width:100%;font-size:10px;color:var(--muted);line-height:1.5}
      @media(max-width:700px){.glossary-public-index{margin-left:0}.glossary-publication button,.glossary-publication a{flex:1;text-align:center;min-width:130px}}
    `;document.head.appendChild(style);
  }
  function ensurePublicIndexLink(){
    if($('#glossary-public-index-link'))return;
    const top=$('.wrap > .top');if(!top)return;
    const link=document.createElement('a');
    link.id='glossary-public-index-link';link.className='glossary-public-index';link.href='/words/';link.target='_blank';link.rel='noopener';link.textContent='公開用語解説 ↗';
    const add=$('#open-entry',top);if(add)top.insertBefore(link,add);else top.appendChild(link);
  }
  function ensureControls(){
    const foot=$('#entry-form .dialog-foot');if(!foot||$('#glossary-publication'))return;
    foot.style.flexWrap='wrap';
    const root=document.createElement('div');root.id='glossary-publication';root.className='glossary-publication';foot.prepend(root);root.addEventListener('click',onAction);render();
  }
  function current(){return state.entries.get(entryId())||null}
  function render(){
    ensureControls();const root=$('#glossary-publication');if(!root)return;const id=entryId(),pub=id?current():null;
    if(!id){root.innerHTML=`<span class="glossary-publication-state">非公開</span><button type="button" disabled>保存後に公開</button><span class="glossary-publication-help">新しい用語は先に「保存する」でPrivate Glossaryとして確定してください。</span>`;return}
    if(pub){root.innerHTML=`<span class="glossary-publication-state on">公開中</span><button type="button" class="primary" data-glossary-public-action="update">公開内容を更新</button><a href="/words/?word=${encodeURIComponent(id)}" target="_blank" rel="noopener">公開ページを見る ↗</a><button type="button" class="danger" data-glossary-public-action="remove">公開解除</button><span class="glossary-publication-help">Private Glossaryの変更は自動反映されません。「公開内容を更新」を押した時だけ公開snapshotを更新します。</span>`}
    else{root.innerHTML=`<span class="glossary-publication-state">非公開</span><button type="button" class="primary" data-glossary-public-action="publish">読者向けに公開</button><span class="glossary-publication-help">現在の保存済み内容から「用語解説」用snapshotを作ります。Private Glossary自体は公開されません。</span>`}
  }
  async function refresh(){
    if(state.loading)return;state.loading=true;try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)return;const d=await r.json();state.entries=new Map((d.entries||[]).map(x=>[String(x.id),x]));render()}catch{}finally{state.loading=false}
  }
  function toast(message,bad=false){const el=$('#toast');if(!el)return;el.textContent=message;el.style.background=bad?'#8d4848':'';el.classList.add('on');clearTimeout(el._publicationTimer);el._publicationTimer=setTimeout(()=>{el.classList.remove('on');el.style.background=''},2000)}
  async function mutate(method,id){const r=await fetch(API,{method,headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({glossaryId:id}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`http_${r.status}`);return d}
  async function onAction(event){
    const b=event.target.closest('[data-glossary-public-action]');if(!b)return;event.preventDefault();const id=entryId();if(!id)return;
    const action=b.dataset.glossaryPublicAction;
    if(action==='remove'){
      if(!confirm('読者向け公開を解除しますか？ Private Glossaryは残ります。'))return;
      b.disabled=true;try{await mutate('DELETE',id);await refresh();toast('公開を解除しました')}catch(e){toast(`公開解除に失敗: ${e.message}`,true)}finally{b.disabled=false}return;
    }
    const message=action==='publish'?'現在の保存済み内容を「用語解説」として公開します。編集中の変更がある場合は、先に「保存する」で確定してください。':'現在の保存済み内容で公開snapshotを更新します。編集中の変更は含まれません。';
    if(!confirm(message))return;b.disabled=true;try{await mutate(action==='publish'?'POST':'PATCH',id);await refresh();toast(action==='publish'?'公開しました':'公開内容を更新しました')}catch(e){toast(`公開処理に失敗: ${e.message}`,true)}finally{b.disabled=false}
  }
  installStyles();ensurePublicIndexLink();ensureControls();refresh();
  const overlay=$('#entry-overlay');if(overlay)new MutationObserver(()=>{if(editorOpen()){setTimeout(()=>{render();refresh()},0)}}).observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  let last='';setInterval(()=>{if(!editorOpen())return;const id=entryId();if(id!==last){last=id;render()}},350);
})();
