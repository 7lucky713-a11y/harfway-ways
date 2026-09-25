(() => {
  const API='/api/game-note-publications';
  const state={entries:new Map(),loading:false,drafts:new Map()};
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const authHeaders=(extra={})=>{const key=sessionStorage.getItem('harfway_game_notes_key')||'';return{...extra,...(key?{'x-admin-key':key}:{})}};
  const noteId=()=>String($('#note-id')?.value||'').trim();
  const noteOpen=()=>Boolean($('#note-overlay')?.classList.contains('on'));

  function installStyles(){
    if($('#game-note-publication-styles'))return;
    const style=document.createElement('style');style.id='game-note-publication-styles';style.textContent=`
      .gn-public-index{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line2);background:#171d19;color:var(--text);border-radius:8px;padding:9px 11px;font-size:12px;font-weight:850;text-decoration:none;white-space:nowrap}
      .gn-public-index:hover{border-color:#647369;color:#fff}
      .gn-publication{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;flex:1 1 100%;order:-1}
      #note-form .dialog-foot{flex-wrap:wrap}
      .gn-publication-state{border:1px solid var(--line);border-radius:999px;padding:7px 9px;font:850 10px ui-monospace,monospace;letter-spacing:.06em;color:#859188;background:#111713}
      .gn-publication-state.on{border-color:#dff238;color:#111610;background:#dff238}
      .gn-publication button,.gn-publication a{border:1px solid var(--line2);background:#171d19;color:var(--text);border-radius:8px;padding:9px 11px;font-size:12px;font-weight:850;text-decoration:none;cursor:pointer}
      .gn-publication button.primary{background:#dff238;border-color:#dff238;color:#111610}.gn-publication button.danger{color:#d79b9b;border-color:#684b4b;background:#211616}
      .gn-publication button:disabled{opacity:.42;cursor:not-allowed}.gn-publication-help{width:100%;font-size:10px;color:var(--muted);line-height:1.5}
      .gn-public-seo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;width:100%;padding:10px;border:1px solid var(--line2);border-radius:8px;background:#101711}
      .gn-public-seo label{display:flex;flex-direction:column;gap:5px;min-width:0;color:#d6e3d7;font-size:11px;font-weight:800}.gn-public-seo input{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--line2);border-radius:6px;padding:10px;background:#1c2620;color:var(--text);font-size:12px}.gn-public-seo input:focus{outline:2px solid #8ead77}.gn-public-seo .hint{grid-column:1/-1;margin:0;color:var(--muted);font-size:10px;line-height:1.6;overflow-wrap:anywhere}
      @media(max-width:700px){.gn-public-seo{grid-template-columns:1fr}}
      @media(max-width:700px){.gn-public-index{padding:8px 10px;font-size:11px}.gn-publication{width:100%;order:-1}.gn-publication button,.gn-publication a{flex:1;text-align:center;min-width:130px}.gn-publication-help{flex-basis:100%}}
    `;document.head.appendChild(style);
  }
  function ensurePublicIndexLink(){
    if($('#game-note-public-index-link'))return;
    const top=$('.main > .top');if(!top)return;
    const link=document.createElement('a');
    link.id='game-note-public-index-link';link.className='gn-public-index';link.href='/notes/';link.target='_blank';link.rel='noopener';link.textContent='公開プレイノート ↗';
    const dig=$('#dig',top);if(dig)top.insertBefore(link,dig);else top.appendChild(link);
  }
  function ensurePageSettingsLink(){
    if($('#game-note-page-settings-link'))return;
    const top=$('.main > .top');if(!top)return;
    const link=document.createElement('a');
    link.id='game-note-page-settings-link';link.className='gn-public-index';
    link.href='/game-notes/page-settings/';
    link.textContent='ページ設定 ⚙';
    const dig=$('#dig',top);if(dig)top.insertBefore(link,dig);else top.appendChild(link);
  }
  function ensureControls(){
    const foot=$('#note-form .dialog-foot');if(!foot||$('#game-note-publication'))return;
    const root=document.createElement('div');root.id='game-note-publication';root.className='gn-publication';foot.prepend(root);root.addEventListener('click',onAction);root.addEventListener('input',event=>{const field=event.target.dataset.publicField,id=noteId();if(!field||!id)return;const draft=state.drafts.get(id)||{};draft[field]=event.target.value;state.drafts.set(id,draft)});root.addEventListener('keydown',event=>{if(event.target.matches('[data-public-field]')&&event.key==='Enter')event.preventDefault()});render();
  }
  function current(){return state.entries.get(noteId())||null}
  function settingsFields(pub,id){
    const draft=state.drafts.get(id)||{};
    const seo=esc(draft.seoTitle??pub?.seoTitle??'');
    const slug=esc(draft.publicSlug??pub?.publicSlug??'');
    return `<div class="gn-public-seo">
      <label>検索向け公開タイトル<input data-public-field="seoTitle" value="${seo}" maxlength="90" placeholder="空欄ならメモのタイトルを使用" autocomplete="off" /></label>
      <label>URLの末尾<input data-public-field="publicSlug" value="${slug}" maxlength="150" placeholder="公開時に自動設定" autocomplete="off" spellcheck="false" /></label>
      <p class="hint">公開タイトルは記事の見出しと検索結果用titleに使います。URLは初回公開時に固定。後から変更しても旧URLは新URLへ転送されます。</p>
    </div>`;
  }
  function render(){
    ensureControls();const root=$('#game-note-publication');if(!root)return;const id=noteId(),pub=id?current():null;
    if(!id){root.innerHTML=`<span class="gn-publication-state">PUBLIC OFF</span><button type="button" disabled>保存後に公開</button><span class="gn-publication-help">新規メモは先に「保存する」でPrivate Noteとして確定してください。</span>`;return}
    const fields=settingsFields(pub,id);
    if(pub){root.innerHTML=`<span class="gn-publication-state on">PUBLIC ON</span><button type="button" class="primary" data-public-action="update">公開内容を更新</button><a href="${esc(pub.url||('/notes/?note='+encodeURIComponent(id)))}" target="_blank" rel="noopener">公開ページを見る ↗</a><button type="button" class="danger" data-public-action="remove">公開解除</button>${fields}<button type="button" data-public-action="save-seo">公開タイトル・URL設定を保存</button><span class="gn-publication-help">公開本文は「公開内容を更新」を押したときだけ更新されます。タイトル・URL設定だけの保存ではPrivate本文を再公開しません。</span>`}
    else{root.innerHTML=`<span class="gn-publication-state">PUBLIC OFF</span>${fields}<button type="button" class="primary" data-public-action="publish">読者向けに公開</button><span class="gn-publication-help">現在の保存済み内容から公開snapshotを作ります。Private Note自体は公開されません。</span>`}
  }
  async function refresh(){
    if(state.loading)return;state.loading=true;try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)return;const d=await r.json();state.entries=new Map((d.entries||[]).map(x=>[String(x.id),x]));render()}catch{}finally{state.loading=false}
  }
  function toast(message,bad=false){let el=$('#publication-toast');if(!el){el=document.createElement('div');el.id='publication-toast';el.className='toast';document.body.appendChild(el)}el.textContent=message;el.style.background=bad?'#8d4848':'';el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),1900)}
  async function mutate(method,id,settings={}){const r=await fetch(API,{method,headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({noteId:id,...settings}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`http_${r.status}`);return d}
  async function onAction(event){
    const b=event.target.closest('[data-public-action]');if(!b)return;event.preventDefault();const id=noteId();if(!id)return;
    const action=b.dataset.publicAction;
    if(action==='remove'){
      if(!confirm('読者向け公開を解除しますか？ Private Noteは残ります。'))return;
      b.disabled=true;try{await mutate('DELETE',id);state.drafts.delete(id);await refresh();toast('公開を解除しました')}catch(e){toast(`公開解除に失敗: ${e.message}`,true)}finally{b.disabled=false}return;
    }
    const root=$('#game-note-publication'),seoTitle=root.querySelector('[data-public-field="seoTitle"]')?.value.trim()||'',publicSlug=root.querySelector('[data-public-field="publicSlug"]')?.value.trim()||'';
    const previous=current();
    if(previous&&publicSlug&&publicSlug!==previous.publicSlug&&!confirm('公開URLを変更しますか？ 旧URLから新URLへ転送されます。'))return;
    if(action==='save-seo'){
      b.disabled=true;try{await mutate('PUT',id,{seoTitle,publicSlug});state.drafts.delete(id);await refresh();toast('公開タイトル・URL設定を保存しました')}catch(e){toast(`公開設定の保存に失敗: ${e.message}`,true)}finally{b.disabled=false}return;
    }
    const message=action==='publish'?'現在の保存済み内容を読者向けに公開します。編集中の変更は先に「保存する」で確定してください。':'現在の保存済み内容で公開snapshotを更新します。編集中の変更は含まれません。';
    if(!confirm(message))return;
    b.disabled=true;try{await mutate(action==='publish'?'POST':'PATCH',id,{seoTitle,publicSlug});state.drafts.delete(id);await refresh();toast(action==='publish'?'公開しました':'公開内容を更新しました')}catch(e){toast(`公開処理に失敗: ${e.message}`,true)}finally{b.disabled=false}
  }
  installStyles();ensurePublicIndexLink();ensurePageSettingsLink();ensureControls();refresh();
  const overlay=$('#note-overlay');if(overlay)new MutationObserver(()=>{if(noteOpen()){setTimeout(()=>{render();refresh()},0)}}).observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  let last='';setInterval(()=>{if(!noteOpen())return;const id=noteId();if(id!==last){last=id;render()}},350);
})();
