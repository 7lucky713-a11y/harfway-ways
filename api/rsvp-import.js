const NOTE=/^\/(?:[\w.-]+\/)?n\/n[0-9a-f]{8,32}\/?$/i;
export default async function handler(req,res){
  const send=(status,payload)=>{res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Robots-Tag","noindex,nofollow,noarchive");res.end(JSON.stringify(payload));};
  if(req.method!=="GET"){res.setHeader("Allow","GET");return send(405,{error:"GETのみ対応"});}
  let url;try{url=new URL(req.query?.url);}catch{return send(400,{error:"正しいnoteの記事URLを入力してください。"});}
  if(url.protocol!=="https:"||!["note.com","www.note.com"].includes(url.hostname)||url.port||url.username||url.password||!NOTE.test(url.pathname)||url.href.length>650)return send(400,{error:"公開note記事のURLにのみ対応しています。"});
  url.search="";url.hash="";
  try{
    const upstream=await fetch("https://r.jina.ai/"+url.href,{headers:{Accept:"application/json","X-Locale":"ja-JP"},signal:AbortSignal.timeout(22000),redirect:"error"});
    if(!upstream.ok)return send(upstream.status===429?503:502,{error:"本文を取得できませんでした。貼り付けモードをご利用ください。"});
    if(Number(upstream.headers.get("content-length")||0)>180000)return send(413,{error:"記事が長すぎます。"});
    const body=await upstream.text();
    if(body.length>180000)return send(413,{error:"記事が長すぎます。"});
    let json={};try{json=JSON.parse(body);}catch{}
    const doc=json.data||json;
    const raw=String(doc.content||doc.text||doc.markdown||body);
    const text=(raw.includes("Markdown Content:")?raw.split("Markdown Content:").slice(1).join("Markdown Content:"):raw).replace(/^Title:[^\n]*\nURL Source:[^\n]*\n?/,"").replace(/^Published Time:.*$/gm,"").replace(/^URL Source:.*$/gm,"").replace(/!\[[^\]]*\]\([^)]*\)/g,"").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").trim();
    if(text.length<80||/just a moment|access denied|ページが見つかりません/i.test(text.slice(0,350)))return send(422,{error:"記事の本文が見つかりません。公開記事か確認するか、本文を貼り付けてください。"});
    return send(200,{source:url.href,title:String(doc.title||raw.match(/^Title:\s*(.+)$/m)?.[1]||"noteの記事").slice(0,180),text:text.slice(0,95000)});
  }catch{return send(504,{error:"読み込みが完了しませんでした。少し待って再試行するか、本文を貼り付けてください。"});}
}