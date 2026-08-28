const portal='https://harfway-ads-prototype.vercel.app/';
const html=await (await fetch(portal)).text();
const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(m=>m[1]);
const needles=['ep-damp-resonance-awphji1s','neonauth','rest/v1','neon-js','createAuthClient','createClient','authUrl','dataApiUrl'];
for(const src of srcs){
  const r=await fetch(new URL(src,portal));
  if(!r.ok) continue;
  const text=await r.text();
  for(const n of needles){
    let from=0,count=0;
    while(count<12){
      const i=text.indexOf(n,from); if(i<0) break;
      const s=text.slice(Math.max(0,i-700),Math.min(text.length,i+n.length+900)).replace(/\s+/g,' ');
      console.log(`[ADS_PORTAL_ENDPOINT] ${src} :: ${n} :: ${s}`);
      from=i+n.length; count++;
    }
  }
}
