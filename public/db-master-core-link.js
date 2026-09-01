(()=>{
const KEY='hw-db-master-admin-key';
const state={payload:null,loading:false,chosen:new Map(),query:new Map(),simulated:new Map()};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const arr=v=>Array.isArray(v)?v:[];
const key=()=>sessionStorage.getItem(KEY)||'';
const style=document.createElement('style');
style.textContent=`
#coreLinkSummary{margin:0 0 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid #303033;background:#151517;border-radius:10px}
#coreLinkSummary b{font-size:12px;letter-spacing:.08em}.corelink-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:11px;border:1px solid #3b3b40;background:#202024}.corelink-chip.linked{border-color:#2f7857;color:#9ae6bd}.corelink-chip.inferred{border-color:#80652c;color:#f0cf7b}.corelink-chip.unlinked{border-color:#784144;color:#f1a3a8}.corelink-panel{display:grid;gap:12px}.corelink-status{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.corelink-card{border:1px solid #333338;background:#19191c;border-radius:10px;padding:12px}.corelink-card strong{display:block;font-size:15px;margin-bottom:4px}.corelink-meta{font-size:11px;color:#98989f;word-break:break-all}.corelink-articles{display:grid;gap:6px;margin-top:8px}.corelink-articles a{font-size:12px}.corelink-search{display:grid;grid-template-columns:1fr auto;gap:8px}.corelink-search input{width:100%;min-width:0}.corelink-results{display:grid;gap:6px;max-height:250px;overflow:auto}.corelink-result{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid #303035;background:#111114;border-radius:8px;padding:8px 10px}.corelink-result.on{border-color:#73737c}.corelink-result strong{font-size:12px;margin:0}.corelink-actions{display:flex;gap:8px;flex-wrap:wrap}.corelink-note{font-size:11px;line-height:1.55;color:#a4a4ac}.corelink-flash{padding:8px 10px;border-radius:8px;background:#202024;font-size:11px}.corelink-loading{padding:12px;color:#98989f;font-size:12px}
`;
document.head.appendChild(style);

async function api(options={}){
  const headers={'x-showcase-admin-key':key(),...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})};
  const response=await fetch('/api/db-master-core-link',{cache:'no-store',...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
function currentWayId(){return document.querySelector('#editor [data-k="id"]')?.value||''}
function currentItem(){const id=currentWayId();if(!id||!state.payload)return null;const base=arr(state.payload.items).find(x=>x.wayId===id)||null;if(!base)return null;const sim=state.simulated.get(id);return sim?{...base,...sim}:base}
function statusLabel(status){return status==='linked'?'確定済み':status==='inferred'?'自動推定':'未紐付け'}
function renderSummary(){
  const controls=document.querySelector('.controls');if(!controls||!state.payload)return;
  let node=document.querySelector('#coreLinkSummary');if(!node){node=document.createElement('div');node.id='coreLinkSummary';controls.insertAdjacentElement('afterend',node)}
  const items=arr(state.payload.items).map(x=>state.simulated.has(x.wayId)?{...x,...state.simulated.get(x.wayId)}:x);
  const counts=items.reduce((o,x)=>(o[x.linkStatus]=(o[x.linkStatus]||0)+1,o),{linked:0,inferred:0,unlinked:0});
  node.innerHTML=`<b>CORE LINK</b><span class="corelink-chip linked">● 確定 ${counts.linked}</span><span class="corelink-chip inferred">● 推定 ${counts.inferred}</span><span class="corelink-chip unlinked">● 未紐付け ${counts.unlinked}</span><span class="corelink-note">記事とWAYSはCore Game IDを中心に接続</span>`;
}
function articleHtml(game,item){
  const articles=arr(game?.articles||item?.articles);
  if(articles.length)return `<div class="corelink-articles">${articles.slice(0,5).map(a=>a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">記事：${esc(a.title||a.url)} ↗</a>`:`<span>${esc(a.title||'記事')}</span>`).join('')}</div>`;
  const url=game?.articleUrl||item?.coreArticleUrl||'';
  return url?`<div class="corelink-articles"><a href="${esc(url)}" target="_blank" rel="noopener">記事ページ ↗</a></div>`:`<div class="corelink-meta">サルベージ記事の紐付けなし</div>`;
}
function findGame(id){return arr(state.payload?.coreGames).find(g=>g.id===id)||null}
function candidates(item){
  const q=(state.query.get(item.wayId)||'').trim().toLowerCase();
  const games=arr(state.payload?.coreGames);
  if(!q)return games.filter(g=>g.id===item.coreGameId).slice(0,1);
  const tokens=q.split(/\s+/).filter(Boolean);
  return games.map(g=>{
    const hay=[g.title,g.id,g.storeUrl,g.articleUrl].join(' ').toLowerCase();
    const score=tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0)+(String(g.title||'').toLowerCase()===q?3:0);
    return {g,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(a.g.title).localeCompare(String(b.g.title),'ja')).slice(0,8).map(x=>x.g);
}
function renderPanel(flash=''){
  const editor=document.querySelector('#editor');if(!editor)return;
  const old=editor.querySelector('#coreLinkPanel');if(old)old.remove();
  const item=currentItem();if(!item||!state.payload)return;
  const section=document.createElement('section');section.className='formsection';section.id='coreLinkPanel';
  const chosenId=state.chosen.get(item.wayId)||item.coreGameId||'';
  const chosen=findGame(chosenId)||{id:chosenId,title:item.coreTitle||'',storeUrl:item.coreStoreUrl||'',articleUrl:item.coreArticleUrl||'',articles:item.articles||[]};
  const list=candidates(item);
  const mode=state.payload.previewDryRun?'Preview dry-run':state.payload.mode==='preview-core'?'Preview Core DB':'Production Core';
  section.innerHTML=`<div class="sectionhead"><b>CORE LINK</b><span>${esc(mode)}</span></div><div class="sectionbody corelink-panel">
    ${flash?`<div class="corelink-flash">${esc(flash)}</div>`:''}
    <div class="corelink-status"><span class="corelink-chip ${esc(item.linkStatus)}">● ${statusLabel(item.linkStatus)}</span><span class="corelink-note">${item.matchType==='steam-app-id'?'Steam App ID一致':item.matchType==='title'?'作品名一致':item.matchType==='ways-ref'?'WAYS ref':'候補なし'}${item.confidence?` / ${item.confidence}%`:''}</span></div>
    <div class="corelink-card"><strong>${esc(chosen?.title||'Core Game未選択')}</strong><div class="corelink-meta">${esc(chosen?.id||'—')}</div>${chosen?.storeUrl?`<div class="corelink-meta">${esc(chosen.storeUrl)}</div>`:''}${articleHtml(chosen,item)}</div>
    <div><div class="corelink-note" style="margin-bottom:6px">別のCore Gameを探す</div><div class="corelink-search"><input id="coreLinkSearch" value="${esc(state.query.get(item.wayId)||item.title||'')}" placeholder="作品名 / Steam URL / Core ID"><button class="btn" id="coreLinkSearchBtn" type="button">検索</button></div></div>
    <div class="corelink-results">${list.length?list.map(g=>`<div class="corelink-result ${g.id===chosenId?'on':''}"><div><strong>${esc(g.title)}</strong><div class="corelink-meta">${esc(g.id)}</div>${articleHtml(g,{})}</div><button class="btn mini" type="button" data-core-game="${esc(g.id)}">選ぶ</button></div>`).join(''):'<div class="corelink-note">検索候補がありません。</div>'}</div>
    <div class="corelink-actions"><button class="btn primary" id="coreLinkConfirm" type="button" ${chosenId?'':'disabled'}>${item.linkStatus==='linked'?'このリンクを更新':'このゲームに確定'}</button>${item.linkStatus==='linked'?'<button class="btn danger" id="coreLinkRemove" type="button">リンク解除</button>':''}</div>
    <div class="corelink-note">記事URLをWAYSへ直接ベタ付けするのではなく、Core Game IDを正本にします。これで同じゲームのサルベージ記事・WAYS・プレイリスト・切れ端を横断できます。</div>
  </div>`;
  editor.querySelector('.editorbody')?.prepend(section);
  section.querySelector('#coreLinkSearch')?.addEventListener('input',e=>{state.query.set(item.wayId,e.target.value)});
  const doSearch=()=>{state.query.set(item.wayId,section.querySelector('#coreLinkSearch')?.value||'');renderPanel()};
  section.querySelector('#coreLinkSearchBtn')?.addEventListener('click',doSearch);
  section.querySelector('#coreLinkSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch()}});
  section.querySelectorAll('[data-core-game]').forEach(btn=>btn.addEventListener('click',()=>{state.chosen.set(item.wayId,btn.dataset.coreGame);renderPanel()}));
  section.querySelector('#coreLinkConfirm')?.addEventListener('click',()=>link(item.wayId,state.chosen.get(item.wayId)||item.coreGameId));
  section.querySelector('#coreLinkRemove')?.addEventListener('click',()=>unlink(item.wayId));
}
async function link(wayId,coreGameId){
  if(!coreGameId)return;
  const game=findGame(coreGameId);
  if(!confirm(`WAYS「${currentItem()?.title||wayId}」を\nCore「${game?.title||coreGameId}」へ紐づけますか？`))return;
  try{
    const result=await api({method:'POST',body:JSON.stringify({wayId,coreGameId})});
    if(result.simulated){state.simulated.set(wayId,{linkStatus:'linked',matchType:'preview-simulated',confidence:100,coreGameId,coreTitle:game?.title||'',coreStoreUrl:game?.storeUrl||'',coreArticleUrl:game?.articleUrl||'',articles:game?.articles||[]});renderSummary();renderPanel('Preview確認のみです。Production DBは変更していません。');return}
    await load(true,'Core Linkを保存しました。');
  }catch(error){renderPanel(`保存失敗: ${error.message}`)}
}
async function unlink(wayId){
  if(!confirm('このWAYSのCore Linkを解除しますか？'))return;
  try{
    const result=await api({method:'DELETE',body:JSON.stringify({wayId})});
    if(result.simulated){state.simulated.set(wayId,{linkStatus:'unlinked',matchType:'preview-simulated',confidence:0,coreGameId:'',coreTitle:'',coreStoreUrl:'',coreArticleUrl:'',articles:[]});state.chosen.delete(wayId);renderSummary();renderPanel('Preview確認のみです。Production DBは変更していません。');return}
    await load(true,'Core Linkを解除しました。');
  }catch(error){renderPanel(`解除失敗: ${error.message}`)}
}
async function load(force=false,flash=''){
  if(state.loading||!key())return;
  if(state.payload&&!force){renderSummary();renderPanel(flash);return}
  state.loading=true;
  try{state.payload=await api();state.simulated.clear();renderSummary();renderPanel(flash)}catch(error){const editor=document.querySelector('#editor .editorbody');if(editor&&!document.querySelector('#coreLinkPanel')){const box=document.createElement('div');box.id='coreLinkPanel';box.className='corelink-loading';box.textContent=`CORE LINK取得失敗: ${error.message}`;editor.prepend(box)}}finally{state.loading=false}
}
let timer=0;
const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(currentWayId())load(false)},60)});
const start=()=>{
  const editor=document.querySelector('#editor');if(editor)observer.observe(editor,{childList:true,subtree:true});
  document.querySelector('#reload')?.addEventListener('click',()=>setTimeout(()=>load(true),400));
  if(currentWayId())load(false);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
