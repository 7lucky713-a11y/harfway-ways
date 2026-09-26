(()=>{
  const API='/api/clip-publications';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const key=()=>sessionStorage.getItem('harfway_private_clips_key')||sessionStorage.getItem('harfway_game_notes_key')||'';
  const state={clips:[],entries:new Map(),editing:null,busy:false,urlDrafts:new Map()};
  const box=document.createElement('section');
  box.id='clip-publication';box.className='clip-publication';box.setAttribute('aria-label','公開設定');
  $('.capture .actions').after(box);
  const label='<span class="pub-label">プレイノートに公開</span>';
  const types=['短文','日記','エッセイ','ゲームの感想','その他'];
  const info=$('#capture .lead');
  if(info)info.textContent='タイトルだけでも保存OK。日記やエッセイの下書きも、ここから残せます。公開するときだけ、保存済みCLIPを選びます。';
  function notice(value,error=false){
    const toast=$('#toast');toast.textContent=value;toast.classList.toggle('bad',error);toast.classList.add('on');
    clearTimeout(toast._x);toast._x=setTimeout(()=>toast.classList.remove('on'),2400);
  }
  function activeEntry(){return state.editing?state.entries.get(state.editing.id):null}
  function draw(){
    const clip=state.editing,entry=activeEntry();
    if(!clip){
      box.innerHTML=`${label}<h2>公開は、保存したあとで。</h2><p>短いメモも日記も、必要なものだけプレイノートへ。既存のCLIPは勝手に公開されません。</p>`;
      return;
    }
    const selected=entry?.typeName||'短文';
    const draft=state.urlDrafts.has(clip.id)?state.urlDrafts.get(clip.id):(entry?.publicSlug||'');
    const latestUrl=entry?.url?`${entry.url}?latest=${encodeURIComponent(entry.updatedAt||'now')}`:'';
    box.innerHTML=`
      <div class="pub-heading"><div>${label}<h2>${entry?'公開中の文章':'このCLIPを公開する'}</h2></div>
        <span class="pub-state ${entry?'is-public':''}">${entry?'公開中':'非公開'}</span></div>
      <div class="pub-fields"><label>文章の種類<select id="clip-pub-type">${types.map(type=>`<option ${type===selected?'selected':''}>${esc(type)}</option>`).join('')}</select></label>
      <label class="pub-check"><input type="checkbox" id="clip-pub-tags" ${entry?.tags?.length?'checked':''}><span>タグも公開する</span></label></div>
      <div class="pub-url"><label for="clip-pub-slug">公開URLの末尾</label><div class="pub-url-input"><span>ways.harf-way.com/notes/</span><input id="clip-pub-slug" type="text" maxlength="110" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="空欄なら自動生成" value="${esc(draft)}" /></div><p>公開後も変更可能。以前のURLからは新しいURLへ転送します。</p></div>
      <div class="pub-preview"><small>公開前に確認</small><strong id="clip-pub-preview-title">${esc(clip.title)}</strong><p id="clip-pub-preview-body">${esc((clip.body||'').slice(0,210))}</p></div>
      <p class="pub-help">現在の<strong>保存済み内容</strong>から公開版を作ります。編集中の変更は先に「更新」で保存してください。画像は非公開のままです。</p>
      <div class="pub-actions"><button type="button" class="primary" data-clip-pub-action="${entry?'update':'publish'}">${entry?'公開内容を更新':'プレイノートに公開'}</button>
      ${entry?`<a href="${esc(latestUrl)}" target="_blank" rel="noopener">公開ページ ↗</a><button type="button" class="ghost" data-clip-pub-action="save-url">URLだけ保存</button><button type="button" class="danger" data-clip-pub-action="unpublish">公開解除</button>`:''}</div>`;
  }
  function updatePreview(){
    if(!state.editing)return;
    const title=$('#clip-title')?.value??'',body=$('#clip-body')?.value??'';
    const t=$('#clip-pub-preview-title'),b=$('#clip-pub-preview-body');
    if(t)t.textContent=title||'タイトル未入力';
    if(b)b.textContent=body.slice(0,210);
  }
  async function refresh(){
    try{
      const response=await fetch(API,{cache:'no-store'});
      if(!response.ok)throw new Error('公開情報の取得に失敗');
      const data=await response.json();state.entries=new Map((data.entries||[]).map(item=>[item.clipId,item]));
      for(const button of document.querySelectorAll('[data-clip-public-id]')){
        const entry=state.entries.get(button.dataset.clipPublicId);
        button.textContent=entry?'公開中・設定':'公開設定';
        button.classList.toggle('is-public',!!entry);
      }
      draw();
    }catch(error){notice(error.message,true)}
  }
  async function mutate(method,clipId,payload={}){
    const response=await fetch(API,{method,cache:'no-store',headers:{'x-admin-key':key(),'content-type':'application/json'},
      body:JSON.stringify({clipId,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'公開処理に失敗');
    await refresh();return result;
  }
  window.addEventListener('private-clips:loaded',event=>{state.clips=event.detail.clips||[];refresh()});
  window.addEventListener('private-clips:edit',event=>{state.editing=event.detail.clip||null;draw()});
  $('#clip-title')?.addEventListener('input',updatePreview);
  $('#clip-body')?.addEventListener('input',updatePreview);
  box.addEventListener('input',event=>{if(event.target.id==='clip-pub-slug'&&state.editing)state.urlDrafts.set(state.editing.id,event.target.value)});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-clip-public-id]');
    if(button){
      const edit=document.querySelector(`[data-edit="${CSS.escape(button.dataset.clipPublicId)}"]`);
      if(edit){edit.click();requestAnimationFrame(()=>box.scrollIntoView({behavior:'smooth',block:'center'}))}
      return;
    }
    const action=event.target.closest('[data-clip-pub-action]');if(!action||!state.editing||state.busy)return;
    const entry=activeEntry(),clipId=state.editing.id;
    const mode=action.dataset.clipPubAction;
    const prompt=mode==='unpublish'?'公開を解除しますか？ 非公開CLIPは残ります。':
      mode==='save-url'?'公開URLを保存しますか？ 古いURLからは新しいURLへ転送します。本文は変更されません。':
      mode==='publish'?'保存済みの内容をプレイノートに公開しますか？':'保存済みの内容で公開版を更新しますか？';
    if(!confirm(prompt))return;
    state.busy=true;box.classList.add('is-busy');
    try{
      const publicSlug=$('#clip-pub-slug')?.value.trim()||'';
      const payload=mode==='save-url'?{publicSlug}:{
        publicSlug,typeName:$('#clip-pub-type')?.value||'短文',includeTags:!!$('#clip-pub-tags')?.checked
      };
      const method=mode==='unpublish'?'DELETE':mode==='save-url'?'PUT':entry?'PATCH':'POST';
      await mutate(method,clipId,payload);
      state.urlDrafts.delete(clipId);
      notice(mode==='unpublish'?'公開を解除しました':mode==='save-url'?'URLを保存しました':entry?'公開内容を更新しました':'公開しました');
    }catch(error){
      const messages={
        public_slug_conflict:'このURLは別の公開記事で使われています。',
        historic_slug_reuse_forbidden:'以前使用したURLには戻せません。新しいURLを指定してください。',
        invalid_public_slug:'URLの末尾には日本語か英数字を含めてください。'
      };
      notice(messages[error.message]||error.message,true);
    }finally{state.busy=false;box.classList.remove('is-busy')}
  });
  draw();
})();
