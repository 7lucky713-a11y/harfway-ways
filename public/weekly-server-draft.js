(()=>{
  const style=document.createElement('style');
  style.textContent=`
  .weekly-server-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
  .weekly-server-btn{border:1px solid #66711f;border-radius:9px;background:#171d0d;color:#eaff38;padding:8px 10px;font-size:9px;font-weight:900;letter-spacing:.04em;cursor:pointer}
  .weekly-server-btn:disabled{opacity:.45;cursor:wait}
  .weekly-server-note{font-size:9px;line-height:1.5;color:#8e99a4}
  `;
  document.head.appendChild(style);

  const autoBar=document.querySelector('.weekly-auto-bar');
  if(autoBar && !document.getElementById('weeklyServerPill')){
    const pill=document.createElement('span');
    pill.className='weekly-auto-pill on';
    pill.id='weeklyServerPill';
    pill.textContent='SERVER MONDAY';
    autoBar.appendChild(pill);
  }

  const saveStatus=document.getElementById('saveStatus');
  const actions=document.createElement('div');
  actions.className='weekly-server-actions';
  actions.innerHTML='<button type="button" class="weekly-server-btn" id="weeklyServerDraftBtn">月曜下書きをサーバー生成</button><span class="weekly-server-note" id="weeklyServerDraftNote">PreviewではDB保存せず、生成結果をこのブラウザへ取り込みます。</span>';
  if(saveStatus?.parentElement)saveStatus.parentElement.insertBefore(actions,saveStatus);
  else document.querySelector('.editor')?.prepend(actions);

  const btn=document.getElementById('weeklyServerDraftBtn');
  const note=document.getElementById('weeklyServerDraftNote');

  async function importServerDraft(){
    if(!btn)return;
    btn.disabled=true;
    const before=btn.textContent;
    btn.textContent='生成中…';
    if(note)note.textContent='WordPress / ヨリミチの先週分をサーバー側で確認中…';
    try{
      const response=await fetch('/api/weekly-harfway-draft',{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);

      const known=new Set((items||[]).map(x=>x.id));
      const recommended=(data.draft?.updateIds||[]).filter(id=>known.has(id));
      const added=recommended.filter(id=>!updateIds.includes(id));
      updateIds=[...updateIds,...added].slice(0,8);

      renderAll();
      try{saveLocal()}catch{}

      const missing=(data.draft?.updateIds||[]).length-recommended.length;
      const detail=[
        `SERVER DRAFT ${data.range?.label||''}`,
        `BOARD +${added.length}件`,
        missing>0?`未一致 ${missing}件`:''
      ].filter(Boolean).join(' / ');
      if(note)note.textContent=`${detail}。X / WAYSは独立素材のため自動選択していません。`;
      btn.textContent='再生成';
    }catch(err){
      if(note)note.textContent=`サーバー下書き生成に失敗: ${String(err?.message||err)}`;
      btn.textContent=before;
    }finally{
      btn.disabled=false;
    }
  }

  btn?.addEventListener('click',importServerDraft);
})();
