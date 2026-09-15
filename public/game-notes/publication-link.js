(() => {
  const API='/api/game-note-publications';
  const state={entries:new Map(),loading:false};
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
      .gn-publication{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-right:auto}
      .gn-publication-state{border:1px solid var(--line);border-radius:999px;padding:7px 9px;font:850 10px ui-monospace,monospace;letter-spacing:.06em;color:#859188;background:#111713}
      .gn-publication-state.on{border-color:#dff238;color:#111610;background:#dff238}
      .gn-publication button,.gn-publication a{border:1px solid var(--line2);background:#171d19;color:var(--text);border-radius:8px;padding:9px 11px;font-size:12px;font-weight:850;text-decoration:none;cursor:pointer}
      .gn-publication button.primary{background:#dff238;border-color:#dff238;color:#111610}.gn-publication button.danger{color:#d79b9b;border-color:#684b4b;background:#211616}
      .gn-publication button:disabled{opacity:.42;cursor:not-allowed}.gn-publication-help{width:100%;font-size:10px;color:var(--muted);line-height:1.5}
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
  function ensureControls(){
    const foot=$('#note-form .dialog-foot');if(!foot||$('#game-note-publication'))return;
    const root=document.createElement('div');root.id='game-note-publication';root.className='gn-publication';foot.prepend(root);root.addEventListener('click',onAction);render();
  }
  function current(){return state.entries.get(noteId())||null}
  function render(){
    ensureControls();const root=$('#game-note-publication');if(!root)return;const id=noteId(),pub=id?current():null;
    if(!id){root.innerHTML=`<span class="gn-publication-state">PUBLIC OFF</span><button type="button" disabled>保存後に公開</button><span class="gn-publication-help">新規メモは先に「保存する」でPrivate Noteとして確定してください。</span>`;return}
    if(pub){root.innerHTML=`<span class="gn-publication-state on">PUBLIC ON</span><button type="button" class="primary" data-public-action="update">公開内容を更新</button><a href="/notes/?note=${encodeURIComponent(id)}" target="_blank" rel="noopener">公開ページを見る ↗</a><button type="button" class="danger" data-public-action="remove">公開解除</button><span class="gn-publication-help">Private Noteの変更は自動反映されません。「公開内容を更新」を押した時だけsnapshotを更新します。</span>`}
    else{root.innerHTML=`<span class="gn-publication-state">PUBLIC OFF</span><button type="button" class="primary" data-public-action="publish">読者向けに公開</button><span class="gn-publication-help">現在の保存済み内容から公開snapshotを作ります。Private Note自体は公開されません。</span>`}
  }
  async function refresh(){
    if(state.loading)return;state.loading=true;try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)return;const d=await r.json();state.entries=new Map((d.entries||[]).map(x=>[String(x.id),x]));render()}catch{}finally{state.loading=false}
  }
  function toast(message,bad=false){let el=$('#publication-toast');if(!el){el=document.createElement('div');el.id='publication-toast';el.className='toast';document.body.appendChild(el)}el.textContent=message;el.style.background=bad?'#8d4848':'';el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),1900)}
  async function mutate(method,id){const r=await fetch(API,{method,headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({noteId:id}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`http_${r.status}`);return d}
  async function onAction(event){
    const b=event.target.closest('[data-public-action]');if(!b)return;event.preventDefault();const id=noteId();if(!id)return;
    const action=b.dataset.publicAction;
    if(action==='remove'){
      if(!confirm('読者向け公開を解除しますか？ Private Noteは残ります。'))return;
      b.disabled=true;try{await mutate('DELETE',id);await refresh();toast('公開を解除しました')}catch(e){toast(`公開解除に失敗: ${e.message}`,true)}finally{b.disabled=false}return;
    }
    const message=action==='publish'?'現在の保存済み内容を読者向けに公開します。編集中の変更がある場合は、先に「保存する」で確定してください。':'現在の保存済み内容で公開snapshotを更新します。編集中の変更は含まれません。';
    if(!confirm(message))return;b.disabled=true;try{await mutate(action==='publish'?'POST':'PATCH',id);await refresh();toast(action==='publish'?'公開しました':'公開内容を更新しました')}catch(e){toast(`公開処理に失敗: ${e.message}`,true)}finally{b.disabled=false}
  }
  installStyles();ensurePublicIndexLink();ensureControls();refresh();
  const overlay=$('#note-overlay');if(overlay)new MutationObserver(()=>{if(noteOpen()){setTimeout(()=>{render();refresh()},0)}}).observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  let last='';setInterval(()=>{if(!noteOpen())return;const id=noteId();if(id!==last){last=id;render()}},350);
})();
