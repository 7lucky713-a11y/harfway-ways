(() => {
  const CUSTOM_KEY='harfway_proofread_custom_rules_v1';
  const LONG_SENTENCE=140;
  const NEARBY_DISTANCE=36;
  const KINDS={typo:'誤字',duplicate:'重複',punctuation:'記号',notation:'表記',warning:'要確認',space:'空白',length:'長文',ending:'語尾'};
  const FIXED=[
    ['見つけれられ','見つけられ','typo','「れ」が重複している可能性があります。'],
    ['シュミレーション','シミュレーション','typo','一般的な表記は「シミュレーション」です。'],
    ['コミニュケーション','コミュニケーション','typo','一般的な表記は「コミュニケーション」です。'],
    ['コミニュティ','コミュニティ','typo','一般的な表記は「コミュニティ」です。'],
    ['うる覚え','うろ覚え','typo','一般的な表記は「うろ覚え」です。'],
    ['HARFWAY','HARF-WAY','notation','HARF-WAYのブランド表記に統一します。'],
    ['HARF WAY','HARF-WAY','notation','HARF-WAYのブランド表記に統一します。'],
    ['Wordpress','WordPress','notation','サービス名の公式表記は「WordPress」です。'],
    ['Github','GitHub','notation','サービス名の公式表記は「GitHub」です。'],
    ['Paypal','PayPal','notation','サービス名の公式表記は「PayPal」です。'],
    ['Youtube','YouTube','notation','サービス名の公式表記は「YouTube」です。']
  ];
  const REDUNDANT=[
    ['まず最初に','「まず」と「最初に」が重なっています。意図した強調でなければどちらか一方で十分です。'],
    ['一番最初','「一番」と「最初」が重なっています。強調でなければ整理できます。'],
    ['後で後悔','「後で」と「後悔」が近く、意味が重なる可能性があります。'],
    ['あらかじめ予約','「あらかじめ」と「予約」が重なる場合があります。文脈を確認してください。']
  ];
  const COLLOQUIAL=[
    ['食べれる','食べられる'],['見れる','見られる'],['来れる','来られる'],['起きれる','起きられる'],['出れる','出られる']
  ];
  const PARTICLES=[['がが','が'],['をを','を'],['にに','に'],['でで','で'],['へへ','へ']];
  const BRACKETS={'「':'」','『':'』','（':'）','(':')','【':'】','[':']','｛':'｝','{':'}'};
  const CLOSERS=Object.fromEntries(Object.entries(BRACKETS).map(([a,b])=>[b,a]));
  const ENDINGS=['と思う','と感じる','でした','です','ます','だった','である','になる','している','していた'];
  const STOP_WORDS=new Set(['ゲーム','プレイ','作品','今回','感じ','自分','ところ','こと','もの','ような','ため','かなり','とても']);
  const state={suggestions:[],activeIndex:-1,liveTimer:0};
  const $=(s,r=document)=>r.querySelector(s);

  function toast(msg,bad=false){
    const el=$('#toast');if(!el)return;
    el.textContent=msg;el.style.background=bad?'#8d4848':'';
    el.classList.add('on');clearTimeout(el._proofTimer);
    el._proofTimer=setTimeout(()=>{el.classList.remove('on');el.style.background=''},2200);
  }
  function safeRules(){
    try{
      const value=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');
      if(!Array.isArray(value))return[];
      return value.filter(x=>x&&typeof x.from==='string'&&typeof x.to==='string'&&x.from&&x.from!==x.to).slice(0,100);
    }catch{return[]}
  }
  function saveRules(rules){
    try{localStorage.setItem(CUSTOM_KEY,JSON.stringify(rules.slice(0,100)));return true}catch{return false}
  }
  function addRule(){
    const from=String(prompt('よく間違える表記を入力してください（例：HARFWAY）')||'').trim();
    if(!from)return;
    const to=String(prompt('正しい表記を入力してください（例：HARF-WAY）')||'').trim();
    if(!to||to===from)return;
    const rules=safeRules().filter(x=>x.from!==from);
    rules.push({from,to});
    if(saveRules(rules)){toast('校正辞書に追加しました');run()}
    else toast('辞書を保存できませんでした',true);
  }
  function removeRule(index){
    const rules=safeRules();if(index<0||index>=rules.length)return;
    rules.splice(index,1);saveRules(rules);toast('辞書から削除しました');run();
  }
  function add(list,item){
    const key=[item.field,item.start,item.end,item.after||'',item.reason||'',item.kind].join('|');
    if(item.start<0||item.end<item.start||list.some(x=>x._key===key))return;
    list.push({...item,_key:key});
  }
  function each(text,q,fn){
    let p=0;while(q&&p<=text.length){const i=text.indexOf(q,p);if(i<0)break;fn(i);p=i+Math.max(1,q.length)}
  }
  function fixed(field,text,list){
    [...FIXED,...safeRules().map(x=>[x.from,x.to,'notation','自分用の校正辞書に登録されている表記です。'])].forEach(([from,to,kind,reason])=>{
      each(text,from,start=>add(list,{field,kind,start,end:start+from.length,before:from,after:to,reason,actionable:true}));
    });
  }
  function duplicates(field,text,list){
    PARTICLES.forEach(([from,to])=>each(text,from,start=>add(list,{field,kind:'duplicate',start,end:start+from.length,before:from,after:to,reason:'同じ助詞が連続しています。入力時の重複なら1つにできます。',actionable:true})));
    [
      [/。{2,}/g,'。','句点'],[/、{2,}/g,'、','読点'],[/，{2,}/g,'，','全角カンマ'],[/．{2,}/g,'．','全角ピリオド']
    ].forEach(([regex,to,label])=>{
      regex.lastIndex=0;let m;
      while((m=regex.exec(text)))add(list,{field,kind:'punctuation',start:m.index,end:m.index+m[0].length,before:m[0],after:to,reason:label+'が連続しています。',actionable:true});
    });
  }
  function brackets(field,text,list){
    const stack=[];
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(BRACKETS[ch]){stack.push({ch,i});continue}
      if(!CLOSERS[ch])continue;
      const top=stack[stack.length-1],want=CLOSERS[ch];
      if(top?.ch===want){stack.pop();continue}
      add(list,{field,kind:'warning',start:i,end:i+1,before:ch,after:ch,reason:'対応する「'+want+'」が見つかりません。括弧の対応を確認してください。',actionable:false});
    }
    stack.forEach(x=>add(list,{field,kind:'warning',start:x.i,end:x.i+1,before:x.ch,after:x.ch,reason:'「'+x.ch+'」を閉じる「'+BRACKETS[x.ch]+'」が見つかりません。',actionable:false}));
    if((text.includes('(')||text.includes(')'))&&(text.includes('（')||text.includes('）'))){
      const i=Math.max(0,text.search(/[()（）]/));
      add(list,{field,kind:'warning',start:i,end:i+1,before:text[i]||'',after:text[i]||'',reason:'半角括弧と全角括弧が混在しています。意図した使い分けか確認してください。',actionable:false});
    }
  }
  function spaces(field,text,list){
    const repeated=/ {2,}/g;let m;
    while((m=repeated.exec(text)))add(list,{field,kind:'space',start:m.index,end:m.index+m[0].length,before:m[0],after:' ',reason:'半角スペースが連続しています。',actionable:true});
    const beforePunc=/ +(?=[。、！？!?」』）)】])/g;
    while((m=beforePunc.exec(text)))add(list,{field,kind:'space',start:m.index,end:m.index+m[0].length,before:m[0],after:'',reason:'句読点・閉じ括弧の直前に半角スペースがあります。',actionable:true});
    const trailing=/[ \t]+(?=\n|$)/g;
    while((m=trailing.exec(text)))add(list,{field,kind:'space',start:m.index,end:m.index+m[0].length,before:m[0],after:'',reason:'行末に不要な空白があります。',actionable:true});
    const full=/　{2,}/g;
    while((m=full.exec(text)))add(list,{field,kind:'warning',start:m.index,end:m.index+m[0].length,before:m[0],after:m[0],reason:'全角スペースが連続しています。レイアウト目的でなければ整理できます。',actionable:false});
  }
  function fullWidthNumbers(field,text,list){
    const re=/[０-９]+/g;let m;
    while((m=re.exec(text))){
      const after=m[0].replace(/[０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0));
      add(list,{field,kind:'notation',start:m.index,end:m.index+m[0].length,before:m[0],after,reason:'数字を半角に統一できます。',actionable:true});
    }
  }
  function redundancy(field,text,list){
    REDUNDANT.forEach(([q,reason])=>each(text,q,start=>add(list,{field,kind:'warning',start,end:start+q.length,before:q,after:q,reason,actionable:false})));
    COLLOQUIAL.forEach(([q,standard])=>each(text,q,start=>add(list,{field,kind:'warning',start,end:start+q.length,before:q,after:q,reason:'口語として意図的ならそのままでOKです。標準形の候補は「'+standard+'」です。',actionable:false})));
  }
  function punctuationWarnings(field,text,list){
    const re=/。、|、。/g;let m;
    while((m=re.exec(text)))add(list,{field,kind:'warning',start:m.index,end:m.index+m[0].length,before:m[0],after:m[0],reason:'句点と読点が連続しています。どちらを残すか確認してください。',actionable:false});
  }
  function sentenceWarnings(field,text,list){
    const re=/[^。！？!?\n]+[。！？!?]?/g;let m,sentences=[];
    while((m=re.exec(text))){
      const raw=m[0],trimmed=raw.trim();if(!trimmed)continue;
      const offset=m.index+raw.indexOf(trimmed);
      sentences.push({text:trimmed,start:offset,end:offset+trimmed.length});
      if(trimmed.length>=LONG_SENTENCE){
        add(list,{field,kind:'length',start:offset,end:offset+trimmed.length,before:trimmed,after:trimmed,reason:'一文が'+trimmed.length+'文字あります。長く感じる場合は区切れる場所がないか確認してください。',actionable:false});
      }
    }
    let last='',count=0;
    for(const s of sentences){
      const core=s.text.replace(/[。！？!?]+$/,'');
      const ending=ENDINGS.find(x=>core.endsWith(x))||'';
      if(ending&&ending===last)count+=1;else{last=ending;count=ending?1:0}
      if(ending&&count===3){
        add(list,{field,kind:'ending',start:Math.max(s.start,s.end-ending.length-1),end:s.end,before:s.text,after:s.text,reason:'「'+ending+'」系の語尾が3文続いています。意図したリズムならそのままでOKです。',actionable:false});
      }
    }
  }
  function nearbyRepeat(field,text,list){
    const tokenRe=/[一-龯々]{2,8}|[ァ-ヶー]{3,16}|[A-Za-z][A-Za-z0-9_-]{2,20}/g;
    const found=[];let m;
    while((m=tokenRe.exec(text)))found.push({token:m[0],start:m.index,end:m.index+m[0].length});
    for(let i=1;i<found.length;i++){
      const cur=found[i];
      for(let j=i-1;j>=0;j--){
        const prev=found[j];if(cur.start-prev.end>NEARBY_DISTANCE)break;
        if(cur.token===prev.token&&!STOP_WORDS.has(cur.token)){
          add(list,{field,kind:'warning',start:cur.start,end:cur.end,before:cur.token,after:cur.token,reason:'「'+cur.token+'」が近い範囲で繰り返されています。意図した反復か確認してください。',actionable:false});
          break;
        }
      }
    }
  }
  function markdownWarnings(field,text,list){
    const stars=(text.match(/\*\*/g)||[]);
    if(stars.length%2===1){
      const i=text.lastIndexOf('**');
      add(list,{field,kind:'warning',start:i,end:i+2,before:'**',after:'**',reason:'Markdownの太字「**」が閉じていない可能性があります。',actionable:false});
    }
    const ticks=(text.match(/(?<!`)\`(?!`)/g)||[]);
    if(ticks.length%2===1){
      const i=text.lastIndexOf('`');
      add(list,{field,kind:'warning',start:i,end:i+1,before:'`',after:'`',reason:'Markdownのインラインコード記号「`」が閉じていない可能性があります。',actionable:false});
    }
    const tags=['strong','em','b','i','a','span'];
    tags.forEach(tag=>{
      const opens=(text.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>','gi'))||[]).length;
      const closes=(text.match(new RegExp('</'+tag+'>','gi'))||[]).length;
      if(opens!==closes){
        const i=Math.max(0,text.toLowerCase().lastIndexOf('<'+tag));
        add(list,{field,kind:'warning',start:i,end:Math.min(text.length,i+tag.length+2),before:text.slice(i,Math.min(text.length,i+tag.length+2)),after:'',reason:'HTMLの<'+tag+'>タグの開始と終了の数が一致していません。',actionable:false});
      }
    });
  }
  function analyzeField(field,text){
    const list=[];
    fixed(field,text,list);duplicates(field,text,list);brackets(field,text,list);spaces(field,text,list);fullWidthNumbers(field,text,list);
    redundancy(field,text,list);punctuationWarnings(field,text,list);sentenceWarnings(field,text,list);nearbyRepeat(field,text,list);markdownWarnings(field,text,list);
    return list;
  }
  function analyze(){
    const title=String($('#note-title')?.value||''),body=String($('#note-body')?.value||'');
    return [...analyzeField('title',title),...analyzeField('body',body)]
      .sort((a,b)=>a.field!==b.field?(a.field==='title'?-1:1):a.start-b.start||a.end-b.end)
      .slice(0,80);
  }

  function styles(){
    if($('#game-note-proofread-styles'))return;
    const s=document.createElement('style');s.id='game-note-proofread-styles';
    s.textContent=`
      #proofread-note,#proofread-dict-add{border-color:#647064;color:#d6dfd6}
      #proofread-dict-add{padding-left:10px;padding-right:10px}
      .proofread-panel{grid-column:1/-1;display:none;border:1px solid #465147;border-radius:10px;background:#111713;overflow:hidden}.proofread-panel.on{display:block}
      .proofread-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-bottom:1px solid var(--line)}
      .proofread-head b{font:900 10px ui-monospace,monospace;letter-spacing:.08em;color:#c8d3c9}.proofread-head span{font-size:9px;color:var(--muted);line-height:1.5;text-align:right}
      .proofread-empty{padding:16px 13px;color:#88958a;font-size:11px;line-height:1.7}.proofread-list{display:grid}.proofread-item{padding:13px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .14s ease,box-shadow .14s ease}.proofread-item:hover{background:#151c17}.proofread-item.active{background:#171f18;box-shadow:inset 3px 0 #dff238}.proofread-item:last-child{border-bottom:0}
      .proofread-editor-wrap{position:relative;width:100%;border-radius:8px}.proofread-editor-wrap #note-body{position:relative;z-index:1}.proofread-backdrop{position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none;border:1px solid transparent;border-radius:8px;padding:10px;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;color:transparent;font:inherit;line-height:inherit}
      .proofread-mark{color:transparent;background:rgba(217,141,141,.13);border-bottom:2px wavy #d58d8d;pointer-events:auto;cursor:pointer;border-radius:2px}.proofread-mark.check{background:rgba(199,168,121,.10);border-bottom-color:#c7a879}.proofread-mark.active{background:rgba(223,242,56,.22);border-bottom-color:#dff238}
      .proofread-meta{display:flex;align-items:center;gap:7px;margin-bottom:8px}.proofread-kind{display:inline-flex;border:1px solid #5d6c60;border-radius:999px;padding:4px 7px;font:900 8px ui-monospace,monospace;color:#dff238}.proofread-field{font:800 8px ui-monospace,monospace;color:#758178}
      .proofread-change{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.proofread-text{border:1px solid var(--line);background:#171d19;border-radius:7px;padding:9px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.6}.proofread-arrow{color:#718078;font-weight:900}
      .proofread-reason{margin-top:8px;color:#869188;font-size:10px;line-height:1.6}.proofread-actions{display:flex;justify-content:flex-end;margin-top:9px}.proofread-actions button,.proofread-dict-row button{border:1px solid #607063;background:#1b241d;color:#dbe5dc;border-radius:7px;padding:7px 10px;font-size:10px;font-weight:900;cursor:pointer}
      .proofread-warning{font-size:10px;color:#c7a879;border:1px solid #665c45;border-radius:7px;padding:8px 10px;background:#1b1913}
      .proofread-dict{border-top:1px solid var(--line);padding:10px 13px}.proofread-dict-title{font:900 9px ui-monospace,monospace;color:#829087;margin-bottom:7px}.proofread-dict-row{display:flex;align-items:center;gap:8px;font-size:10px;color:#aeb9b0;padding:5px 0}.proofread-dict-row code{flex:1;overflow-wrap:anywhere}.proofread-dict-row button{padding:4px 7px}
      @media(max-width:700px){.proofread-change{grid-template-columns:1fr}.proofread-arrow{transform:rotate(90deg);justify-self:center}.proofread-head{align-items:flex-start;flex-direction:column}.proofread-head span{text-align:left}}
    `;
    document.head.appendChild(s);
  }

  function markerEls(){
    return {body:$('#note-body'),backdrop:$('#note-proofread-backdrop')};
  }
  function syncMarkerScroll(){
    const {body,backdrop}=markerEls();if(!body||!backdrop)return;
    backdrop.scrollTop=body.scrollTop;backdrop.scrollLeft=body.scrollLeft;
  }
  function ensureMarkerLayer(){
    const body=$('#note-body');if(!body)return;
    if($('#note-proofread-backdrop'))return;
    const wrap=document.createElement('div');wrap.className='proofread-editor-wrap';
    body.parentNode.insertBefore(wrap,body);wrap.appendChild(body);
    const backdrop=document.createElement('div');backdrop.id='note-proofread-backdrop';backdrop.className='proofread-backdrop';backdrop.setAttribute('aria-hidden','true');
    wrap.insertBefore(backdrop,body);
    body.addEventListener('scroll',syncMarkerScroll,{passive:true});
    if('ResizeObserver' in window)new ResizeObserver(syncMarkerScroll).observe(body);
  }
  function renderMarkers(){
    const {body,backdrop}=markerEls();if(!body||!backdrop)return;
    const text=String(body.value||'');backdrop.innerHTML='';
    const items=state.suggestions.map((s,index)=>({...s,index}))
      .filter(s=>s.field==='body'&&s.start>=0&&s.end>s.start&&s.start<text.length)
      .map(s=>({...s,end:Math.min(text.length,s.end)}));
    if(!items.length){backdrop.textContent=text+(text.endsWith('\n')?' ':'');syncMarkerScroll();return}
    const points=new Set([0,text.length]);items.forEach(s=>{points.add(s.start);points.add(s.end)});
    const ordered=[...points].sort((a,b)=>a-b);
    for(let i=0;i<ordered.length-1;i++){
      const start=ordered[i],end=ordered[i+1];if(end<=start)continue;
      const covered=items.filter(s=>s.start<end&&s.end>start);
      const value=text.slice(start,end);
      if(!covered.length){backdrop.appendChild(document.createTextNode(value));continue}
      const active=covered.some(s=>s.index===state.activeIndex);
      const chosen=covered.find(s=>s.index===state.activeIndex)||covered[0];
      const mark=document.createElement('mark');mark.className='proofread-mark'+(covered.some(s=>!s.actionable)?' check':'')+(active?' active':'');
      mark.dataset.proofreadMarker=String(chosen.index);mark.textContent=value;backdrop.appendChild(mark);
    }
    if(text.endsWith('\n'))backdrop.appendChild(document.createTextNode(' '));
    syncMarkerScroll();
  }
  function updateActiveUi(){
    document.querySelectorAll('.proofread-item[data-focus-proofread]').forEach(el=>el.classList.toggle('active',Number(el.dataset.focusProofread)===state.activeIndex));
    renderMarkers();
  }
  function focusSuggestion(index){
    const s=state.suggestions[index];if(!s)return;
    const field=fieldEl(s.field);if(!field)return;
    state.activeIndex=index;updateActiveUi();
    field.scrollIntoView({block:'center',behavior:'smooth'});
    try{field.focus({preventScroll:true})}catch{field.focus()}
    if(typeof field.setSelectionRange==='function')field.setSelectionRange(Math.max(0,s.start),Math.max(s.start,s.end));
  }
  function scheduleLiveRun(){
    const panel=$('#note-proofread-panel');if(!panel?.classList.contains('on'))return;
    clearTimeout(state.liveTimer);
    state.liveTimer=setTimeout(()=>{state.activeIndex=-1;state.suggestions=analyze();render()},260);
  }

  function ensureUi(){
    styles();const form=$('#note-form'),body=$('#note-body'),foot=$('#note-form .dialog-foot');if(!form||!body||!foot)return false;
    if(!$('#proofread-dict-add')){
      const b=document.createElement('button');b.type='button';b.className='ghost';b.id='proofread-dict-add';b.textContent='辞書＋';
      const cancel=foot.querySelector('[data-close="note"]');foot.insertBefore(b,cancel||$('#save-note'));b.addEventListener('click',addRule);
    }
    if(!$('#proofread-note')){
      const b=document.createElement('button');b.type='button';b.className='ghost';b.id='proofread-note';b.textContent='誤字脱字チェック';
      foot.insertBefore(b,$('#proofread-dict-add'));b.addEventListener('click',run);
    }
    if(!$('#note-proofread-panel')){
      const p=document.createElement('section');p.id='note-proofread-panel';p.className='proofread-panel';p.setAttribute('aria-live','polite');body.closest('label')?.insertAdjacentElement('afterend',p);
    }
    ensureMarkerLayer();body.setAttribute('spellcheck','true');return true;
  }
  function fieldEl(field){return field==='title'?$('#note-title'):$('#note-body')}
  function fieldLabel(field){return field==='title'?'タイトル':'本文'}
  function excerpt(text,start,end){
    const a=Math.max(0,start-12),b=Math.min(text.length,end+12);
    return (a?'…':'')+text.slice(a,b)+(b<text.length?'…':'');
  }
  function renderDictionary(panel){
    const rules=safeRules();if(!rules.length)return;
    const box=document.createElement('div');box.className='proofread-dict';
    const title=document.createElement('div');title.className='proofread-dict-title';title.textContent='MY DICTIONARY · '+rules.length+'件';box.appendChild(title);
    rules.forEach((r,i)=>{
      const row=document.createElement('div');row.className='proofread-dict-row';
      const code=document.createElement('code');code.textContent=r.from+' → '+r.to;
      const del=document.createElement('button');del.type='button';del.dataset.removeProofreadRule=String(i);del.textContent='削除';
      row.append(code,del);box.appendChild(row);
    });panel.appendChild(box);
  }
  function render(){
    const panel=$('#note-proofread-panel');if(!panel)return;panel.classList.add('on');panel.innerHTML='';
    const head=document.createElement('div');head.className='proofread-head';
    const strong=document.createElement('b');strong.textContent='PROOFREAD · '+state.suggestions.length+'件';
    const help=document.createElement('span');help.textContent='本文の下線をクリックすると該当箇所を選択。AI不使用・ブラウザ内だけで判定。';head.append(strong,help);panel.appendChild(head);
    if(!state.suggestions.length){const e=document.createElement('div');e.className='proofread-empty';e.textContent='登録済みルールに該当する問題は見つかりませんでした。';panel.appendChild(e);renderDictionary(panel);renderMarkers();return}
    const list=document.createElement('div');list.className='proofread-list';
    state.suggestions.forEach((s,index)=>{
      const field=fieldEl(s.field),text=String(field?.value||''),item=document.createElement('article');item.className='proofread-item'+(index===state.activeIndex?' active':'');item.dataset.focusProofread=String(index);
      const meta=document.createElement('div');meta.className='proofread-meta';
      const kind=document.createElement('span');kind.className='proofread-kind';kind.textContent=KINDS[s.kind]||'校正';
      const where=document.createElement('span');where.className='proofread-field';where.textContent=fieldLabel(s.field);meta.append(kind,where);item.appendChild(meta);
      if(s.actionable){
        const change=document.createElement('div');change.className='proofread-change';
        const before=document.createElement('div');before.className='proofread-text';before.textContent=excerpt(text,s.start,s.end);
        const arrow=document.createElement('span');arrow.className='proofread-arrow';arrow.textContent='→';
        const after=document.createElement('div');after.className='proofread-text';
        const next=text.slice(0,s.start)+s.after+text.slice(s.end);after.textContent=excerpt(next,s.start,s.start+s.after.length);change.append(before,arrow,after);item.appendChild(change);
      }else{
        const warn=document.createElement('div');warn.className='proofread-warning';warn.textContent=excerpt(text,s.start,s.end);item.appendChild(warn);
      }
      const reason=document.createElement('div');reason.className='proofread-reason';reason.textContent=s.reason;item.appendChild(reason);
      if(s.actionable){
        const acts=document.createElement('div');acts.className='proofread-actions';const b=document.createElement('button');b.type='button';b.dataset.applyProofread=String(index);b.textContent='この修正を反映';acts.appendChild(b);item.appendChild(acts);
      }
      list.appendChild(item);
    });panel.appendChild(list);renderDictionary(panel);renderMarkers();
  }
  function run(){
    if(!String($('#note-body')?.value||'').trim())return toast('先に本文を入力してください',true);
    clearTimeout(state.liveTimer);state.activeIndex=-1;state.suggestions=analyze();render();
  }
  function apply(index){
    const s=state.suggestions[index];if(!s?.actionable)return;
    const field=fieldEl(s.field),text=String(field?.value||'');if(!field)return;
    if(text.slice(s.start,s.end)!==s.before){toast('本文が変わったため、もう一度チェックしてください。',true);return run()}
    field.value=text.slice(0,s.start)+s.after+text.slice(s.end);field.dispatchEvent(new Event('input',{bubbles:true}));toast('修正を反映しました');run();
  }
  function reset(){clearTimeout(state.liveTimer);state.suggestions=[];state.activeIndex=-1;const p=$('#note-proofread-panel');if(p){p.classList.remove('on');p.innerHTML=''}renderMarkers()}
  function init(){
    if(!ensureUi())return;
    $('#note-proofread-panel')?.addEventListener('click',e=>{
      const applyButton=e.target.closest('[data-apply-proofread]');if(applyButton)return apply(Number(applyButton.dataset.applyProofread));
      const removeButton=e.target.closest('[data-remove-proofread-rule]');if(removeButton)return removeRule(Number(removeButton.dataset.removeProofreadRule));
      const item=e.target.closest('[data-focus-proofread]');if(item)return focusSuggestion(Number(item.dataset.focusProofread));
    });
    $('#note-proofread-backdrop')?.addEventListener('click',e=>{const mark=e.target.closest('[data-proofread-marker]');if(mark)focusSuggestion(Number(mark.dataset.proofreadMarker))});
    $('#note-body')?.addEventListener('input',scheduleLiveRun);$('#note-title')?.addEventListener('input',scheduleLiveRun);
    const overlay=$('#note-overlay');if(overlay){let was=overlay.classList.contains('on');new MutationObserver(()=>{const open=overlay.classList.contains('on');if(open&&!was)reset();was=open}).observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
