const portal='https://harfway-ads-prototype.vercel.app/';
const html=await (await fetch(portal)).text();
const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(m=>m[1]);
const needles=['file.size','.size>','5242880','10485760','20971520','MB','data_base64','media_size','size_bytes','FileReader','readAsDataURL','video/'];
for(const src of srcs){
  const r=await fetch(new URL(src,portal));
  if(!r.ok) continue;
  const text=await r.text();
  for(const n of needles){
    let from=0,count=0;
    while(count<5){
      const i=text.indexOf(n,from); if(i<0) break;
      const s=text.slice(Math.max(0,i-260),Math.min(text.length,i+n.length+320)).replace(/\s+/g,' ');
      console.log(`[ADS_PORTAL_AUDIT] ${src} :: ${n} :: ${s}`);
      from=i+n.length; count++;
    }
  }
}
