(() => {
  const API='/api/game-glossary-publications';
  const state={entries:new Map(),loading:false,drafts:new Map()};
  const $=(s,r=document)=>r.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
      .glossary-publication-url{display:grid;gap:8px;flex-basis:100%;width:100%;font-size:12px;font-weight:800;color:var(--text)}
      .glossary-publication-url-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--line);border-radius:7px;padding:9px 12px;background:#111713}
      .glossary-publication-url-row span{font:600 11px ui-monospace,monospace;color:var(--muted);overflow-wrap:anywhere}
      .glossary-publication-url input{flex:1;min-width:155px;border:0;outline:0;background:#111713;color:var(--text);font-size:14px;padding:4px}
      .glossary-publication-url input:focus-visible{outline:2px solid #dff238;outline-offset:3px}
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
    const root=document.createElement('div');root.id='glossary-publication';root.className='glossary-publication';foot.prepend(root);root.addEventListener('click',onAction);root.addEventListener('input',e=>{if(e.target.id==='glossary-public-slug'&&entryId())state.drafts.set(entryId(),e.target.value)});render();
  }
  function current(){return state.entries.get(entryId())||null}
  function render(){
    ensureControls();const root=$('#glossary-publication');if(!root)return;const id=entryId(),pub=id?current():null;
    if(!id){root.innerHTML=`<span class="glossary-publication-state">非公開</span><button type="button" disabled>保存後に公開</button><span class="glossary-publication-help">新しい用語は先に「保存する」でPrivate Glossaryとして確定してください。</span>`;return}
    const draft=state.drafts.has(id)?state.drafts.get(id):(pub?.publicSlug||'');
    const slugField=`<label class="glossary-publication-url">公開URLの末尾<div class="glossary-publication-url-row"><span>ways.harf-way.com/words/</span><input id="glossary-public-slug" type="text" maxlength="110" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="空欄なら自動生成" value="${esc(draft)}"></div></label>`;
    if(pub){root.innerHTML=`<span class="glossary-publication-state on">公開中</span>${slugField}<button type="button" class="primary" data-glossary-public-action="update">公開内容を更新</button><button type="button" data-glossary-public-action="save-url">URLだけ保存</button><a href="${esc(pub.url)}?latest=${encodeURIComponent(pub.snapshotUpdatedAt||"now")}" target="_blank" rel="noopener">公開ページを見る ↗</a><button type="button" class="danger" data-glossary-public-action="remove">公開解除</button><span class="glossary-publication-help">Private Glossaryの変更は自動反映されません。「公開内容を更新」を押した時だけ公開snapshotを更新します。URLだけの保存では、編集中の説明文を公開しません。以前の公開URLは新しいURLへ自動転送します。</span>`}
    else{root.innerHTML=`<span class="glossary-publication-state">非公開</span>${slugField}<button type="button" class="primary" data-glossary-public-action="publish">読者向けに公開</button><span class="glossary-publication-help">現在の保存済み内容から「用語解説」用snapshotを作ります。Private Glossary自体は公開されません。</span>`}
  }
  async function refresh(){
    if(state.loading)return;state.loading=true;try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)return;const d=await r.json();state.entries=new Map((d.entries||[]).map(x=>[String(x.id),x]));render()}catch{}finally{state.loading=false}
  }
  function toast(message,bad=false){const el=$('#toast');if(!el)return;el.textContent=message;el.style.background=bad?'#8d4848':'';el.classList.add('on');clearTimeout(el._publicationTimer);el._publicationTimer=setTimeout(()=>{el.classList.remove('on');el.style.background=''},2000)}
  async function mutate(method,id,settings={}){const r=await fetch(API,{method,headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({glossaryId:id,...settings}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`http_${r.status}`);return d}
  async function onAction(event){
    const b=event.target.closest('[data-glossary-public-action]');if(!b)return;event.preventDefault();const id=entryId();if(!id)return;
    const action=b.dataset.glossaryPublicAction;
    const publicSlug=$('#glossary-public-slug')?.value.trim()||'';
    if(action==='save-url'){
      if(!confirm('公開URLを変更しますか？以前のURLからは自動転送されます。公開済みの説明文は変更しません。'))return;
      b.disabled=true;try{await mutate('PUT',id,{publicSlug});state.drafts.delete(id);await refresh();toast('公開URLを保存しました')}catch(e){toast(`URLの保存に失敗: ${e.message}`,true)}finally{b.disabled=false}return;
    }
    if(action==='remove'){
      if(!confirm('読者向け公開を解除しますか？ Private Glossaryは残ります。'))return;
      b.disabled=true;try{await mutate('DELETE',id);await refresh();toast('公開を解除しました')}catch(e){toast(`公開解除に失敗: ${e.message}`,true)}finally{b.disabled=false}return;
    }
    const message=action==='publish'?'現在の保存済み内容を「用語解説」として公開します。編集中の変更がある場合は、先に「保存する」で確定してください。':'現在の保存済み内容で公開snapshotを更新します。編集中の変更は含まれません。';
    if(!confirm(message))return;b.disabled=true;try{await mutate(action==='publish'?'POST':'PATCH',id,{publicSlug});state.drafts.delete(id);await refresh();toast(action==='publish'?'公開しました':'公開内容を更新しました')}catch(e){toast(`公開処理に失敗: ${e.message}`,true)}finally{b.disabled=false}
  }
  installStyles();ensurePublicIndexLink();ensureControls();refresh();
  const overlay=$('#entry-overlay');if(overlay)new MutationObserver(()=>{if(editorOpen()){setTimeout(()=>{render();refresh()},0)}}).observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  let last='';setInterval(()=>{if(!editorOpen())return;const id=entryId();if(id!==last){last=id;render()}},350);
})();
