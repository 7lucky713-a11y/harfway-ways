const PORTAL = 'https://harfway-ads-prototype.vercel.app/';

function clean(s='') {
  return s.replace(/\s+/g, ' ').slice(0, 700);
}

function contexts(text, needle, radius=220) {
  const out=[];
  let from=0;
  while(out.length<8){
    const i=text.indexOf(needle, from);
    if(i<0) break;
    out.push(clean(text.slice(Math.max(0,i-radius), Math.min(text.length,i+needle.length+radius))));
    from=i+needle.length;
  }
  return out;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Robots-Tag','noindex');
  if(process.env.VERCEL_ENV==='production') return res.status(404).json({ok:false,error:'preview_only'});
  try{
    const html=await (await fetch(PORTAL,{cache:'no-store'})).text();
    const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(m=>m[1]);
    const files=[];
    for(const src of srcs){
      const url=new URL(src,PORTAL).href;
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok) continue;
      const text=await r.text();
      const hits={};
      for(const n of ['file.size','.size>','1048576','5242880','10485760','20971520','MB','data_base64','media_size','size_bytes','FileReader','readAsDataURL','video/']){
        const c=contexts(text,n);
        if(c.length) hits[n]=c;
      }
      if(Object.keys(hits).length) files.push({src,hits});
    }
    return res.status(200).json({ok:true,scripts:srcs.length,files});
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
