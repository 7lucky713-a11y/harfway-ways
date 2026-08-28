const portal='https://harfway-ads-prototype.vercel.app/';
const html=await (await fetch(portal)).text();
const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(m=>m[1]);
const needles=['file.size','.size>','3145728','10485760','MB','data_base64','media_size','size_bytes','FileReader','readAsDataURL','video/','neon.tech','rest/v1','getSession','access_token','session','auth.get'];
for(const src of srcs){
  const r=await fetch(new URL(src,portal));
  if(!r.ok) continue;
  const text=await r.text();
  const urls=[...new Set(text.match(/https:\/\/[^"'`\\)\s]+/g)||[])].filter(u=>u.includes('neon.tech')||u.includes('neonauth'));
  for(const u of urls) console.log(`[ADS_PORTAL_URL] ${u}`);
  for(const n of needles){
    let from=0,count=0;
    while(count<8){
      const i=text.indexOf(n,from); if(i<0) break;
      const s=text.slice(Math.max(0,i-320),Math.min(text.length,i+n.length+420)).replace(/\s+/g,' ');
      console.log(`[ADS_PORTAL_AUDIT] ${src} :: ${n} :: ${s}`);
      from=i+n.length; count++;
    }
  }
}
