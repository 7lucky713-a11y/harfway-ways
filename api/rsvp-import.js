// Private personal reader. Only publicly published note.com articles, no cookies, drafts, or paywall bypass.
export const config = { maxDuration: 30 };
const NOTE_PATH = /^\/(?:[@\p{L}\p{N}_.-]+\/)?n\/(n[0-9a-f]{8,32})\/?$/iu;
const MAX_TEXT = 95000;
const MAX_REMOTE = 2400000;
const cache = new Map();

export function validateNoteUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 650) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' || !['note.com','www.note.com'].includes(u.hostname) || u.username || u.password || u.port || !NOTE_PATH.test(u.pathname)) return null;
    u.search=''; u.hash=''; return u.href;
  } catch { return null; }
}

function decodeEntities(s) {
  const map = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ldquo:'“',rdquo:'”',lsquo:'‘',rsquo:'’',hellip:'…',mdash:'—',ndash:'–',times:'×',bull:'•'};
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(m,k)=>{
    if(k[0]!=='#')return map[k.toLowerCase()]??m;
    const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
    return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
  });
}
function tagAttr(tag,name) {
  const re=new RegExp(String.raw`(?:\s|<)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`,'i');
  const m=re.exec(tag);return m?(m[1]??m[2]??m[3]):'';
}
function noteBody(html){
  const tags=/<div\b[^>]*>/gi;let match;
  while((match=tags.exec(html))){
    if(tagAttr(match[0],'data-name')!=='body'&&!/note-common-styles__textnote-body/.test(tagAttr(match[0],'class')))continue;
    let depth=1;const scan=/<\/?div\b[^>]*>/gi;scan.lastIndex=tags.lastIndex;let m;
    while((m=scan.exec(html))){depth+=/^<\/div/i.test(m[0])?-1:1;if(depth===0)return html.slice(tags.lastIndex,m.index);}
    return '';
  }return '';
}
function htmlToText(fragment){
  return decodeEntities(fragment
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<(?:script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|svg|noscript)>/gi,'')
    .replace(/<br\b[^>]*\/?\s*>/gi,'\n')
    .replace(/<\/\s*(?:p|div|h[1-6]|li|ul|ol|blockquote|section|article|pre)\s*>/gi,'\n')
    .replace(/<[^>]*>/g,'')
    .replace(/[ \t\u00a0]+\n/g,'\n')
    .replace(/\n\s*\n\s*\n/g,'\n\n').trim());
}
const inaccessible=text=>/just a moment|access denied|log in to continue|ログインしてください|ページが見つかりません|この記事は購入するまで読めません/i.test(text.slice(0,400));
export function parsePublicNoteApi(raw,url){
  let obj;try{obj=JSON.parse(raw);}catch{return null;}
  const doc=obj?.data;
  if(!doc||typeof doc!=='object'||(doc.status&&doc.status!=='published')||Number(doc.price||0)>0||doc.isPaid===true||doc.is_paid===true)return null;
  // Only the public document's body. Never access note_draft, paid separator, or editor endpoints.
  const body=typeof doc.body==='string'?doc.body:'';
  const text=htmlToText(body);
  if(text.length<80||inaccessible(text))return null;
  return{source:url,title:String(doc.name||doc.title||'noteの記事').slice(0,180),text:text.slice(0,MAX_TEXT),truncated:text.length>MAX_TEXT,method:'note-public-api'};
}
export function parseNoteHtml(html,url){
  const fragment=noteBody(html),text=fragment?htmlToText(fragment):'';
  if(text.length<80||inaccessible(text))return null;
  const meta=[...html.matchAll(/<meta\b[^>]*>/gi)],titleTag=meta.find(x=>['og:title','twitter:title'].includes(tagAttr(x[0],'property')||tagAttr(x[0],'name')));
  const title=decodeEntities(titleTag?tagAttr(titleTag[0],'content'):(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'noteの記事'));
  return{source:url,title:title.trim().slice(0,180)||'noteの記事',text:text.slice(0,MAX_TEXT),truncated:text.length>MAX_TEXT,method:'note-html'};
}
export function parseJina(body,url){
  let obj=null;try{obj=JSON.parse(body);}catch{}
  if(obj&&(Number(obj.code)>=400||obj.error))return null;
  const doc=obj?.data&&typeof obj.data==='object'?obj.data:obj;
  const raw=String(doc?.content||doc?.text||doc?.markdown||(obj?'':body));if(!raw)return null;
  const content=raw.includes('Markdown Content:')?raw.split('Markdown Content:').slice(1).join('Markdown Content:'):raw;
  const text=content.replace(/^Title:.*$/gm,'').replace(/^URL Source:.*$/gm,'').replace(/^Published Time:.*$/gm,'').replace(/^Content type:.*$/gm,'')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').trim();
  if(text.length<80||inaccessible(text))return null;
  const title=String(doc?.title||/^Title:\s*(.+)$/m.exec(raw)?.[1]||'noteの記事').slice(0,180);
  return{source:url,title,text:text.slice(0,MAX_TEXT),truncated:text.length>MAX_TEXT,method:'jina-fallback'};
}
async function limitedFetch(target,accept,maxMs,maxBytes){
  const response=await fetch(target,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(maxMs),headers:{Accept:accept,'Accept-Language':'ja,en;q=0.7'}});
  if(!response.ok||Number(response.headers.get('content-length')||0)>maxBytes)return null;
  const data=await response.text();return data.length<=maxBytes?data:null;
}
export default async function handler(req,res){
  const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex,nofollow,noarchive');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));};
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'GETのみ対応'});}
  const url=validateNoteUrl(req.query?.url);if(!url)return send(400,{error:'公開note記事のURLを入力してください。',code:'INVALID_NOTE_URL'});
  const saved=cache.get(url);if(saved&&Date.now()-saved.at<5*60*1000)return send(200,{...saved.article,cached:true});
  const articleKey=NOTE_PATH.exec(new URL(url).pathname)[1];
  const attempts=[];let article=null;
  try{const raw=await limitedFetch('https://note.com/api/v3/notes/'+articleKey,'application/json',5500,MAX_REMOTE);article=raw?parsePublicNoteApi(raw,url):null;attempts.push({method:'note-public-api',result:article?'ok':'unavailable'});}catch{attempts.push({method:'note-public-api',result:'unavailable'});}
  if(!article){try{const html=await limitedFetch(url,'text/html',5500,MAX_REMOTE);article=html?parseNoteHtml(html,url):null;attempts.push({method:'note-html',result:article?'ok':'unavailable'});}catch{attempts.push({method:'note-html',result:'unavailable'});}}
  if(!article){try{const raw=await limitedFetch('https://r.jina.ai/'+url,'application/json',8000,180000);article=raw?parseJina(raw,url):null;attempts.push({method:'reader-fallback',result:article?'ok':'unavailable'});}catch{attempts.push({method:'reader-fallback',result:'unavailable'});}}
  if(!article)return send(422,{error:'記事本文を取得できませんでした。noteの取得制限や記事形式が原因の可能性があります。本文貼り付けを使ってください。',code:'NOTE_IMPORT_FAILED',attempts,fallback:'paste'});
  if(cache.size>80)cache.clear();cache.set(url,{at:Date.now(),article});return send(200,article);
}