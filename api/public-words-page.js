import gamesLiveHandler from './games-live.js';
import {
  PUBLIC_READER_CSS, absoluteUrl, escapeHtml, excerpt, formatJapaneseDate, isoDate,
  listPublicNotes, listPublicWords, publicDatabaseContext, publicWordId, safeUrl, seoHead,
  wordPublicSlug
} from '../lib/game-public-seo.js';

function queryValue(value=''){return String(Array.isArray(value)?value[0]:(value??'')).trim()}
function redirect(res,path){res.setHeader('Location',path);res.setHeader('Cache-Control','no-store');return res.status(308).end('Redirecting')}
function notFound(req,res){
  const title='用語解説が見つかりません｜HARF-WAY';
  const html=`<!doctype html><html lang="ja"><head>${seoHead(req,{title,description:'指定された用語解説は公開されていません。',path:'/words/'})}<style>${PUBLIC_READER_CSS}</style></head><body><main class="shell"><a class="back" href="/words/">← 用語解説一覧へ</a><div class="paper"><div class="empty">この用語は見つかりませんでした。</div></div></main></body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');return res.status(404).end(html);
}
async function loadWays(req){
  let status=200,payload=null;
  const capture={setHeader(){return this},status(code){status=Number(code)||200;return this},json(value){payload=value;return this},end(value){payload=value;return this}};
  try{await gamesLiveHandler({method:'GET',headers:req.headers||{},query:{}},capture);return status<400&&payload?.ok&&Array.isArray(payload.entries)?payload.entries:[]}catch{return[]}
}
function pageShell(head,body){return`<!doctype html><html lang="ja"><head>${head}<style>${PUBLIC_READER_CSS}</style></head><body>${body}</body></html>`}
function listItem(word){
  return`<a class="item word" href="${escapeHtml(word.url)}"><div class="item-meta"><span class="item-game">${escapeHtml(word.gameName||'共通 / ゲーム横断')}</span><time datetime="${escapeHtml(isoDate(word.publishedAt))}">${escapeHtml(formatJapaneseDate(word.publishedAt))}</time></div><h2>${escapeHtml(word.term||'無題')}</h2><p>${escapeHtml(excerpt(word.description,300))}</p><div class="item-foot">${word.relatedPublicNoteIds?.length?`<span>プレイノート ${word.relatedPublicNoteIds.length}件</span>`:''}${word.relatedWaysIds?.length?`<span>映像 ${word.relatedWaysIds.length}本</span>`:''}</div></a>`;
}
function mediaHtml(ways){
  if(!ways.length)return'';
  return`<section class="section"><h3>この用語に紐づく映像</h3><p>用語の理解に繋がるWAYS動画です。</p><div class="media-grid">${ways.map(item=>{const video=safeUrl(item.video),poster=safeUrl(item.thumbnailUrl);return`<article class="media">${video?`<video controls playsinline preload="metadata"${poster?` poster="${escapeHtml(poster)}"`:''} src="${escapeHtml(video)}"></video>`:''}<div class="caption"><strong>${escapeHtml(item.title||'WAYS')}</strong><a href="/?game=${encodeURIComponent(item.id)}">WAYSで見る →</a></div></article>`}).join('')}</div></section>`;
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end('Method Not Allowed');
  try{
    const {sql}=await publicDatabaseContext();
    const [notes,words]=await Promise.all([listPublicNotes(sql),listPublicWords(sql)]);
    const requestedId=publicWordId(queryValue(req.query?.id)||queryValue(req.query?.word));
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!requestedId){
      const title='用語解説｜HARF-WAY';
      const description='ゲームを遊びながら覚えた固有名詞や仕組みを、HARF-WAYのプレイ記録をもとにまとめた用語解説です。';
      const schema={'@context':'https://schema.org','@type':'DefinedTermSet',name:'HARF-WAY 用語解説',description,url:absoluteUrl(req,'/words/'),isPartOf:{'@type':'WebSite',name:'HARF-WAY',url:'https://harf-way.com/'}};
      const body=`<main class="shell"><section class="paper"><header class="head"><div class="head-top"><span>HARF-WAY</span><span>ゲームの中で拾ったことば</span></div><h1>用語解説</h1><p>ゲームを遊びながら覚えた固有名詞や仕組みを、自分なりの説明で残した小さな用語集です。辞典ではなく、遊んだ記録の延長として置いています。</p><div class="navline"><a href="/notes/">プレイノートを見る →</a><a href="https://harf-way.com/">HARF-WAY本体 →</a></div></header><div class="feed">${words.length?words.map(listItem).join(''):'<div class="empty">公開中の用語はまだありません。</div>'}</div></section><div class="foot">HARF-WAY / 用語解説</div></main>`;
      return res.status(200).end(pageShell(seoHead(req,{title,description,path:'/words/',type:'website',schema}),body));
    }
    const word=words.find(item=>item.id===requestedId);if(!word)return notFound(req,res);
    const canonicalSlug=wordPublicSlug(word),requestedSlug=queryValue(req.query?.slug);
    if(queryValue(req.query?.word)||!requestedSlug||requestedSlug!==canonicalSlug)return redirect(res,word.url);
    const relatedNotes=(word.relatedPublicNoteIds||[]).map(id=>notes.find(item=>item.id===id)).filter(Boolean);
    const relatedWords=(word.relatedPublicGlossaryIds||[]).map(id=>words.find(item=>item.id===id)).filter(Boolean);
    const waysCatalog=await loadWays(req),ways=(word.relatedWaysIds||[]).map(id=>waysCatalog.find(item=>String(item.id)===String(id))).filter(Boolean);
    const game=word.gameName&&word.gameName!=='共通 / ゲーム横断'?word.gameName:'';
    const description=excerpt(`${game?`${game}の「${word.term}」をHARF-WAYのプレイ記録から解説。`:`「${word.term}」をHARF-WAYのプレイ記録から解説。`}${word.description||''}`,158);
    const title=game?`${word.term||'用語'}とは？｜${game}の用語解説｜HARF-WAY`:`${word.term||'用語'}とは？｜HARF-WAY 用語解説`;
    const schema={'@context':'https://schema.org','@type':'DefinedTerm',name:word.term||'用語',description,url:absoluteUrl(req,word.url),inDefinedTermSet:{'@type':'DefinedTermSet',name:'HARF-WAY 用語解説',url:absoluteUrl(req,'/words/')},subjectOf:relatedNotes.map(note=>({'@type':'Article',name:`${note.gameName||''} ${note.title||''}`.trim(),url:absoluteUrl(req,note.url)}))};
    const noteSection=relatedNotes.length?`<section class="section"><h3>関連するプレイノート</h3><p>この用語が紐づいている、公開済みのプレイ記録です。</p><div class="related-list">${relatedNotes.map(note=>`<a class="related-link" href="${escapeHtml(note.url)}"><small>${escapeHtml(formatJapaneseDate(note.publishedAt))}</small><strong>${escapeHtml(note.title||'無題')}</strong><span>→</span></a>`).join('')}</div></section>`:'';
    const wordSection=relatedWords.length?`<section class="section"><h3>関連する用語</h3><div class="related-list">${relatedWords.map(item=>`<a class="related-link" href="${escapeHtml(item.url)}"><small>${escapeHtml(item.gameName||'共通')}</small><strong>${escapeHtml(item.term||'無題')}</strong><span>→</span></a>`).join('')}</div></section>`:'';
    const body=`<main class="shell"><a class="back" href="/words/">← 用語解説一覧へ</a><article class="paper"><header class="head"><div class="head-top"><span>HARF-WAY</span><span>用語解説</span></div><h1>${escapeHtml(word.term||'無題')}</h1><div class="navline"><a href="/notes/">プレイノートを見る →</a></div></header><div class="single"><div class="single-meta"><strong>${escapeHtml(word.gameName||'共通 / ゲーム横断')}</strong><time datetime="${escapeHtml(isoDate(word.publishedAt))}">${escapeHtml(formatJapaneseDate(word.publishedAt))}</time></div><section class="single-body"><p class="single-copy">${escapeHtml(word.description||'')}</p></section>${noteSection}${wordSection}${mediaHtml(ways)}</div></article><div class="foot">HARF-WAY / 用語解説</div></main>`;
    return res.status(200).end(pageShell(seoHead(req,{title,description,path:word.url,type:'article',schema}),body));
  }catch(error){
    console.error('[public-words-page]',error?.message||error);
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
    return res.status(error?.status||503).end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="robots" content="noindex"><title>用語解説 / TEMPORARILY UNAVAILABLE</title><body style="background:#171815;color:#fff;font-family:system-ui;padding:40px">用語解説を読み込めませんでした。</body></html>');
  }
}
