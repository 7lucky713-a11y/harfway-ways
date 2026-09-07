(() => {
  const config = window.__SINGLE_GAME_KIT__;
  if (!config) return;
  const game = config.id;
  const API = `/api/single-game-kit?game=${encodeURIComponent(game)}`;
  const MEDIA_API = `/api/single-game-kit-media?game=${encodeURIComponent(game)}`;
  const ADMIN_KEY_STORAGE = `single_game_kit_admin_${game}`;
  const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);
  const VIDEO_TYPES = new Set(['video/mp4','video/webm']);
  let productionMode = false;
  let storageMode = '';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mediaKind = (type, url='') => String(type||'').startsWith('image/') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ? 'image' : (String(type||'').startsWith('video/') || /\.(mp4|webm)(\?|$)/i.test(url) ? 'video' : '');
  const mediaMarkup = (entry) => {
    const src = String(entry?.mediaUrl || '');
    if (!/^https?:\/\//i.test(src)) return '';
    const kind = mediaKind(entry.mediaType, src);
    if (kind === 'image') return `<img class="entry-media" src="${esc(src)}" alt="${esc(entry.title)}" loading="lazy">`;
    if (kind === 'video') return `<video class="entry-media" controls playsinline preload="metadata" src="${esc(src)}"></video>`;
    return '';
  };

  function storedAdminKey(){ try{return sessionStorage.getItem(ADMIN_KEY_STORAGE)||''}catch{return ''} }
  function clearAdminKey(){ try{sessionStorage.removeItem(ADMIN_KEY_STORAGE)}catch{} }
  function requireAdminKey(){
    if (!productionMode) return '';
    let key = storedAdminKey();
    if (!key) {
      key = String(window.prompt(`${config.siteName} 管理キーを入力してください`) || '').trim();
      if (key) try{sessionStorage.setItem(ADMIN_KEY_STORAGE,key)}catch{}
    }
    if (!key) throw new Error('管理キーが必要です。');
    return key;
  }
  function authHeaders(method){ if (method === 'GET' || method === 'HEAD') return {}; const key=requireAdminKey(); return key?{'X-Admin-Key':key}:{}; }
  function isAuthError(v){ return ['admin_key_required','invalid_admin_key','admin_auth_unavailable'].includes(String(v||'')); }
  function friendly(v){
    const m=String(v?.message||v||'unknown error');
    if(m==='preview_database_not_configured')return 'Preview DBが未接続です。';
    if(m==='database_identity_mismatch')return 'Preview DBの接続先が想定branchと一致しません。';
    if(m==='r2_write_permission_denied')return 'R2の書き込み権限がありません。';
    if(m==='image_too_large')return '画像は8MBまでです。';
    if(m==='video_too_large')return '動画は20MBまでです。';
    if(m==='unsupported_media_type')return 'JPEG / PNG / WebP / GIF / MP4 / WebMを選んでください。';
    if(m==='invalid_admin_key')return '管理キーが違います。';
    return m;
  }
  async function api(method='GET', body){
    const headers={...authHeaders(method)}; if(body)headers['Content-Type']='application/json';
    const r=await fetch(API,{method,cache:'no-store',headers,body:body?JSON.stringify({...body,game}):undefined});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.ok){if(isAuthError(data.error))clearAdminKey();throw new Error(data.error||`http_${r.status}`)}
    return data;
  }
  async function mediaApi(method='GET',action='',body){
    const url=`/api/single-game-kit-media?game=${encodeURIComponent(game)}${action?`&action=${encodeURIComponent(action)}`:''}`;
    const headers={...authHeaders(method)}; if(body)headers['Content-Type']='application/json';
    const r=await fetch(url,{method,cache:'no-store',headers,body:body?JSON.stringify({...body,game}):undefined});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.ok){if(isAuthError(data.error))clearAdminKey();throw new Error(data.error||`media_${r.status}`)}
    return data;
  }
  async function deleteMedia(key){ if(!key)return; await mediaApi('DELETE','',{key}); }
  async function uploadMedia(file,onProgress){
    const type=String(file?.type||'').toLowerCase(); const image=IMAGE_TYPES.has(type),video=VIDEO_TYPES.has(type);
    if(!image&&!video)throw new Error('unsupported_media_type');
    if(image&&file.size>8*1024*1024)throw new Error('image_too_large');
    if(video&&file.size>20*1024*1024)throw new Error('video_too_large');
    onProgress?.('アップロード準備中…');
    const started=await mediaApi('POST','start',{fileName:file.name,contentType:file.type,size:file.size});
    const chunkBytes=Number(started.chunkBytes||2500000),parts=Math.ceil(file.size/chunkBytes);
    for(let i=0;i<parts;i+=1){
      onProgress?.(`R2へ保存中… ${i+1}/${parts}`);
      const start=i*chunkBytes,end=Math.min(file.size,start+chunkBytes);
      const headers={'Content-Type':'application/octet-stream','X-Upload-Id':started.uploadId,'X-Part-Number':String(i+1),'X-Content-Type':file.type,'X-File-Size':String(file.size),...authHeaders('PUT')};
      const r=await fetch(MEDIA_API,{method:'PUT',cache:'no-store',headers,body:file.slice(start,end)}); const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok)throw new Error(data.error||`part_${i+1}_failed`);
    }
    onProgress?.('仕上げ中…');
    return mediaApi('POST','complete',{uploadId:started.uploadId,fileName:file.name,contentType:file.type,size:file.size,parts});
  }
  function applyEnvironment(data){storageMode=String(data?.storage||'');productionMode=data?.environment==='production'||storageMode==='shared-content-core';}
  function category(id){return config.categories.find((x)=>x.id===id)||{label:id,short:String(id).toUpperCase()};}

  async function initPublic(){
    const grid=document.getElementById('grid'),stats=document.getElementById('stats'); if(!grid||!stats)return;
    let entries=[]; try{const data=await api('GET');applyEnvironment(data);entries=data.entries||[];document.getElementById('storageLabel').textContent=`${productionMode?'Production Core':'Preview DB'} · ${data.branchId||''}`;}catch(e){grid.innerHTML=`<div class="empty">読み込みエラー：${esc(friendly(e))}</div>`;return;}
    let filter='all';
    function render(){
      stats.innerHTML=config.categories.map((c)=>`<div class="stat"><b>${entries.filter((x)=>x.type===c.id).length}</b><small>${esc(c.short)}</small></div>`).join('');
      const list=filter==='all'?entries:entries.filter((x)=>x.type===filter);
      grid.innerHTML=list.length?list.map((x)=>`<article class="card"><small>${esc(category(x.type).short)} / ${esc(x.createdAt)}</small><h3>${esc(x.title)}</h3>${mediaMarkup(x)}<p>${esc(x.memo)}</p><div class="tags">${[x.subject,x.role,...(x.tags||[])].filter(Boolean).map((t)=>`<span class="tag">${esc(t)}</span>`).join('')}</div></article>`).join(''):'<div class="empty">まだ記録はありません。</div>';
    }
    document.querySelectorAll('[data-filter]').forEach((b)=>b.onclick=()=>{filter=b.dataset.filter||'all';document.querySelectorAll('[data-filter]').forEach((x)=>x.classList.toggle('on',x===b));render();}); render();
  }

  async function initAdmin(){
    const form=document.getElementById('form'),list=document.getElementById('list'); if(!form||!list)return;
    const editId=document.getElementById('editId'),type=document.getElementById('type'),title=document.getElementById('title'),subject=document.getElementById('subject'),role=document.getElementById('role'),tags=document.getElementById('tags'),memo=document.getElementById('memo'),mediaFile=document.getElementById('mediaFile'),mediaStatus=document.getElementById('mediaStatus');
    let entries=[],r2Ready=false,currentMedia=null;
    function setStatus(msg,good=false){mediaStatus.textContent=msg;mediaStatus.className=`media-status${good?' good':''}`;}
    async function reload(){const data=await api('GET');applyEnvironment(data);entries=data.entries||[];renderList();document.getElementById('storageLabel').textContent=`${productionMode?'Production Core':'Preview DB'} · ${data.branchId||''}`;}
    try{await reload();const s=await mediaApi('GET');r2Ready=Boolean(s.configured);setStatus(r2Ready?`R2接続OK · ${s.r2Prefix}`:'R2未接続',r2Ready);}catch(e){setStatus(`接続エラー：${friendly(e)}`);}
    function clear(){editId.value='';form.reset();type.value=config.categories[0].id;currentMedia=null;document.getElementById('save').textContent='保存する';}
    function renderList(){list.innerHTML=entries.length?entries.map((x)=>`<div class="item"><small>${esc(category(x.type).label)} / ${esc(x.createdAt)}</small><h3>${esc(x.title)}</h3>${mediaMarkup(x)}<div class="item-actions"><button class="btn" data-edit="${esc(x.id)}">編集</button><button class="btn danger" data-del="${esc(x.id)}">削除</button></div></div>`).join(''):'<div class="empty">まだ記録はありません。</div>';
      list.querySelectorAll('[data-edit]').forEach((b)=>b.onclick=()=>{const x=entries.find((e)=>e.id===b.dataset.edit);if(!x)return;editId.value=x.id;type.value=x.type;title.value=x.title;subject.value=x.subject||'';role.value=x.role||'';tags.value=(x.tags||[]).join(', ');memo.value=x.memo;currentMedia={mediaUrl:x.mediaUrl||'',mediaKey:x.mediaKey||'',mediaType:x.mediaType||'',mediaSize:x.mediaSize||0,mediaName:x.mediaName||''};document.getElementById('save').textContent='更新する';window.scrollTo({top:0,behavior:'smooth'});});
      list.querySelectorAll('[data-del]').forEach((b)=>b.onclick=async()=>{const x=entries.find((e)=>e.id===b.dataset.del);if(!x||!confirm(`「${x.title}」を削除しますか？`))return;try{await api('DELETE',{id:x.id});if(x.mediaKey)await deleteMedia(x.mediaKey).catch(()=>{});await reload();}catch(e){alert(friendly(e));}});
    }
    form.onsubmit=async(e)=>{e.preventDefault();const save=document.getElementById('save');save.disabled=true;let uploaded=null;try{if(mediaFile.files?.[0]){if(!r2Ready)throw new Error('R2未接続です。');uploaded=await uploadMedia(mediaFile.files[0],setStatus);}const media=uploaded||currentMedia||{};await api(editId.value?'PATCH':'POST',{id:editId.value||undefined,type:type.value,title:title.value,memo:memo.value,subject:subject.value,role:role.value,tags:tags.value.split(',').map((x)=>x.trim()).filter(Boolean),...media,createdAt:new Date().toISOString().slice(0,10)});if(uploaded&&currentMedia?.mediaKey&&currentMedia.mediaKey!==uploaded.mediaKey)await deleteMedia(currentMedia.mediaKey).catch(()=>{});clear();await reload();setStatus('保存しました。',true);}catch(err){if(uploaded?.mediaKey)await deleteMedia(uploaded.mediaKey).catch(()=>{});setStatus(`エラー：${friendly(err)}`);}finally{save.disabled=false;}};
    document.getElementById('clearInputs').onclick=clear;
  }
  if(location.pathname.endsWith('/admin/')||location.pathname.endsWith('/admin'))initAdmin();else initPublic();
})();
