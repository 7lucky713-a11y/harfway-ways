import gamesLiveHandler from './games-live.js';
import { DEFAULT_PLAY_NOTES_PAGE_SETTINGS, loadPlayNotesPageSettings } from '../lib/play-notes-page-settings.js';
import { absoluteUrl, escapeHtml, excerpt, formatJapaneseDate, isoDate, listPublicNotes, listPublicWords, notePublicPath, notePublicSlug, publicDatabaseContext, publicNoteId, safeUrl, seoHead } from '../lib/game-public-seo.js';

const BLOG_STYLE="\n:root{--bg:#faf9f5;--ink:#282923;--muted:#777a72;--rule:#dfded6;--accent:#476950;--soft:#eff2e9}\n*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,\"Hiragino Kaku Gothic ProN\",\"Noto Sans CJK JP\",\"Yu Gothic\",Meiryo,sans-serif;-webkit-font-smoothing:antialiased}button{font:inherit;color:inherit;cursor:pointer}a{color:inherit}.wrap{width:min(1100px,calc(100% - 56px));margin:auto}\n.sample{background:#eee9d9;color:#615b4d;padding:8px 16px;text-align:center;font-size:11px}.site-header{border-bottom:1px solid var(--rule)}.header-inner{max-width:1100px;margin:auto;min-height:74px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:10px;white-space:nowrap;font-size:13px}.brand a{text-decoration:none;font-size:22px;letter-spacing:-.055em;font-weight:900}.brand i{color:#b6b8ae;font-style:normal}.brand span{font-weight:700}.nav{display:flex;gap:23px;align-items:center}.nav a{text-decoration:none;color:#6b7066;font-size:12px;padding:12px 0}.nav a.active{color:var(--ink);font-weight:800;border-bottom:2px solid var(--accent)}.nav a:hover,.read-more:hover,.back:hover{text-decoration:underline;text-underline-offset:4px}\n.intro{padding:70px 0 63px;border-bottom:1px solid var(--rule)}.eyebrow{font-size:12px;color:var(--accent);font-weight:800;letter-spacing:.055em;margin:0 0 19px}.intro h1{font-size:clamp(42px,6vw,69px);line-height:1.2;letter-spacing:-.065em;margin:0;font-weight:850}.intro-copy{max-width:620px;margin:21px 0 0;line-height:2.05;font-size:15px;color:#676c63;white-space:pre-line}.content-layout{display:grid;grid-template-columns:minmax(0,730px) minmax(220px,255px);gap:70px;padding-top:56px;padding-bottom:85px}.section-heading{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid var(--ink);padding-bottom:14px}.section-heading h2{font-size:21px;letter-spacing:-.025em;margin:0}.section-heading span{font-size:11px;color:var(--muted)}.entry{padding:37px 0 40px;border-bottom:1px solid var(--rule)}.entry.featured{padding-top:43px}.meta{display:flex;align-items:center;flex-wrap:wrap;gap:11px;font-size:11px;color:var(--muted)}.game-label{background:var(--soft);border-radius:3px;color:var(--accent);font-weight:800;padding:6px 9px}.entry-link{text-decoration:none;text-align:left;display:block;margin:15px 0 14px}.entry h3{font-size:clamp(23px,2.8vw,30px);line-height:1.5;letter-spacing:-.04em;margin:0;font-weight:800}.entry-link:hover h3{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px}.entry>p{font-size:15px;line-height:2;color:#5b635b;margin:0 0 21px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:normal}.read-more{display:flex;align-items:center;gap:13px;text-decoration:none;color:var(--accent);font-size:13px;font-weight:800}.read-more span{font-size:19px}\n.side-block{border-top:2px solid var(--ink);padding:22px 0 33px;margin-bottom:24px}.side-label{color:var(--accent);font-size:10px;letter-spacing:.1em;font-weight:900;margin:0 0 20px}.side-block h2{font-size:19px;letter-spacing:-.035em;line-height:1.55;margin:0 0 13px}.side-block p:not(.side-label){color:#646c62;font-size:13px;line-height:2;margin:0;white-space:pre-line}.filter{display:grid;max-height:470px;overflow:auto}.filter button{border:0;border-bottom:1px solid var(--rule);background:none;padding:13px 2px;display:flex;justify-content:space-between;gap:10px;text-align:left;font-size:12px}.filter button span{font-size:11px;color:#a1a49b}.filter button.chosen{color:var(--accent);font-weight:800}.filter button:hover{text-decoration:underline}.side-link{text-decoration:none;display:flex;justify-content:space-between;font-size:13px;color:var(--accent);font-weight:800}.empty{font-size:13px;color:var(--muted);padding:30px 0;line-height:1.9}\n.article-wrap{max-width:820px}.back{display:inline-block;text-decoration:none;margin:37px 0 43px;color:var(--accent);font-weight:800;font-size:13px}.article{max-width:690px;margin:auto}.article-meta{margin-bottom:23px}.article h1{font-size:clamp(32px,4.4vw,46px);font-weight:850;line-height:1.5;letter-spacing:-.04em;margin:0 0 32px}.article-body{max-width:39em;font-size:17px;line-height:2.17;letter-spacing:.01em;overflow-wrap:anywhere}.article-body p{margin:0 0 1.65em}.end{border-top:1px solid var(--rule);padding-top:23px;margin-top:58px}.tags{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:#898d82}.term-tag{border:1px solid #ccd2c7;color:var(--accent);font-weight:750;padding:7px 11px;border-radius:3px;text-decoration:none}.term-tag:hover{background:var(--soft)}.bottom-nav{display:flex;justify-content:space-between;gap:15px;padding:30px 0;border-top:1px solid var(--rule);margin:64px 0 82px}.bottom-nav a{text-decoration:none;color:var(--accent);font-weight:800;font-size:13px}.bottom-nav a:hover{text-decoration:underline}\n.section{padding:32px 0 0}.section h2{font-size:19px;letter-spacing:-.02em;margin:0 0 10px}.section>p{font-size:12px;line-height:1.7;color:var(--muted);margin:0 0 18px}.media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.media{border:1px solid var(--rule);background:#f1f0e8;min-width:0}.media video{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#151515}.media .caption{padding:12px}.media strong{display:block;font-size:13px;line-height:1.5}.media a{display:inline-block;margin-top:9px;font-size:12px;color:var(--accent);font-weight:800}.related-notes{border-top:1px solid var(--rule)}.related-note{display:block;text-decoration:none;padding:15px 0;border-bottom:1px solid var(--rule);font-size:14px;line-height:1.65}.related-note small{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}.related-note:hover{text-decoration:underline}.site-footer{border-top:1px solid var(--rule);padding:26px 0 35px}.site-footer .wrap{display:flex;justify-content:space-between;gap:20px;font-size:11px;color:#91958a}.site-footer strong{font-size:13px;color:#566255}[hidden]{display:none!important}\n@media(max-width:850px){.content-layout{gap:34px;grid-template-columns:minmax(0,1fr) 218px}.nav{gap:12px}}\n@media(max-width:690px){.wrap{width:calc(100% - 38px)}.header-inner{padding:0 19px;min-height:60px;flex-wrap:wrap;gap:0}.brand a{font-size:20px}.brand span{font-size:12px}.nav{width:100%;gap:24px}.nav a{font-size:11px;padding:10px 0}.intro{padding:49px 0 43px}.intro h1{font-size:44px}.intro-copy{font-size:14px}.content-layout{grid-template-columns:1fr;gap:50px;padding-top:36px;padding-bottom:58px}.entry{padding:29px 0 33px}.entry h3{font-size:24px}.entry>p{font-size:14px}.back{margin:28px 0 34px}.article h1{font-size:31px}.article-body{font-size:16px;line-height:2.1}.media-grid{grid-template-columns:1fr}.bottom-nav{margin-bottom:65px}.site-footer .wrap{flex-wrap:wrap;gap:8px}}\n";

function queryValue(value=''){return String(Array.isArray(value)?value[0]:(value??'')).trim()}

function redirect(res,path){res.setHeader('Location',path);res.setHeader('Cache-Control','no-store');return res.status(301).end('Moved Permanently')}

function navHeader(demo=false){
 return `${demo?'<div class="sample">プレビュー用のサンプルです。実データには接続していません。</div>':''}<header class="site-header"><div class="header-inner"><div class="brand"><a href="https://harf-way.com/">HARF-WAY</a><i>/</i><span>プレイノート</span></div><nav class="nav" aria-label="サイト内メニュー"><a class="active" href="/notes/">プレイノート</a><a href="/words/">用語解説 ↗</a><a href="https://harf-way.com/">HARF-WAY ↗</a></nav></div></header>`;
}

function footerHtml(){return '<footer class="site-footer"><div class="wrap"><strong>HARF-WAY</strong><span>知らないゲームに、寄り道する。</span></div></footer>'}

function pageShell(head,body,{demo=false,filters=false}={}){
 const theme=head.replace('name="theme-color" content="#171815"','name="theme-color" content="#faf9f5"');
 const filterScript=filters?`<script>(()=>{const entries=[...document.querySelectorAll('.entry[data-game]')],buttons=[...document.querySelectorAll('[data-game-filter]')],empty=document.getElementById('filter-empty'),params=new URLSearchParams(location.search);function apply(game,replace){const matching=buttons.some(b=>b.dataset.gameFilter===game)?game:'all';for(const e of entries)e.hidden=matching!=='all'&&(matching==='__texts__'?Boolean(e.dataset.game):e.dataset.game!==matching);for(const b of buttons){const on=b.dataset.gameFilter===matching;b.classList.toggle('chosen',on);b.setAttribute('aria-pressed',String(on))}if(empty)empty.hidden=entries.some(e=>!e.hidden);if(replace){if(matching==='all')params.delete('game');else params.set('game',matching);history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():''))}}for(const b of buttons)b.addEventListener('click',()=>apply(b.dataset.gameFilter,true));apply(params.get('game')||'all',false)})();</script>`:'';
 return `<!doctype html><html lang="ja"><head>${theme}<style>${BLOG_STYLE}</style></head><body>${navHeader(demo)}${body}${footerHtml()}${filterScript}</body></html>`;
}

function noteUrl(note,demo=false){return `${note.url||'/notes/'}${demo?'?demo=1':''}`}

function listItem(note,i=0,demo=false){
 const url=escapeHtml(noteUrl(note,demo)),ways=note.relatedWaysIds?.length||0;
 const label=note.gameName||note.typeName||'短文';
 return `<article class="entry ${i===0?'featured':''}" data-game="${escapeHtml(note.gameName||'')}"><div class="meta"><span class="game-label">${escapeHtml(label)}</span><time datetime="${escapeHtml(isoDate(note.publishedAt))}">${escapeHtml(formatJapaneseDate(note.publishedAt))}</time>${note.gameName?`<span>${escapeHtml(note.typeName||'メモ')}</span>`:''}${ways?`<span>映像 ${ways}本</span>`:''}</div><a class="entry-link" href="${url}"><h3>${escapeHtml(note.seoTitle||note.title||'無題')}</h3></a><p>${escapeHtml(excerpt(note.body,310))}</p><a class="read-more" href="${url}">続きを読む <span aria-hidden="true">→</span></a></article>`;
}

function listSidebar(notes,settings){
 const counts=new Map();for(const n of notes){if(!n.gameName)continue;counts.set(n.gameName,(counts.get(n.gameName)||0)+1)}
 const items=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,20);
 const textCount=notes.filter(n=>!n.gameName).length;
 return `<aside class="sidebar"><section class="side-block"><p class="side-label">ABOUT</p><h2>${escapeHtml(settings.aboutTitle)}</h2><p>${escapeHtml(settings.aboutBody)}</p></section><section class="side-block"><p class="side-label">文章から探す</p><div class="filter"><button type="button" class="chosen" data-game-filter="all" aria-pressed="true">すべて <span>${notes.length}</span></button>${textCount?`<button type="button" data-game-filter="__texts__" aria-pressed="false">日記・エッセイ・短文 <span>${textCount}</span></button>`:''}${items.map(([g,count])=>`<button type="button" data-game-filter="${escapeHtml(g)}" aria-pressed="false">${escapeHtml(g)} <span>${count}</span></button>`).join('')}</div></section><section class="side-block"><p class="side-label">もっと読む</p><a class="side-link" href="/words/">用語解説へ <span>↗</span></a></section></aside>`;
}

function listBody(notes,settings,demo=false){
 return `<main><section class="intro wrap"><p class="eyebrow">${escapeHtml(settings.eyebrow)}</p><h1>プレイノート</h1><p class="intro-copy">${escapeHtml(settings.intro)}</p></section><div class="content-layout wrap"><section class="feed" aria-label="最近の記録"><div class="section-heading"><h2>最近の記録</h2><span>新しい順</span></div>${notes.length?notes.map((n,i)=>listItem(n,i,demo)).join(''):'<p class="empty">公開中のプレイノートはまだありません。</p>'}<p class="empty" id="filter-empty" hidden>このゲームの公開ノートはまだありません。</p></section>${listSidebar(notes,settings)}</div></main>`;
}

function bodyHtml(value){
 const parts=String(value||'').replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
 const render=s=>escapeHtml(s).replace(/\n/g,'<br>');
 return `<div class="article-body">${parts.map(s=>`<p>${render(s)}</p>`).join('')||'<p>本文はまだありません。</p>'}</div>`;
}

function mediaHtml(ways){
 if(!ways.length)return'';
 return `<section class="section" aria-label="このときの映像"><h2>このときの映像</h2><p>記録に紐づくWAYS動画です。</p><div class="media-grid">${ways.map(item=>{const video=safeUrl(item.video),poster=safeUrl(item.thumbnailUrl);return `<article class="media">${video?`<video controls playsinline preload="metadata"${poster?` poster="${escapeHtml(poster)}"`:''} src="${escapeHtml(video)}"></video>`:''}<div class="caption"><strong>${escapeHtml(item.title||'WAYS')}</strong><a href="/?game=${encodeURIComponent(item.id)}">WAYSで見る →</a></div></article>`}).join('')}</div></section>`;
}

function detailBody(note,relatedWords,ways,relatedNotes,demo=false){
 const body=bodyHtml(note.body);
 const terms=relatedWords.length?`<div class="tags"><span>関連する用語</span>${relatedWords.map(w=>`<a class="term-tag" href="${escapeHtml(w.url)}">${escapeHtml(w.term||'無題')}</a>`).join('')}</div>`:'';
 const clipTags=note.tags?.length?`<div class="tags"><span>タグ</span>${note.tags.map(tag=>`<span class="term-tag">${escapeHtml(tag)}</span>`).join('')}</div>`:'';
 const other=relatedNotes.length?`<section class="section"><h2>同じゲームの記録</h2><div class="related-notes">${relatedNotes.map(n=>`<a class="related-note" href="${escapeHtml(noteUrl(n,demo))}"><small>${escapeHtml(formatJapaneseDate(n.publishedAt))}</small>${escapeHtml(n.seoTitle||n.title||'無題')} →</a>`).join('')}</div></section>`:'';
 const listHref='/notes/'+(demo?'?demo=1':'');
 const gameHref=note.gameName?'/notes/?game='+encodeURIComponent(note.gameName)+(demo?'&demo=1':''):'/notes/?game=__texts__'+(demo?'&demo=1':'');
 const otherLabel=note.gameName?'同じゲームの記録を見る':'ほかの文章を読む';
 const label=note.gameName||note.typeName||'短文';
 return `<main class="wrap article-wrap"><a class="back" href="${listHref}">← プレイノートに戻る</a><article class="article"><div class="meta article-meta"><span class="game-label">${escapeHtml(label)}</span><time datetime="${escapeHtml(isoDate(note.publishedAt))}">${escapeHtml(formatJapaneseDate(note.publishedAt))}</time>${note.gameName?`<span>${escapeHtml(note.typeName||'メモ')}</span>`:''}</div><h1>${escapeHtml(note.seoTitle||note.title||'無題')}</h1>${body}<div class="end">${terms}${clipTags}${mediaHtml(ways)}${other}</div></article><nav class="bottom-nav" aria-label="記事の前後"><a href="${listHref}">← プレイノート一覧</a><a href="${escapeHtml(gameHref)}">${otherLabel} →</a></nav></main>`;
}

function previewDemoNotes(){
 const rows=[
 {id:'demo-playnote-one',gameName:'モンスタートレイン2',title:'たった一手の選択を、最後まで引きずっている。',typeName:'メモ',publishedAt:'2026-09-24T13:00:00+09:00',body:'序盤に何気なく選んだカードが、終盤になって思いも寄らない働きをする。\n\nそういう瞬間が好きで、つい同じデッキでもう一周してしまった。もちろん毎回うまくいくわけではない。それでも、この一枚にはまだ出番があるんじゃないかと思ってしまう。\n\nゲームの面白さって、選んだ瞬間ではなく、ずっと後から届くこともある。今日はそういう感覚を忘れないように書いておきたい。'},
 {id:'demo-playnote-two',gameName:'片道勇者',title:'立ち止まれない世界で、何を拾っていくか。',typeName:'プレイ記録',publishedAt:'2026-09-22T13:00:00+09:00',body:'先へ進まなければいけないのに、道端の小さな出来事が気になって仕方ない。\n\n立ち止まれば追いつかれてしまう。だから、ひとつひとつの選択が小さな決断になる。\n\n寄り道のできない世界を歩きながら、あえて寄り道のことを考えていた。'},
 {id:'demo-playnote-three',gameName:'RAM: Random Access Mayhem',title:'使い捨てるからこそ、動かすのが楽しい。',typeName:'アイデア',publishedAt:'2026-09-20T13:00:00+09:00',body:'「強くなる」ことを前提にしないアクション。\n\n敵へ乗り移るたびに、今度は何ができるのかを考える。その場の状況をどう使い切るかが面白い。'},
  {id:'clip-00000000-0000-4000-8000-000000000001',gameName:'',sourceKind:'clip',typeName:'日記',title:'言葉にしておきたかった一日',publicSlug:'clip-sample-diary-demo',tags:['日記'],publishedAt:'2026-09-19T13:00:00+09:00',body:'ゲームのことを考えていたはずなのに、気づいたら今日の出来事を書いていた。\n\nそういう寄り道も、ここなら残しておける。'},
 ];
 return rows.map((n,i)=>{const enhanced=i===0?{...n,seoTitle:'モンスタートレイン2｜カード選択の面白さを記録',publicSlug:'monster-train-2-card-notes'}:n;return {...enhanced,url:notePublicPath(enhanced),relatedWaysIds:[],snapshotUpdatedAt:n.publishedAt}});
}

function notFound(req,res){
 const title='プレイノートが見つかりません｜HARF-WAY';
 const html=pageShell(seoHead(req,{title,description:'指定されたプレイノートは公開されていません。',path:'/notes/'}),'<main class="wrap article-wrap"><a class="back" href="/notes/">← プレイノート一覧へ</a><p class="empty">このプレイノートは見つかりませんでした。</p></main>');
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');return res.status(404).end(html);
}

async function loadWays(req){
 let status=200,payload=null;
 const capture={setHeader(){return this},status(code){status=Number(code)||200;return this},json(value){payload=value;return this},end(value){payload=value;return this}};
 try{await gamesLiveHandler({method:'GET',headers:req.headers||{},query:{}},capture);return status<400&&payload?.ok&&Array.isArray(payload.entries)?payload.entries:[]}catch{return[]}
}

async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end('Method Not Allowed');
 const demo=process.env.VERCEL_ENV!=='production'&&queryValue(req.query?.demo)==='1';
 try{
  const ctx=demo?null:await publicDatabaseContext();
  const notes=demo?previewDemoNotes():await listPublicNotes(ctx.sql);
  const routePart=queryValue(req.query?.id)||queryValue(req.query?.note);const requestedId=publicNoteId(routePart);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control',demo?'no-store':'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(!requestedId){
   let settings=DEFAULT_PLAY_NOTES_PAGE_SETTINGS;
   if(demo){
     try{const previewContext=await publicDatabaseContext();settings=(await loadPlayNotesPageSettings(previewContext.sql)).settings}
     catch(error){console.warn('[public-notes-page] demo settings fallback:',error?.message||error)}
   }else settings=(await loadPlayNotesPageSettings(ctx.sql)).settings;
   const title='プレイノート｜HARF-WAY';
   const description='ゲームのプレイ記録から、日記、エッセイ、短い思いつきまで。書きかけの気づきを残す個人のテキストメディアです。';
   const schema={'@context':'https://schema.org','@type':'CollectionPage',name:'HARF-WAY プレイノート',description,url:absoluteUrl(req,'/notes/'),isPartOf:{'@type':'WebSite',name:'HARF-WAY',url:'https://harf-way.com/'}};
   return res.status(200).end(pageShell(seoHead(req,{title,description,path:'/notes/',type:'website',schema}),listBody(notes,settings,demo),{demo,filters:true}));
  }
  const legacyNote=notes.find(n=>n.id===requestedId);const note=legacyNote||notes.find(n=>notePublicSlug(n)===routePart||n.slugHistory?.includes(routePart));if(!note)return notFound(req,res);
  const canonicalSlug=notePublicSlug(note),requestedSlug=queryValue(req.query?.slug);
  if(queryValue(req.query?.note)||legacyNote||requestedSlug||routePart!==canonicalSlug)return redirect(res,noteUrl(note,demo));
  const words=demo?[]:await listPublicWords(ctx.sql);
  const relatedWords=words.filter(w=>Array.isArray(w.relatedPublicNoteIds)&&w.relatedPublicNoteIds.includes(note.id));
  const waysCatalog=demo?[]:await loadWays(req);
  const ways=(note.relatedWaysIds||[]).map(id=>waysCatalog.find(item=>String(item.id)===String(id))).filter(Boolean);
  const relatedNotes=notes.filter(n=>n.id!==note.id&&n.gameName&&n.gameName===note.gameName).slice(0,3);
  const description=excerpt(note.gameName?`${note.gameName}を遊びながら残したプレイノート。${note.body||''}`:`${note.typeName||'短文'}。${note.body||''}`,158);
  const title=note.seoTitle?`${note.seoTitle}｜HARF-WAY`:note.gameName?`${note.gameName}のプレイノート「${note.title||'無題'}」｜HARF-WAY`:`${note.title||'無題'}｜プレイノート｜HARF-WAY`;
  const schema={'@context':'https://schema.org','@type':'BlogPosting',headline:note.seoTitle||(note.gameName?`${note.gameName} ${note.title||'プレイノート'}`:note.title||'プレイノート'),description,url:absoluteUrl(req,note.url),datePublished:isoDate(note.publishedAt)||undefined,dateModified:isoDate(note.snapshotUpdatedAt)||undefined,about:note.gameName?{'@type':'Thing',name:note.gameName}:undefined,author:{'@type':'Organization',name:'HARF-WAY',url:'https://harf-way.com/'},publisher:{'@type':'Organization',name:'HARF-WAY',url:'https://harf-way.com/'},mainEntityOfPage:absoluteUrl(req,note.url)};
  return res.status(200).end(pageShell(seoHead(req,{title,description,path:note.url,type:'article',schema}),detailBody(note,relatedWords,ways,relatedNotes,demo),{demo}));
 }catch(error){
  console.error('[public-notes-page]',error?.message||error);
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
  return res.status(error?.status||503).end('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>プレイノート｜一時的に利用できません</title></head><body style="font-family:system-ui;background:#faf9f5;color:#282923;padding:40px;line-height:1.9"><p>プレイノートを読み込めませんでした。</p><a href="https://harf-way.com/">HARF-WAYに戻る →</a></body></html>');
 }
}

export default handler;
