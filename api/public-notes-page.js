import gamesLiveHandler from './games-live.js';
import {
  PUBLIC_READER_CSS, absoluteUrl, escapeHtml, excerpt, formatJapaneseDate, isoDate,
  listPublicNotes, listPublicWords, notePublicSlug, publicDatabaseContext, publicNoteId,
  safeUrl, seoHead
} from '../lib/game-public-seo.js';

function queryValue(value=''){return String(Array.isArray(value)?value[0]:(value??'')).trim()}
function redirect(res,path){res.setHeader('Location',path);res.setHeader('Cache-Control','no-store');return res.status(308).end('Redirecting')}
function notFound(req,res){
  const title='プレイノートが見つかりません｜HARF-WAY';
  const html=`<!doctype html><html lang="ja"><head>${seoHead(req,{title,description:'指定されたプレイノートは公開されていません。',path:'/notes/'})}<style>${PUBLIC_READER_CSS}</style></head><body><main class="shell"><a class="back" href="/notes/">← プレイノート一覧へ</a><div class="paper"><div class="empty">このプレイノートは見つかりませんでした。</div></div></main></body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');return res.status(404).end(html);
}
async function loadWays(req){
  let status=200,payload=null;
  const capture={setHeader(){return this},status(code){status=Number(code)||200;return this},json(value){payload=value;return this},end(value){payload=value;return this}};
  try{await gamesLiveHandler({method:'GET',headers:req.headers||{},query:{}},capture);return status<400&&payload?.ok&&Array.isArray(payload.entries)?payload.entries:[]}catch{return[]}
}
function pageShell(head,body){return`<!doctype html><html lang="ja"><head>${head}<style>${PUBLIC_READER_CSS}</style></head><body>${body}</body></html>`}
function listItem(note){
  const ways=note.relatedWaysIds?.length||0;
  return`<a class="item" href="${escapeHtml(note.url)}"><div class="item-meta"><span class="item-game">${escapeHtml(note.gameName||'ゲーム名なし')}</span><time datetime="${escapeHtml(isoDate(note.publishedAt))}">${escapeHtml(formatJapaneseDate(note.publishedAt))}</time><span class="item-state">まだ途中</span></div><h2>${escapeHtml(note.title||'無題')}</h2><p>${escapeHtml(excerpt(note.body,320))}</p><div class="item-foot"><span>${escapeHtml(note.typeName||'メモ')}</span>${ways?`<span>映像 ${ways}本</span>`:''}</div></a>`;
}
function mediaHtml(ways){
  if(!ways.length)return'';
  return`<section class="section"><h3>このときの映像</h3><p>メモに紐づいているWAYS動画です。</p><div class="media-grid">${ways.map(item=>{const video=safeUrl(item.video),poster=safeUrl(item.thumbnailUrl);return`<article class="media">${video?`<video controls playsinline preload="metadata"${poster?` poster="${escapeHtml(poster)}"`:''} src="${escapeHtml(video)}"></video>`:''}<div class="caption"><strong>${escapeHtml(item.title||'WAYS')}</strong><a href="/?game=${encodeURIComponent(item.id)}">WAYSで見る →</a></div></article>`}).join('')}</div></section>`;
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end('Method Not Allowed');
  try{
    const {sql}=await publicDatabaseContext();
    const [notes,words]=await Promise.all([listPublicNotes(sql),listPublicWords(sql)]);
    const requestedId=publicNoteId(queryValue(req.query?.id)||queryValue(req.query?.note));
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!requestedId){
      const title='プレイノート｜HARF-WAY';
      const description='ゲームを遊びながら残した短いプレイ記録。考えがまとまり切る前の気づきも、そのまま読めるHARF-WAYのプレイノートです。';
      const schema={'@context':'https://schema.org','@type':'CollectionPage',name:'HARF-WAY プレイノート',description,url:absoluteUrl(req,'/notes/'),isPartOf:{'@type':'WebSite',name:'HARF-WAY',url:'https://harf-way.com/'}};
      const body=`<main class="shell"><section class="paper"><header class="head"><div class="head-top"><span>HARF-WAY</span><span>遊んでいる途中の記録</span></div><h1>プレイノート</h1><p>ゲームを遊びながら残した短いメモです。考えがまとまり切る前のことも、そのまま置いています。</p><div class="navline"><a href="/words/">用語解説を見る →</a><a href="https://harf-way.com/">HARF-WAY本体 →</a></div></header><div class="feed">${notes.length?notes.map(listItem).join(''):'<div class="empty">公開中のプレイノートはまだありません。</div>'}</div></section><div class="foot">HARF-WAY / プレイノート</div></main>`;
      return res.status(200).end(pageShell(seoHead(req,{title,description,path:'/notes/',type:'website',schema}),body));
    }
    const note=notes.find(item=>item.id===requestedId);if(!note)return notFound(req,res);
    const canonicalSlug=notePublicSlug(note),requestedSlug=queryValue(req.query?.slug);
    if(queryValue(req.query?.note)||!requestedSlug||requestedSlug!==canonicalSlug)return redirect(res,note.url);
    const relatedWords=words.filter(word=>Array.isArray(word.relatedPublicNoteIds)&&word.relatedPublicNoteIds.includes(note.id));
    const waysCatalog=await loadWays(req),ways=(note.relatedWaysIds||[]).map(id=>waysCatalog.find(item=>String(item.id)===String(id))).filter(Boolean);
    const description=excerpt(`${note.gameName||''}を遊びながら残したプレイノート。${note.body||''}`,158);
    const title=`${note.gameName||'ゲーム'}のプレイノート「${note.title||'無題'}」｜HARF-WAY`;
    const schema={'@context':'https://schema.org','@type':'BlogPosting',headline:`${note.gameName||'ゲーム'} ${note.title||'プレイノート'}`,description,url:absoluteUrl(req,note.url),datePublished:isoDate(note.publishedAt)||undefined,dateModified:isoDate(note.snapshotUpdatedAt)||undefined,about:note.gameName?{'@type':'Thing',name:note.gameName}:undefined,author:{'@type':'Organization',name:'HARF-WAY',url:'https://harf-way.com/'},publisher:{'@type':'Organization',name:'HARF-WAY',url:'https://harf-way.com/'},mainEntityOfPage:absoluteUrl(req,note.url)};
    const tags=relatedWords.length?`<div class="term-tags"><span class="term-tags-label">関連用語</span>${relatedWords.map(word=>`<a class="term-tag" href="${escapeHtml(word.url)}">${escapeHtml(word.term||'無題')}</a>`).join('')}</div>`:'';
    const body=`<main class="shell"><a class="back" href="/notes/">← プレイノート一覧へ</a><article class="paper"><header class="head"><div class="head-top"><span>HARF-WAY</span><span>プレイノート</span></div><h1>${escapeHtml(note.gameName||'プレイノート')}</h1><div class="navline"><a href="/words/">用語解説を見る →</a></div></header><div class="single"><div class="single-meta"><strong>${escapeHtml(note.gameName||'ゲーム名なし')}</strong><time datetime="${escapeHtml(isoDate(note.publishedAt))}">${escapeHtml(formatJapaneseDate(note.publishedAt))}</time><span>${escapeHtml(note.typeName||'メモ')}</span><span class="state">まだ途中</span></div><section class="single-body"><h2>${escapeHtml(note.title||'無題')}</h2><p class="single-copy">${escapeHtml(note.body||'')}</p></section>${tags}${mediaHtml(ways)}</div></article><div class="foot">HARF-WAY / プレイノート</div></main>`;
    return res.status(200).end(pageShell(seoHead(req,{title,description,path:note.url,type:'article',schema}),body));
  }catch(error){
    console.error('[public-notes-page]',error?.message||error);
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
    return res.status(error?.status||503).end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="robots" content="noindex"><title>プレイノート / TEMPORARILY UNAVAILABLE</title><body style="background:#171815;color:#fff;font-family:system-ui;padding:40px">プレイノートを読み込めませんでした。</body></html>');
  }
}
