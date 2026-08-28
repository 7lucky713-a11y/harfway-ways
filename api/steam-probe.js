export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const tests = [
    ['single','https://store.steampowered.com/api/appdetails?appids=620&cc=JP&l=japanese&filters=basic,price_overview'],
    ['multi','https://store.steampowered.com/api/appdetails?appids=620,400&cc=JP&l=japanese&filters=basic,price_overview']
  ];
  const out = [];
  for (const [name,url] of tests) {
    const started = Date.now();
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent':'Mozilla/5.0 HARF-WAY-Steam-Probe' }, cache: 'no-store' });
      const text = await r.text();
      out.push({ name, status:r.status, ok:r.ok, ms:Date.now()-started, body:text.slice(0,500) });
    } catch (e) {
      out.push({ name, status:null, ok:false, ms:Date.now()-started, error:e?.message || String(e) });
    }
  }
  return res.status(200).json({ ok:true, out });
}
