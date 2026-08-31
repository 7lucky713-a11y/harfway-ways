(()=>{
  const style=document.createElement('style');
  style.textContent=`
  .weekly-server-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:10px 0 12px;padding:10px;border:1px solid #4d571a;border-radius:10px;background:#11160c}
  .weekly-server-btn{border:1px solid #7d8a22;border-radius:9px;background:#eaff38;color:#090a0b;padding:9px 12px;font-size:10px;font-weight:950;letter-spacing:.03em;cursor:pointer}
  .weekly-server-btn:disabled{opacity:.45;cursor:wait}
  .weekly-server-note{font-size:9px;line-height:1.55;color:#aab49d}
  .weekly-server-title-pill{display:inline-flex;margin-left:8px;padding:4px 7px;border:1px solid #6e791d;border-radius:999px;background:#171d0d;color:#eaff38;font:900 8px/1 ui-monospace,monospace;letter-spacing:.08em}
  `;
  document.head.appendChild(style);

  const sourcePanel=[...document.querySelectorAll('.panel')].find(p=>p.querySelector('.paneltitle')?.textContent?.includes('SOURCE LIBRARY'));
  const sourceTitle=sourcePanel?.querySelector('.paneltitle');
  if(sourceTitle && !document.getElementById('weeklyServerPill')){
    const pill=document.createElement('span');
    pill.className='weekly-server-title-pill';
    pill.id='weeklyServerPill';
    pill.textContent='SERVER MONDAY';
    sourceTitle.appendChild(pill);
  }

  const actions=document.createElement('div');
  actions.className='weekly-server-actions';
  actions.innerHTML='<button type="button" class="weekly-server-btn" id="weeklyServerDraftBtn">月曜下書きをサーバー生成・保存</button><span class="weekly-server-note" id="weeklyServerDraftNote">対象期間内の切れ端はWEEKLY BOARDへ必ず全件追加。残りをWordPress / ヨリミチ候補から補完し、Preview専用R2へ保存します。X / WAYSは自動選択しません。</span>';
  const tabs=sourcePanel?.querySelector('.tabs');
  if(tabs)tabs.insertAdjacentElement('afterend',actions);
  else if(sourcePanel)sourcePanel.prepend(actions);
  else document.querySelector('.library')?.prepend(actions);

  const btn=document.getElementById('weeklyServerDraftBtn');
  const note=document.getElementById('weeklyServerDraftNote');

  async function importServerDraft(){
    if(!btn)return;
    btn.disabled=true;
    const before=btn.textContent;
    btn.textContent='生成・保存中…';
    if(note)note.textContent='対象期間内の切れ端を優先確保し、WordPress / ヨリミチからWEEKLY BOARDを生成してR2へ保存中…';
    try{
      const response=await fetch('/api/weekly-harfway-draft',{method:'POST',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);

      const known=new Set((items||[]).map(x=>x.id));
      const recommended=(data.draft?.updateIds||[]).filter(id=>known.has(id));
      const added=recommended.filter(id=>!updateIds.includes(id));
      updateIds=[...updateIds,...added];

      renderAll();
      try{saveLocal()}catch{}

      const missing=(data.draft?.updateIds||[]).length-recommended.length;
      const scrapsCount=Number(data.boardMeta?.scrapsCount||0);
      const detail=[
        `SERVER STORED ${data.week||''}`,
        data.range?.label||'',
        `切れ端 ${scrapsCount}件`,
        `BOARD +${added.length}件`,
        missing>0?`未一致 ${missing}件`:''
      ].filter(Boolean).join(' / ');
      if(note)note.textContent=`${detail}。対象期間内の切れ端は必須枠。Preview専用R2へ保存済み。X / WAYSは独立素材のため自動選択していません。`;
      btn.textContent='再生成・保存';
    }catch(err){
      if(note)note.textContent=`サーバー下書き生成・保存に失敗: ${String(err?.message||err)}`;
      btn.textContent=before;
    }finally{
      btn.disabled=false;
    }
  }

  btn?.addEventListener('click',importServerDraft);
})();
